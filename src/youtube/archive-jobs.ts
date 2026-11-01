/**
 * Looking up past subscriber counts for your subscriptions, a few at a time.
 *
 * On by default (Profile → "Their size when you subscribed" turns it off).
 * Each lookup sends the Internet Archive one channel's ID or @handle and a
 * date, never anything about you. Channels with no snapshots are asked again
 * after a month.
 */
import { kvGet, kvSet } from '../storage/kv';
import { getSettings } from '../storage/db';
import { applyArchiveCount } from '../storage/mutations';
import type { Channel, Subscription } from '../storage/schema';
import { archiveCountAt } from './archive';

export const RETRY_AFTER_MS = 30 * 86_400_000;
const BACKGROUND_EVERY_MS = 15 * 60_000;
const PAUSE_MS = 1500;

const enabled = async () => (await getSettings()).archiveLookups;

/** Subscriptions with a date but no count for it, oldest subscriptions first (they gain most). */
function waiting(subs: Record<string, Subscription>, now: number): Subscription[] {
  return Object.values(subs)
    .filter((s) => s.subscriptionDate != null && s.subscriberCountAtSubscription == null && (!s.archiveCheckedAt || now - s.archiveCheckedAt > RETRY_AFTER_MS))
    .sort((a, b) => a.subscriptionDate! - b.subscriptionDate!);
}

export interface ArchiveProgress {
  checked: number;
  found: number;
  remaining: number;
}

let running: Promise<ArchiveProgress> | null = null;

/** Looks up to `limit` subscriptions (or just `channelId`). One run at a time. */
export function lookUpPastCounts({ limit = 15, channelId }: { limit?: number; channelId?: string } = {}): Promise<ArchiveProgress> {
  if (running && !channelId) return running;
  const run = (async () => {
    if (!(await enabled())) throw new Error('Internet Archive estimates are turned off in Profile.');
    const subs = (await kvGet<Record<string, Subscription>>('subscriptions')) ?? {};
    const channels = (await kvGet<Record<string, Channel>>('channels')) ?? {};
    const now = Date.now();
    const queue = channelId ? [subs[channelId]].filter((s) => s?.subscriptionDate != null) : waiting(subs, now).slice(0, limit);
    let found = 0;
    for (const [i, sub] of queue.entries()) {
      if (i) await new Promise((r) => setTimeout(r, PAUSE_MS));
      try {
        const result = await archiveCountAt(sub.channelId, channels[sub.channelId]?.handle ?? null, sub.subscriptionDate!);
        await applyArchiveCount(sub.channelId, sub.subscriptionDate!, result);
        if (result) found++;
      } catch {
        // The archive is busy or offline: stop for now and pick up next time.
        break;
      }
    }
    await kvSet({ archiveRun: Date.now() });
    const after = (await kvGet<Record<string, Subscription>>('subscriptions')) ?? {};
    return { checked: queue.length, found, remaining: waiting(after, Date.now()).length };
  })();
  if (!channelId) running = run.finally(() => (running = null));
  return run;
}

/** Called whenever the background worker wakes; does a small batch every 15 minutes. */
export async function archiveInBackground(): Promise<void> {
  const last = (await kvGet<number>('archiveRun')) ?? 0;
  if (Date.now() - last < BACKGROUND_EVERY_MS || !(await enabled())) return;
  await lookUpPastCounts({ limit: 10 }).catch(() => undefined);
}
