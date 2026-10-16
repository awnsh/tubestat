import type { TrackerMessage } from '../storage/schema';
import { isExtension } from '../storage/kv';

/**
 * Sends a write to the background worker. Outside the extension (dev preview)
 * the same handler runs in-page against localStorage.
 */
export async function dispatch<T = unknown>(msg: TrackerMessage): Promise<T> {
  if (isExtension && chrome.runtime?.id) {
    const res = await chrome.runtime.sendMessage(msg);
    if (!res?.ok) throw new Error(res?.error ?? 'The extension did not respond.');
    return res.result as T;
  }
  const { handleMessage } = await import('../storage/mutations');
  return (await handleMessage(msg)) as T;
}
