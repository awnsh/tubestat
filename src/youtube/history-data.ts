/**
 * Reading youtube.com/feed/history entries out of YouTube's renderer data.
 * Shared by the page bridge (data attached to the rendered elements) and the
 * background worker (ytInitialData in the page's HTML, fetched without a tab).
 */
import type { HistoryItem } from './bridge-protocol';
import { handleFromUrl, parseHistoryDay, parseLength } from './parse';

/** Depth-first search of YouTube's renderer data for the first value `pick` accepts. */
export function find(obj: any, pick: (key: string, value: any) => unknown, depth = 0): unknown {
  // Lockups keep the channel link about 15 levels down.
  if (!obj || typeof obj !== 'object' || depth > 20) return undefined;
  for (const [k, v] of Object.entries(obj)) {
    const hit = pick(k, v);
    if (hit !== undefined && hit !== null && hit !== false) return hit;
    const deeper = find(v, pick, depth + 1);
    if (deeper !== undefined) return deeper;
  }
  return undefined;
}

export function textOf(t: any): string {
  if (!t) return '';
  if (typeof t === 'string') return t;
  if (typeof t.simpleText === 'string') return t.simpleText;
  if (typeof t.content === 'string') return t.content;
  if (Array.isArray(t.runs)) return t.runs.map((r: any) => r.text).join('');
  return '';
}

/**
 * What one entry's renderer data says, field by field; empty where it says
 * nothing. Both the older videoRenderer and the newer lockup view models are
 * understood.
 */
export function historyFieldsOf(d: any) {
  const isShort = !!find(d, (k) => k === 'reelWatchEndpoint');
  const videoId =
    (d?.videoId as string) ||
    (d?.contentId as string) ||
    (find(d, (k, v) => (k === 'reelWatchEndpoint' || k === 'watchEndpoint') && v?.videoId) as string) ||
    '';
  const title =
    textOf(d?.title) ||
    (find(d, (k, v) => (k === 'lockupMetadataViewModel' ? v?.title?.content : undefined)) as string) ||
    (find(d, (k, v) => (k === 'primaryText' ? v?.content : undefined)) as string) ||
    '';
  const channelId = (find(d, (k, v) => k === 'browseId' && typeof v === 'string' && v.startsWith('UC') && v) as string) || '';
  const channelName =
    textOf(d?.ownerText) ||
    textOf(d?.shortBylineText) ||
    (find(d, (k, v) => (k === 'metadataParts' && Array.isArray(v) ? v[0]?.text?.content : undefined)) as string) ||
    '';
  const handle = handleFromUrl(find(d, (k, v) => k === 'canonicalBaseUrl' && v) as string);
  const lengthText = textOf(d?.lengthText) || (find(d, (k, v) => (k === 'text' && typeof v === 'string' && parseLength(v) != null ? v : undefined)) as string) || '';
  const percent = find(d, (k, v) => (k === 'percentDurationWatched' || k === 'startPercent') && typeof v === 'number' && { v }) as { v: number } | undefined;
  return { videoId, title, channelId, channelName, handle, lengthText, percent: percent?.v ?? null, isShort };
}

/** The key each kind of entry sits under in a history section's `contents`. */
const ENTRY_KEYS = ['videoRenderer', 'lockupViewModel', 'reelItemRenderer', 'shortsLockupViewModel'];

/**
 * Every entry in a youtube.com/feed/history ytInitialData, with the day its
 * section is headed with. Sections whose heading can't be read are skipped.
 */
export function historyFromInitialData(data: any, lang = 'en', now = Date.now()): HistoryItem[] {
  const sections: any[] = [];
  const collect = (obj: any, depth = 0) => {
    if (!obj || typeof obj !== 'object' || depth > 14) return;
    if (obj.itemSectionRenderer) sections.push(obj.itemSectionRenderer);
    for (const v of Object.values(obj)) collect(v, depth + 1);
  };
  collect(data);

  const items: HistoryItem[] = [];
  for (const section of sections) {
    const day = parseHistoryDay(textOf(section.header?.itemSectionHeaderRenderer?.title), lang, now);
    if (day == null) continue;
    const entries: any[] = [];
    for (const c of section.contents ?? []) {
      // Shorts come grouped in a shelf.
      const shelf = c.reelShelfRenderer?.items ?? c.richShelfRenderer?.contents ?? null;
      for (const e of shelf ?? [c]) {
        const inner = e.richItemRenderer?.content ?? e;
        const key = ENTRY_KEYS.find((k) => inner[k]);
        if (key) entries.push(inner[key]);
      }
    }
    for (const e of entries) {
      const f = historyFieldsOf(e);
      if (!f.videoId) continue;
      items.push({
        videoId: f.videoId,
        title: f.title,
        channelId: f.channelId,
        channelName: f.channelName,
        handle: f.handle,
        day,
        duration: parseLength(f.lengthText) ?? 0,
        percent: f.percent == null ? null : Math.max(0, Math.min(100, f.percent)),
        isShort: f.isShort,
      });
    }
  }
  return items;
}
