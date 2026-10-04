// Renders a page into a take the cut can draw from, frame by frame: capture/<take>.mp4 and
// capture/<take>-manifest.txt, the same shape as a capture from a game. Every rendered page (the
// studio, the interface shots, the logo ident) exposes window.__shots ([{ name, duration }]) and
// window.__frame(index, seconds), which draws that moment of that shot. Each video frame is one
// call, so the take is smooth however long a frame takes to draw.
//
//   node scripts/render.mjs <page> <take> [--only a,b] [--gpu]       e.g. studio/ studio --gpu
//   node scripts/render.mjs <page> --stills <dir> <shot>:<seconds> ...
//
// Run `npx vite build` first: pages are served from dist/ by a private static server.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openFilm } from './browser.mjs';
import { serve } from './serve.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const FPS = 60;
const args = process.argv.slice(2);
const gpu = args.includes('--gpu');
const rest = args.filter((a) => a !== '--gpu');
const onlyAt = rest.indexOf('--only');
const only = onlyAt >= 0 ? rest.splice(onlyAt, 2)[1].split(',') : null;
const [pagePath, take, ...more] = rest;
if (!pagePath || !take) throw new Error('usage: node scripts/render.mjs <page> <take> [--only a,b] [--gpu] | <page> --stills <dir> <shot>:<s> ...');

const server = await serve();
const { browser, page, errors, renderer } = await openFilm(server.url + pagePath, { gpu });
if (renderer) console.log(`GPU: ${renderer}`);
const shots = await page.evaluate(() => window.__shots);
const finish = async (code) => { await browser.close(); await server.close(); if (errors.length) { console.error(errors.join('\n')); process.exit(1); } process.exit(code); };

if (take === '--stills') {
  const [dir, ...wants] = more;
  mkdirSync(dir, { recursive: true });
  for (const want of wants) {
    const [name, t] = want.split(':');
    const i = shots.findIndex((s) => s.name === name);
    if (i < 0) throw new Error(`no shot ${name}; shots: ${shots.map((s) => s.name).join(', ')}`);
    await page.evaluate(([s, tt]) => window.__frame(s, tt), [i, Number(t)]);
    await page.screenshot({ type: 'png', path: join(dir, `${name}-${t}.png`), clip: { x: 0, y: 0, width: 1920, height: 1080 } });
  }
  console.log(`STILLS_OK ${wants.length} -> ${dir}`);
  await finish(0);
}

if (only && only.some((n) => !shots.some((s) => s.name === n))) throw new Error(`--only names a shot the page does not have; shots: ${shots.map((s) => s.name).join(', ')}`);
mkdirSync(join(ROOT, 'capture'), { recursive: true });
const out = join(ROOT, `capture/${take}.mp4`);
const ff = spawn('nice', ['-n', '19', 'ffmpeg', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
  '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '10', '-x264-params', 'aq-mode=3:deadzone-inter=6:deadzone-intra=6',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', out], { stdio: ['pipe', 'inherit', 'inherit'] });
const done = new Promise((resolve, reject) => ff.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg exited ${c}`)))));
const write = (buf) => new Promise((resolve) => (ff.stdin.write(buf) ? resolve() : ff.stdin.once('drain', resolve)));
const cdp = await page.context().newCDPSession(page);
const manifest = [];
let written = 0;
const t0 = Date.now();
for (let i = 0; i < shots.length; i++) {
  if (only && !only.includes(shots[i].name)) continue;
  const frames = Math.round(shots[i].duration * FPS);
  manifest.push(`${shots[i].name} first=${written} frames=${frames}`);
  for (let f = 0; f < frames; f++) {
    await page.evaluate(([s, t]) => window.__frame(s, t), [i, f / FPS]);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 1 } });
    await write(Buffer.from(data, 'base64'));
    written++;
  }
  console.log(`${take} ${shots[i].name}: ${frames} frames (${(written / ((Date.now() - t0) / 1000)).toFixed(1)} fps)`);
}
ff.stdin.end();
await done;
writeFileSync(join(ROOT, `capture/${take}-manifest.txt`), manifest.join('\n') + '\n');
console.log(`RENDER_OK ${written} frames -> capture/${take}.mp4`);
await finish(0);
