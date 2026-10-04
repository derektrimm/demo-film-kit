// Opens the caption page in headless Chromium. Captions are HTML and CSS, so any Chromium renders them:
// Playwright's own (npx playwright-core install chromium) or the executable named by CHROME.
import { chromium } from 'playwright-core';

export async function openFilm(url) {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME || undefined, args: ['--mute-audio', '--hide-scrollbars'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  return { browser, page, errors };
}
