// Films a real tool with a web interface by driving it from a script, photographing it at 2x (a
// 1920x1080 layout at 3840x2160) so the shot page can move in close without blur.
//
//   node ui/record.mjs <script.json> <out dir>
//
// Frames land in <out dir> as NNNN-<name>.jpg (or .png for `png: true` snaps) with frames.json listing
// them in order; ui/shots.js plays them back. A script:
// {
//   "url": "http://127.0.0.1:3000/",            the tool (or "page": "ui/sample-app/" to serve a file here)
//   "colorScheme": "dark",
//   "hide": ["#dev-badge"],                     CSS selectors to hide on every frame (dev overlays)
//   "steps": [
//     { "snap": "start", "png": true },                       one frame
//     { "click": "text=New task" },                           any Playwright selector
//     { "type": "Make the sky golden", "into": "textarea", "every": 2 },   a frame every 2 characters
//     { "press": "Enter" },
//     { "wait": 800 },                                        milliseconds
//     { "watch": { "every": 0.5, "until": "text=Done", "max": 600, "name": "live" } },   a time-lapse
//     { "scroll": "bottom" }
//   ]
// }
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { serve } from '../scripts/serve.mjs';

const [scriptPath, dir] = process.argv.slice(2);
if (!scriptPath || !dir) throw new Error('usage: node ui/record.mjs <script.json> <out dir>');
const script = JSON.parse(readFileSync(scriptPath, 'utf8'));
mkdirSync(dir, { recursive: true });
const server = script.page ? await serve() : null;
const url = script.page ? server.url + script.page : script.url;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME || undefined, args: ['--hide-scrollbars'] });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, colorScheme: script.colorScheme ?? 'dark' });
const page = await context.newPage();
await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });

const frames = [];
const hide = () => (script.hide?.length ? page.addStyleTag({ content: `${script.hide.join(', ')} { display: none !important; }` }).catch(() => {}) : null);
const snap = async (name, png = false) => {
  await hide();
  const file = `${String(frames.length + 1).padStart(4, '0')}-${name}.${png ? 'png' : 'jpg'}`;
  await page.screenshot({ path: `${dir}/${file}`, type: png ? 'png' : 'jpeg', ...(png ? {} : { quality: 92 }) });
  frames.push(file);
  writeFileSync(`${dir}/frames.json`, JSON.stringify(frames, null, 1) + '\n');
};

for (const step of script.steps) {
  if (step.snap) await snap(step.snap, step.png);
  else if (step.click) await page.locator(step.click).first().click();
  else if (step.press) await page.keyboard.press(step.press);
  else if (step.wait) await page.waitForTimeout(step.wait);
  else if (step.scroll) await page.evaluate((to) => window.scrollTo(0, to === 'bottom' ? document.body.scrollHeight : Number(to)), step.scroll);
  else if (step.type !== undefined) {
    const box = page.locator(step.into).first();
    // The browser's spellchecker would underline names: that is the browser, not the tool.
    await box.evaluate((node) => { node.spellcheck = false; });
    await box.click();
    const every = step.every ?? 2;
    for (let i = 0; i < step.type.length; i++) {
      await page.keyboard.type(step.type[i]);
      if ((i + 1) % every === 0 || i === step.type.length - 1) await snap(`type-${String(i + 1).padStart(3, '0')}`);
    }
  } else if (step.watch) {
    const w = step.watch, deadline = Date.now() + (w.max ?? 600) * 1000;
    for (;;) {
      await page.waitForTimeout((w.every ?? 1) * 1000);
      await snap(w.name ?? 'live');
      if (w.until && await page.locator(w.until).count() > 0) break;
      if (Date.now() > deadline) throw new Error(`watch: ${w.until} never appeared`);
    }
  } else throw new Error(`unknown step ${JSON.stringify(step)}`);
}
await browser.close();
await server?.close();
console.log(`RECORD_OK ${frames.length} frames -> ${dir}`);
