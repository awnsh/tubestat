/**
 * Runs in YouTube's own page world (manifest "world": "MAIN") because the
 * player API — getPlayerResponse(), getVideoData() — and the data behind
 * YouTube's custom elements are invisible to isolated content scripts.
 *
 * It only reads, never modifies the page, and posts a small sample once a
 * second to the isolated tracker script. It has no access to extension APIs.
 */
import { BRIDGE_SOURCE, type BridgeMessage, type HistoryItem, type PlayerSample } from './bridge-protocol';
import { handleFromUrl, parseCount, parseHistoryDay, parseLength } from './parse';

interface YtPlayer extends HTMLElement {
  getPlayerResponse?: () => any;
  getVideoData?: () => { video_id?: string; title?: string; author?: string; isLive?: boolean };
}

type Unsourced<T> = T extends unknown ? Omit<T, 'source'> : never;

function post(msg: Unsourced<BridgeMessage>) {
  window.postMessage({ source: BRIDGE_SOURCE, ...msg }, location.origin);
}

/** The main watch player, or the Shorts player — never hover previews on the home feed. */
function activePlayer(): YtPlayer | null {
  const candidates = [document.getElementById('shorts-player'), document.getElementById('movie_player')] as (YtPlayer | null)[];
  const onShorts = location.pathname.startsWith('/shorts/');
  const ordered = onShorts ? candidates : candidates.reverse();
  for (const p of ordered) {
    if (!p || typeof p.getVideoData !== 'function') continue;
    if (p.closest('ytd-video-preview, #inline-preview-player')) continue;
    const video = p.querySelector('video');
    if (!video) continue;
    // On a non-Shorts page the Shorts player may linger in the DOM, paused.
    if (p.id === 'shorts-player' && !onShorts) continue;
    return p;
  }
  return null;
}

function sample(): PlayerSample | null {
  const player = activePlayer();
  if (!player) return null;
  const video = player.querySelector('video') as HTMLVideoElement;
  const data = player.getVideoData?.() ?? {};
  let response: any = null;
  try {
    response = player.getPlayerResponse?.();
  } catch {
    /* player not ready */
  }
  const details = response?.videoDetails;
  const micro = response?.microformat?.playerMicroformatRenderer;
  const videoId = data.video_id || details?.videoId;
  if (!videoId) return null;
  // The player response can lag behind a navigation; only trust it when it matches.
  const matches = details?.videoId === videoId;
  const isShort = player.id === 'shorts-player';
  return {
    videoId,
    title: (matches && details?.title) || data.title || '',
    channelId: (matches && details?.channelId) || '',
    channelName: (matches && details?.author) || data.author || '',
    handle: matches ? handleFromUrl(micro?.ownerProfileUrl) : null,
    lengthSeconds: matches ? Number(details?.lengthSeconds) || 0 : 0,
    isLive: Boolean((matches && details?.isLive) || data.isLive),
    category: (matches && micro?.category) || null,
    currentTime: video.currentTime,
    duration: Number.isFinite(video.duration) ? video.duration : 0,
    paused: video.paused,
    ended: video.ended,
    ad: player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'),
    isShort,
  };
}

function textOf(t: any): string {
  if (!t) return '';
  if (typeof t.simpleText === 'string') return t.simpleText;
  if (Array.isArray(t.runs)) return t.runs.map((r: any) => r.text).join('');
  return '';
}

/** On youtube.com/feed/channels, read the subscription list YouTube already rendered. */
let lastSubsSignature = '';
function scanSubscriptions() {
  if (location.pathname !== '/feed/channels') return;
  const els = Array.from(document.querySelectorAll('ytd-channel-renderer')) as any[];
  const channels = els
    .map((el) => el.data ?? el.__data?.data)
    .filter((d) => d?.channelId)
    .map((d) => {
      const texts = [textOf(d.subscriberCountText), textOf(d.videoCountText)];
      const handle = texts.find((t) => t.startsWith('@')) ?? null;
      const subText = texts.find((t) => /subscriber/i.test(t)) ?? null;
      const thumbs = d.thumbnail?.thumbnails ?? [];
      let avatar: string | null = thumbs[thumbs.length - 1]?.url ?? null;
      if (avatar?.startsWith('//')) avatar = 'https:' + avatar;
      return { channelId: d.channelId as string, channelName: textOf(d.title), handle, avatar, subscriberCount: parseCount(subText) };
    });
  if (!channels.length) return;
  const complete = !document.querySelector('ytd-browse ytd-continuation-item-renderer');
  const signature = `${channels.length}:${complete}`;
  if (signature === lastSubsSignature) return;
  lastSubsSignature = signature;
  post({ kind: 'subscriptions', channels, complete });
}

/* ---------- youtube.com/feed/history: viewing from your phone and other devices ---------- */

/** Depth-first search of YouTube's renderer data for the first value `pick` accepts. */
function find(obj: any, pick: (key: string, value: any) => unknown, depth = 0): unknown {
  if (!obj || typeof obj !== 'object' || depth > 12) return undefined;
  for (const [k, v] of Object.entries(obj)) {
    const hit = pick(k, v);
    if (hit !== undefined && hit !== null && hit !== false) return hit;
    const deeper = find(v, pick, depth + 1);
    if (deeper !== undefined) return deeper;
  }
  return undefined;
}

const dataOf = (el: any) => el.data ?? el.__data?.data ?? el.polymerController?.data ?? null;

/**
 * Reads one history entry, preferring the renderer data YouTube attached to the
 * element and falling back to what's drawn on the page. Both the older
 * ytd-video-renderer and the newer lockup view model are understood.
 */
function readHistoryEntry(el: Element, day: number): HistoryItem | null {
  const d = dataOf(el);
  const link = el.querySelector('a[href*="/watch?v="], a[href*="/shorts/"]') as HTMLAnchorElement | null;
  const href = link?.getAttribute('href') ?? '';
  const isShort = /shorts/i.test(el.tagName) || href.includes('/shorts/') || !!find(d, (k) => k === 'reelWatchEndpoint');
  const videoId =
    (d?.videoId as string) ||
    (d?.contentId as string) ||
    (find(d, (k, v) => (k === 'reelWatchEndpoint' || k === 'watchEndpoint') && v?.videoId) as string) ||
    href.match(/[?&]v=([\w-]{6,})/)?.[1] ||
    href.match(/\/shorts\/([\w-]{6,})/)?.[1];
  if (!videoId) return null;

  const title =
    textOf(d?.title) ||
    (find(d, (k, v) => (k === 'lockupMetadataViewModel' ? v?.title?.content : undefined)) as string) ||
    (find(d, (k, v) => (k === 'primaryText' ? v?.content : undefined)) as string) ||
    el.querySelector('#video-title, h3, .yt-lockup-metadata-view-model-wiz__title, [class*="title"]')?.textContent?.trim() ||
    '';
  const channelId = (find(d, (k, v) => k === 'browseId' && typeof v === 'string' && v.startsWith('UC') && v) as string) || '';
  const channelLink = el.querySelector('a[href^="/@"], a[href^="/channel/"]') as HTMLAnchorElement | null;
  const channelName =
    textOf(d?.ownerText) ||
    textOf(d?.shortBylineText) ||
    (find(d, (k, v) => (k === 'metadataParts' && Array.isArray(v) ? v[0]?.text?.content : undefined)) as string) ||
    channelLink?.textContent?.trim() ||
    '';
  const handle = handleFromUrl(channelLink?.getAttribute('href')) ?? handleFromUrl(find(d, (k, v) => k === 'canonicalBaseUrl' && v) as string);

  const lengthText =
    textOf(d?.lengthText) ||
    (find(d, (k, v) => (k === 'text' && typeof v === 'string' && parseLength(v) != null ? v : undefined)) as string) ||
    el.querySelector('ytd-thumbnail-overlay-time-status-renderer, badge-shape, .badge-shape-wiz__text')?.textContent?.trim();
  const duration = parseLength(lengthText) ?? 0;

  let percent = find(d, (k, v) => (k === 'percentDurationWatched' || k === 'startPercent') && typeof v === 'number' && { v }) as { v: number } | undefined;
  if (!percent) {
    const bar = el.querySelector('#progress, [class*="progress-bar-segment"], [class*="ProgressBarSegment"]') as HTMLElement | null;
    const w = parseFloat(bar?.style.width ?? '');
    if (Number.isFinite(w)) percent = { v: w };
  }
  return {
    videoId,
    title,
    channelId,
    channelName,
    handle,
    day,
    duration,
    percent: percent ? Math.max(0, Math.min(100, percent.v)) : null,
    isShort,
  };
}

const sentHistory = new Set<string>();
function scanHistory() {
  if (location.pathname !== '/feed/history') return;
  const lang = document.documentElement.lang || navigator.language || 'en';
  const items: HistoryItem[] = [];
  for (const section of Array.from(document.querySelectorAll('ytd-item-section-renderer'))) {
    const header =
      section.querySelector('ytd-item-section-header-renderer #title, #header #title, #header h2')?.textContent ??
      textOf(dataOf(section)?.header?.itemSectionHeaderRenderer?.title);
    const day = parseHistoryDay(header, lang);
    if (day == null) continue;
    const entries = section.querySelectorAll('ytd-video-renderer, yt-lockup-view-model, ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2, ytd-reel-item-renderer');
    for (const el of Array.from(entries)) {
      // A lockup nested in another matched element is the same entry.
      if (el.parentElement?.closest('ytd-video-renderer, yt-lockup-view-model, ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2')) continue;
      const item = readHistoryEntry(el, day);
      if (!item) continue;
      const key = `${item.videoId}:${day}:${item.percent}:${!!item.channelId}`;
      if (sentHistory.has(key)) continue;
      sentHistory.add(key);
      items.push(item);
    }
  }
  if (items.length) post({ kind: 'history', items });
}

setInterval(() => {
  try {
    post({ kind: 'tick', sample: sample() });
  } catch {
    /* never let tracking break the page */
  }
}, 1000);

setInterval(() => {
  try {
    scanSubscriptions();
  } catch {
    /* ignore */
  }
  try {
    scanHistory();
  } catch {
    /* ignore */
  }
}, 2500);
