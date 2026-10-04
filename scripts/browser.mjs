// Opens a page in headless Chromium at 1920x1080 and waits for it to say it is ready (window.__ready).
// Caption and interface pages are HTML and canvas, so any Chromium renders them: Playwright's own
// (npx playwright-core install chromium) or the executable named by CHROME.
//
// { gpu: true } is for WebGL pages (the studio and the logo ident). It asks for the real GPU and
// refuses software GL, which renders a studio scene many times slower; ALLOW_SOFTWARE_GL=1 accepts it.
import { chromium } from 'playwright-core';

export async function openFilm(url, { gpu = false } = {}) {
  const args = ['--mute-audio', '--hide-scrollbars'];
  if (gpu) args.push('--enable-gpu', '--ignore-gpu-blocklist', ...(process.platform === 'linux' ? ['--use-angle=vulkan', '--enable-features=Vulkan', '--disable-gpu-sandbox'] : []));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME || undefined, args });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true || window.__failed, null, { timeout: 120000 });
  const failed = await page.evaluate(() => window.__failed);
  if (failed) { await browser.close(); throw new Error(`${url}: ${failed}`); }
  let renderer = null;
  if (gpu) {
    renderer = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      return gl ? (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : 'none';
    });
    if (/swiftshader|llvmpipe|software|none/i.test(renderer) && !process.env.ALLOW_SOFTWARE_GL) {
      await browser.close();
      throw new Error(`software GL (${renderer}): the studio needs a GPU. Set ALLOW_SOFTWARE_GL=1 to render slowly anyway.`);
    }
  }
  return { browser, page, errors, renderer };
}
