// Renders the caption track as a video with alpha (qtrle .mov), frame by frame
// from the same timeline the cut uses: node scripts/overlay.mjs <out.mov>
// Needs the built site served at FILM_URL (overlay.html).
//   node scripts/overlay.mjs --stills <dir> <seconds> ...   (PNG stills of the caption track)
import { spawn } from 'node:child_process';
import { openFilm } from './browser.mjs';
import { DURATION, FPS, SUPERS, WIPES, WIPE } from '../src/timeline.js';

const [out] = process.argv.slice(2);
if (!out) throw new Error('usage: node scripts/overlay.mjs <out.mov> | --stills <dir> <seconds> ...');
const URL_ = (process.env.FILM_URL ?? 'http://127.0.0.1:4173/') + 'overlay.html';
const { browser, page, errors } = await openFilm(URL_);
await page.evaluate(() => { document.documentElement.style.background = 'transparent'; document.body.style.background = 'transparent'; });

if (out === '--stills') {
  const [dir, ...times] = process.argv.slice(3);
  for (const t of times) {
    await page.evaluate((tt) => window.__pose(tt), Number(t));
    await page.screenshot({ omitBackground: true, path: `${dir}/overlay-${t}.png`, clip: { x: 0, y: 0, width: 1920, height: 1080 } });
  }
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log(`OVERLAY_STILLS_OK ${times.length} -> ${dir}`);
  process.exit(0);
}
const frames = Math.round(DURATION * FPS);
const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-', '-c:v', 'qtrle', '-pix_fmt', 'argb', out], { stdio: ['pipe', 'inherit', 'inherit'] });
const write = (buf) => new Promise((res) => (ff.stdin.write(buf) ? res() : ff.stdin.once('drain', res)));
let empty = null;
for (let f = 0; f < frames; f++) {
  const t = f / FPS;
  const live = SUPERS.some((s) => t > s.t0 - 0.05 && t < s.t1 + 0.05)
    || WIPES.some((w) => t > w.t - WIPE.hold / 2 - WIPE.in - 0.05 && t < w.t + WIPE.hold / 2 + WIPE.out + 0.05);
  if (!live && empty) { await write(empty); continue; }
  await page.evaluate((tt) => window.__pose(tt), t);
  const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: 1920, height: 1080 } });
  if (!live) empty = png;
  await write(png);
  if (f % 600 === 0) console.log(`overlay ${f}/${frames}`);
}
ff.stdin.end();
await new Promise((res) => ff.on('close', res));
await browser.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`OVERLAY_OK ${frames} frames -> ${out}`);
