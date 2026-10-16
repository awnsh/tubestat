/**
 * MV3 service worker: the single writer for tracked data.
 * Content scripts and the dashboard send it messages; it applies them in order.
 */
import { handleMessage } from '../storage/mutations';
import { kvGet, kvSet } from '../storage/kv';
import { newMeta } from '../storage/db';
import type { TrackerMessage } from '../storage/schema';

chrome.runtime.onInstalled.addListener(async (details) => {
  if (!(await kvGet('meta'))) await kvSet({ meta: newMeta() });
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html#/welcome') });
  }
});

chrome.runtime.onMessage.addListener((msg: TrackerMessage, sender, sendResponse) => {
  // Only accept messages from this extension's own scripts and pages.
  if (sender.id !== chrome.runtime.id) return false;
  handleMessage(msg)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((err) => sendResponse({ ok: false, error: String(err?.message ?? err) }));
  return true;
});
