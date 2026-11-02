/**
 * Reading youtube.com/feed/history from the background worker, so viewing on
 * your phone, TV and other browsers arrives without opening the page.
 *
 * The request goes only to youtube.com, with the browser's own YouTube
 * sign-in, exactly as if you opened the page. It reads the first screen of
 * the page (YouTube's most recent entries, a few days' worth); scrolling the
 * page yourself still brings in older ones. Profile → "Your phone and other
 * devices" turns both off.
 */
import { kvGet, kvSet } from '../storage/kv';
import { getSettings } from '../storage/db';
import { importHistory } from '../storage/mutations';
import { historyFromInitialData } from './history-data';

const BACKGROUND_EVERY_MS = 60 * 60_000;

export type HistoryReadResult =
  | { status: 'read'; added: number; seen: number }
  | { status: 'signed-out' | 'empty' | 'unreadable' };

/** Pulls `var ytInitialData = {...};` out of a YouTube page's HTML. */
export function initialDataOf(html: string): any | null {
  const m = html.match(/(?:var\s+ytInitialData|window\["ytInitialData"\])\s*=\s*(\{.+?\});\s*<\/script>/s);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

let running: Promise<HistoryReadResult> | null = null;

/** Fetches and imports the history page once. One run at a time. */
export function readHistoryNow(): Promise<HistoryReadResult> {
  if (running) return running;
  running = (async (): Promise<HistoryReadResult> => {
    const settings = await getSettings();
    if (!settings.trackingEnabled || !settings.syncHistoryPage) throw new Error('Reading your YouTube history is turned off in Profile.');
    await kvSet({ historyRun: Date.now() });
    const res = await fetch('https://www.youtube.com/feed/history', { credentials: 'include', cache: 'no-store' });
    if (!res.ok) throw new Error(`YouTube answered ${res.status}.`);
    const html = await res.text();
    if (!/"LOGGED_IN"\s*:\s*true/.test(html)) return { status: 'signed-out' };
    const data = initialDataOf(html);
    if (!data) return { status: 'unreadable' };
    const lang = html.match(/<html[^>]*\slang="([^"]+)"/)?.[1] ?? 'en';
    let items = historyFromInitialData(data, lang);
    // Signed in with nothing listed: history is paused, or empty.
    if (!items.length) return { status: 'empty' };
    if (!settings.trackShorts) items = items.filter((i) => !i.isShort);
    const added = await importHistory(items);
    return { status: 'read', added, seen: items.length };
  })().finally(() => (running = null));
  return running;
}

/** Called whenever the background worker wakes; reads the page about once an hour. */
export async function historyInBackground(): Promise<void> {
  const last = (await kvGet<number>('historyRun')) ?? 0;
  if (Date.now() - last < BACKGROUND_EVERY_MS) return;
  const s = await getSettings();
  if (!s.trackingEnabled || !s.syncHistoryPage) return;
  await readHistoryNow().catch(() => undefined);
}
