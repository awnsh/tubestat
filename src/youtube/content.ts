/**
 * Isolated-world content script on youtube.com.
 * Receives player samples from the page bridge, runs the watch tracker, reads
 * channel details from the watch page, and hands records to the background
 * worker. Nothing here leaves the browser.
 */
import { BRIDGE_SOURCE, type BridgeMessage, type PlayerSample } from './bridge-protocol';
import { parseCount, upscaleAvatar } from './parse';
import { WatchTracker } from '../tracking/tracker';
import { DEFAULT_SETTINGS, type Settings, type TrackerMessage, type Watch } from '../storage/schema';

let settings: Settings = DEFAULT_SETTINGS;
let alive = true;

const tracker = new WatchTracker({
  minWatchSeconds: DEFAULT_SETTINGS.minWatchSeconds,
  resumeGapMs: DEFAULT_SETTINGS.sessionGapMinutes * 60_000,
  saveIntervalMs: 15_000,
  trackShorts: DEFAULT_SETTINGS.trackShorts,
});

function applySettings(next: Partial<Settings> | undefined) {
  settings = { ...DEFAULT_SETTINGS, ...(next ?? {}) };
  tracker.setOptions({
    minWatchSeconds: settings.minWatchSeconds,
    resumeGapMs: settings.sessionGapMinutes * 60_000,
    trackShorts: settings.trackShorts,
  });
}

chrome.storage.local.get('settings').then((r) => applySettings(r.settings as Settings | undefined));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) applySettings(changes.settings.newValue as Settings);
});

function send(msg: TrackerMessage) {
  if (!alive) return;
  try {
    chrome.runtime.sendMessage(msg).catch(() => undefined);
  } catch {
    // The extension was reloaded or removed; this old script can no longer talk to it.
    alive = false;
  }
}

function persist(records: Watch[]) {
  for (const watch of records) send({ type: 'watch:upsert', watch });
}

/* ---------- channel details from the watch page ---------- */

let lastChannelReport = '';

function readOwner(sample: PlayerSample) {
  if (sample.isShort || !location.pathname.startsWith('/watch')) return;
  const owner = document.querySelector('ytd-watch-metadata ytd-video-owner-renderer');
  if (!owner) return;
  // Make sure the owner block has caught up with the video that's playing.
  const href = owner.querySelector('a')?.getAttribute('href') ?? '';
  const matches = sample.handle ? decodeURIComponent(href).toLowerCase() === `/${sample.handle}`.toLowerCase() : href.includes(sample.channelId);
  if (!matches) return;

  const subscriberCount = parseCount(owner.querySelector('#owner-sub-count')?.textContent);
  const avatar = upscaleAvatar((owner.querySelector('#avatar img') as HTMLImageElement | null)?.src || null);
  const subRenderer = document.querySelector('ytd-watch-metadata #subscribe-button ytd-subscribe-button-renderer');
  // The `subscribed` attribute is set by YouTube itself, so it doesn't depend on the UI language.
  // Signed out, every button says "Subscribe" — that tells us nothing.
  const signedIn = !!document.querySelector('ytd-masthead #avatar-btn');
  const subscribed = !signedIn ? null : subRenderer ? subRenderer.hasAttribute('subscribed') : owner.hasAttribute('subscribed');

  const signature = `${sample.channelId}|${subscriberCount}|${subscribed}|${!!avatar}`;
  if (signature === lastChannelReport) return;
  lastChannelReport = signature;
  send({
    type: 'channel:seen',
    channel: { channelId: sample.channelId, channelName: sample.channelName, handle: sample.handle, avatar, subscriberCount },
    subscribed,
  });
}

/* ---------- wiring ---------- */

let lastSample: PlayerSample | null = null;
let ownerCheckedFor = '';
let ownerChecks = 0;

window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.source !== BRIDGE_SOURCE) return;
  const msg = event.data as BridgeMessage;

  if (msg.kind === 'subscriptions') {
    send({ type: 'subscriptions:sync', channels: msg.channels, complete: msg.complete });
    return;
  }

  const sample = msg.sample;
  lastSample = sample;
  if (!settings.trackingEnabled) {
    persist(tracker.tick(null, Date.now()));
    return;
  }
  persist(tracker.tick(sample, Date.now()));

  // Check the owner block for a while after each new video, then every 10s so
  // a Subscribe click is caught the moment it happens.
  if (sample?.channelId) {
    if (ownerCheckedFor !== sample.videoId) {
      ownerCheckedFor = sample.videoId;
      ownerChecks = 0;
    }
    ownerChecks++;
    if (ownerChecks <= 20 || ownerChecks % 10 === 0) readOwner(sample);
  }
});

// Catch Subscribe/Unsubscribe clicks immediately.
document.addEventListener(
  'click',
  (e) => {
    const target = e.target as Element | null;
    if (target?.closest('#subscribe-button') && lastSample) {
      setTimeout(() => {
        lastChannelReport = '';
        if (lastSample) readOwner(lastSample);
      }, 1200);
    }
  },
  true,
);

const flush = () => persist(tracker.flush());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush();
});
window.addEventListener('pagehide', flush);
