/**
 * Past subscriber counts from the Internet Archive (web.archive.org).
 *
 * YouTube doesn't publish how big a channel used to be, but the Wayback
 * Machine has saved copies of popular channel pages going back to 2006, and
 * each copy shows the subscriber count of that day. For a subscription date,
 * TubeStat finds the saved copies closest to it and reads the count from the
 * channel's own header (never from the featured-channel boxes on the page).
 *
 * The result is always an estimate and is labelled with the snapshot date:
 * snapshots rarely fall on your exact day, and YouTube rounded counts on the
 * page from 2019 on. Small channels often have no snapshots at all.
 */
import { parseCount } from './parse';

const CDX = 'https://web.archive.org/cdx/search/cdx';
const DAY = 86_400_000;
/** A single snapshot this close to the date is used as is. */
const NEAR = 45 * DAY;
/** Two snapshots either side, each within this, are interpolated between. */
const BRACKET = 2 * 365 * DAY;

export interface ArchiveCount {
  count: number;
  /** When the snapshot(s) used were taken. */
  snapshots: number[];
  interpolated: boolean;
}

const tsOf = (t: number) => new Date(t).toISOString().replace(/[-:T]/g, '').slice(0, 14);
const timeOf = (ts: string) => Date.UTC(+ts.slice(0, 4), +ts.slice(4, 6) - 1, +ts.slice(6, 8), +ts.slice(8, 10), +ts.slice(10, 12), +ts.slice(12, 14));

/** Reads the channel's own subscriber count from a saved channel page, in any of YouTube's layouts since 2010. */
export function countFromPage(html: string, channelId: string): number | null {
  // 2017–2023: the header renderer in ytInitialData, which names the channel.
  const c4 = html.indexOf('"c4TabbedHeaderRenderer"');
  if (c4 >= 0) {
    const seg = html.slice(c4, c4 + 40_000);
    const id = seg.match(/"channelId":"(UC[\w-]+)"/)?.[1];
    if (!id || id === channelId) {
      // Only the value right inside this field: {"simpleText": …}, {"runs":[{"text": …}]}, optionally after an accessibility label.
      const m = seg.match(/"subscriberCountText":\{(?:"accessibility":\{"accessibilityData":\{"label":"[^"]*"\}\},)?(?:"simpleText":"([^"]+)"|"runs":\[\{"text":"([^"]+)")/);
      const text = m?.[1] ?? m?.[2];
      const n = parseCount(text);
      if (n != null) return n;
    }
  }
  // 2024 on: the page header view model lists "@handle • 1.2M subscribers • 300 videos".
  const phvm = html.indexOf('"pageHeaderViewModel"');
  if (phvm >= 0) {
    const seg = html.slice(phvm, phvm + 40_000);
    const part = [...seg.matchAll(/"content":"([^"]{1,60})"/g)].map((m) => m[1]).find((s) => /\d/.test(s) && /subscri/i.test(s));
    const n = parseCount(part);
    if (n != null) return n;
  }
  // Up to 2017: server-rendered HTML. The header button comes first; featured channels' buttons follow.
  const old = html.match(/subscriber-count-branded-horizontal[^>]*>\s*([\d][\d.,\s ]*)/);
  if (old) {
    const n = parseInt(old[1].replace(/[^\d]/g, ''), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

async function snapshotsNear(url: string, t: number): Promise<string[]> {
  const q = new URL(CDX);
  q.searchParams.set('url', url);
  q.searchParams.set('output', 'json');
  q.searchParams.set('fl', 'timestamp');
  q.searchParams.append('filter', 'statuscode:200');
  q.searchParams.append('filter', 'mimetype:text/html');
  q.searchParams.set('closest', tsOf(t));
  q.searchParams.set('sort', 'closest');
  q.searchParams.set('limit', '12');
  const res = await fetch(q, { credentials: 'omit' });
  if (!res.ok) throw new Error(`Internet Archive search failed (${res.status})`);
  const rows = (await res.json()) as string[][];
  return rows.slice(1).map((r) => r[0]);
}

async function countAtSnapshot(url: string, ts: string, channelId: string): Promise<number | null> {
  // "id_" asks for the page exactly as it was saved, without the Wayback toolbar.
  const res = await fetch(`https://web.archive.org/web/${ts}id_/${url}`, { credentials: 'omit' });
  if (!res.ok) return null;
  return countFromPage(await res.text(), channelId);
}

/**
 * The channel's subscriber count around time `t`, or null when the archive
 * has nothing close enough. Tries the /channel/ address, then the @handle.
 */
export async function archiveCountAt(channelId: string, handle: string | null, t: number): Promise<ArchiveCount | null> {
  const urls = [`https://www.youtube.com/channel/${channelId}`, ...(handle ? [`https://www.youtube.com/${handle}`] : [])];
  for (const url of urls) {
    const near = (await snapshotsNear(url, t)).map((ts) => ({ ts, t: timeOf(ts) }));
    if (!near.length) continue;
    const read = async (s: { ts: string; t: number }) => ({ ...s, count: await countAtSnapshot(url, s.ts, channelId) });

    // One snapshot close to the date: use it.
    const closest = near[0];
    if (Math.abs(closest.t - t) <= NEAR) {
      const r = await read(closest);
      if (r.count != null) return { count: r.count, snapshots: [r.t], interpolated: false };
    }
    // Otherwise the nearest readable snapshot on each side, interpolated by date.
    const before = near.filter((s) => s.t <= t && t - s.t <= BRACKET).slice(0, 2);
    const after = near.filter((s) => s.t > t && s.t - t <= BRACKET).slice(0, 2);
    let lo: Awaited<ReturnType<typeof read>> | null = null;
    let hi: Awaited<ReturnType<typeof read>> | null = null;
    for (const s of before) if (!lo || lo.count == null) lo = await read(s);
    for (const s of after) if (!hi || hi.count == null) hi = await read(s);
    if (lo?.count != null && hi?.count != null) {
      const f = (t - lo.t) / Math.max(1, hi.t - lo.t);
      return { count: Math.round(lo.count + f * (hi.count - lo.count)), snapshots: [lo.t, hi.t], interpolated: true };
    }
    // Only one side, but still within the near window after a failed read of the closest.
    const one = [lo, hi].find((s) => s?.count != null && Math.abs(s.t - t) <= NEAR);
    if (one?.count != null) return { count: one.count, snapshots: [one.t], interpolated: false };
  }
  return null;
}
