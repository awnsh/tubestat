/**
 * Runs in YouTube's own page world (manifest "world": "MAIN") because the
 * player API — getPlayerResponse(), getVideoData() — and the data behind
 * YouTube's custom elements are invisible to isolated content scripts.
 *
 * It only reads, never modifies the page, and posts a small sample once a
 * second to the isolated tracker script. It has no access to extension APIs.
 */
import { BRIDGE_SOURCE, type BridgeMessage, type PlayerSample } from './bridge-protocol';
import { handleFromUrl, parseCount } from './parse';

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
}, 2500);
