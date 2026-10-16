// End-to-end check: loads dist/ into Playwright's Chromium, plays a real YouTube
// video and a Short, then reads what the extension stored.
//   npm run build && node scripts/e2e.mjs
import { chromium } from 'playwright';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const dist = resolve(import.meta.dirname, '../dist');
const out = resolve(import.meta.dirname, '../e2e-output');
const headless = !process.argv.includes('--headed');

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'tubestat-e2e-')), {
  channel: 'chromium',
  headless,
  viewport: { width: 1280, height: 860 },
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});

let [sw] = context.serviceWorkers();
sw ??= await context.waitForEvent('serviceworker');
const extId = sw.url().split('/')[2];
console.log('extension loaded:', extId);

const storage = () => sw.evaluate(() => chrome.storage.local.get(null));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function play(page, url, seconds) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // Decline the cookie banner if YouTube shows one.
  const reject = page.locator('button:has-text("Reject all")').first();
  if (await reject.isVisible({ timeout: 4000 }).catch(() => false)) await reject.click();
  await page.waitForSelector('video', { timeout: 30000 });
  for (let i = 0; i < seconds; i++) {
    await page.evaluate(() => {
      const v = document.querySelector('#shorts-player video, #movie_player video');
      if (v && v.paused) v.play().catch(() => {});
    });
    await sleep(1000);
  }
}

const page = context.pages()[0] ?? (await context.newPage());
console.log('playing a long-form video for 45s…');
await play(page, 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', 45);
console.log('playing a Short for 20s…');
await play(page, 'https://www.youtube.com/shorts', 20);
await page.goto('about:blank'); // triggers the pagehide flush
await sleep(2500);

const data = await storage();
const watches = Object.entries(data).filter(([k]) => k.startsWith('w:')).flatMap(([, v]) => Object.values(v));
console.log(`\nstored ${watches.length} viewing(s):`);
for (const w of watches) {
  console.log(`  ${w.isShort ? 'SHORT' : 'VIDEO'} ${w.videoId}  "${w.title}"  by ${w.channelName} (${w.channelId})`);
  console.log(`        watched ${w.watchedSeconds}s of ${w.duration}s, ${w.percentageWatched}% covered, category "${w.ytCategory}"`);
}
const channels = Object.values(data.channels ?? {});
console.log(`\nchannels: ${channels.map((c) => `${c.channelName} [subs ${c.subscriberCount ?? '?'}, avatar ${c.avatar ? 'yes' : 'no'}]`).join('; ')}`);

const dash = await context.newPage();
await dash.goto(`chrome-extension://${extId}/dashboard.html#/overview`);
await sleep(1500);
await dash.screenshot({ path: join(out, 'dashboard.png'), fullPage: true });
const popup = await context.newPage();
await popup.setViewportSize({ width: 340, height: 520 });
await popup.goto(`chrome-extension://${extId}/popup.html`);
await sleep(1000);
await popup.screenshot({ path: join(out, 'popup.png') });
console.log(`\nscreenshots in ${out}`);

const ok = watches.some((w) => !w.isShort && w.watchedSeconds > 10 && w.channelId) && watches.some((w) => w.isShort);
console.log(ok ? '\nPASS' : '\nFAIL');
await context.close();
process.exit(ok ? 0 : 1);
