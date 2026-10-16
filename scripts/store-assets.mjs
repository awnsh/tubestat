// Chrome Web Store images: 1280×800 screenshots (sample data), a 440×280 small
// promo tile and a 1400×560 marquee, written to store/.
//   npm run build && node scripts/store-assets.mjs
import { chromium } from 'playwright';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const out = resolve(root, 'store');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'tubestat-store-')), {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});
let [sw] = context.serviceWorkers();
sw ??= await context.waitForEvent('serviceworker');
const base = `chrome-extension://${sw.url().split('/')[2]}`;
for (const p of context.pages()) await p.close();
const page = await context.newPage();
await page.goto(`${base}/dashboard.html`);
await page.evaluate(() => localStorage.setItem('tubestat:preview-sample', '1'));

const shots = [
  ['overview', '1-overview.png', async () => { await page.locator('[role=tab]:has-text("Month")').click(); await page.mouse.move(5, 790); await sleep(800); }],
  ['creators/UCsamplekaixxxxxxxxxxx', '2-creator-history.png'],
  ['creators', '3-top-creators.png'],
  ['history', '4-history.png'],
  ['insights', '5-insights.png'],
];
for (const [hash, file, prep] of shots) {
  await page.goto(`${base}/dashboard.html#/${hash}`);
  await page.reload();
  // Hide the sample-data banner and settle animations for a clean frame.
  await page.addStyleTag({ content: 'main > div:first-child:has(> span > span) { display: none !important } *, *::before, *::after { animation: none !important; transition: none !important }' });
  await sleep(1500);
  if (prep) { await prep(); await sleep(1300); }
  await page.screenshot({ path: join(out, file) });
  console.log('saved', file);
}
await context.close();

// Promo images, drawn from the brand files.
const browser = await chromium.launch();
const promo = await browser.newPage({ deviceScaleFactor: 1 });
const logo = readFileSync(resolve(root, 'brand/tubestat-logo-on-dark.svg'), 'utf8');
const fonts = '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap" rel="stylesheet">';
async function tile(w, h, logoW, line, lineSize, file) {
  await promo.setViewportSize({ width: w, height: h });
  await promo.setContent(`<html><head>${fonts}<style>
    body{margin:0;width:${w}px;height:${h}px;background:#111113;color:#f2f0eb;font-family:Inter,sans-serif;display:flex;flex-direction:column;justify-content:center;padding:0 ${Math.round(w * 0.08)}px;box-sizing:border-box;overflow:hidden}
    .logo svg{width:${logoW}px;height:auto;display:block}
    p{margin:${Math.round(h * 0.07)}px 0 0;font-size:${lineSize}px;color:#a19f9a;max-width:${Math.round(w * 0.8)}px;line-height:1.35}
    .bar{position:absolute;left:0;right:0;bottom:0;height:${Math.max(6, Math.round(h * 0.025))}px;display:flex}
    .bar i{flex:1}
  </style></head><body><div class="logo">${logo}</div><p>${line}</p><div class="bar">${["#e9e7e1","#f5d90a","#2cd4e0","#3ddc84","#e0429a","#ff3040","#4d7cff"].map((c) => `<i style="background:${c}"></i>`).join("")}</div></body></html>`);
  await promo.waitForTimeout(800);
  await promo.screenshot({ path: join(out, file) });
  console.log('saved', file);
}
await tile(440, 280, 250, 'Your YouTube life, tracked.', 20, 'promo-small-440x280.png');
await tile(1400, 560, 620, 'Your YouTube life, tracked. Watch time, top creators, and how early you found them.', 34, 'promo-marquee-1400x560.png');
await browser.close();
