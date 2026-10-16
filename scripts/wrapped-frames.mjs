// Captures each Wrapped slide (sample data) for the website's Wrapped player.
//   npm run build && node scripts/wrapped-frames.mjs
import { chromium } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const dist = resolve(import.meta.dirname, '../dist');
const out = resolve(import.meta.dirname, '../docs/assets');
const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'tubestat-wrapped-')), {
  channel: 'chromium', headless: true, viewport: { width: 620, height: 620 }, deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});
let [sw] = context.serviceWorkers();
sw ??= await context.waitForEvent('serviceworker');
const base = `chrome-extension://${sw.url().split('/')[2]}`;
const page = await context.newPage();
await page.goto(`${base}/dashboard.html`);
await page.evaluate(() => localStorage.setItem('tubestat:preview-sample', '1'));
await page.goto(`${base}/dashboard.html#/history/2026-08`);
await page.reload();
await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important } [aria-label="Next"], [aria-label="Previous"] { display: none }' });
await page.waitForTimeout(800);
await page.locator('button:has-text("Play your")').click();
await page.waitForTimeout(400);
const count = await page.locator('[aria-label^="Slide "]').count();
// The website player uses these slides; the rest are skipped.
const keep = new Set([1, 2, 3, 4, 6, 7, 9]);
for (let i = 0; i < count; i++) {
  await page.locator(`[aria-label="Slide ${i + 1}"]`).click();
  await page.mouse.move(2, 2);
  await page.waitForTimeout(1500);
  const file = join(out, `wrapped-${i}.png`);
  if (keep.has(i)) await page.screenshot({ path: file, type: 'png' });
  else rmSync(file, { force: true });
}

console.log(`captured ${count} slides`);
await context.close();
