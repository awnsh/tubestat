// Captures marketing screenshots of the built extension (with sample data)
// into docs/assets for the GitHub Pages site.
//   npm run build && node scripts/screenshots.mjs
import { chromium } from 'playwright';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const dist = resolve(import.meta.dirname, '../dist');
const out = resolve(import.meta.dirname, '../docs/assets');
const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'tubestat-shots-')), {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});
let [sw] = context.serviceWorkers();
sw ??= await context.waitForEvent('serviceworker');
const base = `chrome-extension://${sw.url().split('/')[2]}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const p of context.pages()) await p.close();

const page = await context.newPage();
await page.goto(`${base}/dashboard.html`);
await page.evaluate(() => localStorage.setItem('tubestat:preview-sample', '1'));

async function shot(hash, file, { full = false, prep } = {}) {
  await page.goto(`${base}/dashboard.html#/${hash}`);
  await page.reload();
  await page.addStyleTag({ content: 'main > div:first-child:has(> span > span) { display: none !important } *, *::before, *::after { animation: none !important; transition: none !important }' });
  await sleep(1500);
  if (prep) { await prep(); await sleep(1300); }
  await page.screenshot({ path: join(out, file), fullPage: full });
  console.log('saved', file);
}

await shot('overview', 'overview.png', { prep: async () => { await page.locator('[role=tab]:has-text("Month")').click(); await sleep(500); } });
await shot('creators/UCsamplekaixxxxxxxxxxx', 'creator.png');
await shot('creators', 'creators.png');
await shot('history', 'history.png');
await shot('insights', 'insights.png', { prep: () => page.evaluate(() => window.scrollTo(0, document.querySelector('section')?.offsetTop ?? 0)) });
await shot('history/2026-08', 'wrapped.png', {
  prep: async () => {
    await page.locator('button:has-text("Play your")').click();
    await sleep(300);
    for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowRight');
    await sleep(700);
  },
});

const popup = await context.newPage();
await popup.setViewportSize({ width: 340, height: 470 });
await popup.goto(`${base}/popup.html`);
await sleep(1200);
await popup.addStyleTag({ content: '.grow-x { animation: none !important }' });
await popup.screenshot({ path: join(out, 'popup.png') });
console.log('saved popup.png');

// Share card, rendered by the real card renderer.
await page.goto(`${base}/dashboard.html#/history/2026-08`);
await page.reload();
await sleep(800);
await page.locator('button:has-text("Share")').first().click();
await page.waitForSelector('dialog[open] img');
const src = await page.locator('dialog[open] img').getAttribute('src');
const bytes = await page.evaluate(async (u) => Array.from(new Uint8Array(await (await fetch(u)).arrayBuffer())), src);
(await import('node:fs')).writeFileSync(join(out, 'share-card.png'), Buffer.from(bytes));
console.log('saved share-card.png');

await context.close();
