/**
 * OG status: how early you were to a creator.
 *
 * Two measurable bases, used in this order:
 *
 * 1. Audience — subscriber count when you subscribed vs. now.
 *    Known exactly if the extension saw you subscribe, or interpolated from
 *    its own daily snapshots if your subscription date falls inside them.
 *    "You subscribed before ~97% of their current audience" = 1 − then/now.
 *
 * 2. Timing — where your subscription date falls in the channel's lifetime
 *    (needs the Data API for both dates). Says nothing about audience size,
 *    so it's always labelled an estimate and never produces an audience claim.
 *
 * With neither, there is no status — the UI shows "Tracking since …" instead.
 */
import type { Channel, Subscription } from '../storage/schema';

export type OgTier = 'DAY ONE' | 'OG' | 'EARLY' | 'ESTABLISHED' | 'RECENT';
export type OgBasis = 'audience' | 'timing';

export interface OgResult {
  tier: OgTier;
  basis: OgBasis;
  /** True when interpolated or timing-based. */
  estimate: boolean;
  /** Share of today's audience that subscribed after you (audience basis). */
  audienceAfterYou: number | null;
  subscribersThen: number | null;
  subscribersNow: number | null;
  growthMultiple: number | null;
  /** How far into the channel's life you subscribed, 0–1 (timing basis). */
  lifetimeShare: number | null;
  subscribedAt: number;
}

/** Thresholds on the share of the current audience that arrived after you. */
const AUDIENCE_TIERS: Array<[number, OgTier]> = [
  [0.99, 'DAY ONE'],
  [0.9, 'OG'],
  [0.6, 'EARLY'],
  [0.2, 'ESTABLISHED'],
];

/** Thresholds on how far into the channel's lifetime you subscribed. */
const TIMING_TIERS: Array<[number, OgTier]> = [
  [0.05, 'DAY ONE'],
  [0.2, 'OG'],
  [0.45, 'EARLY'],
  [0.8, 'ESTABLISHED'],
];

export const TIER_DESCRIPTIONS: Record<OgTier, string> = {
  'DAY ONE': 'Before 99% of their audience, or in the first 5% of the channel’s life.',
  OG: 'Before 90% of their audience, or in the first 20% of the channel’s life.',
  EARLY: 'Before 60% of their audience, or in the first 45% of the channel’s life.',
  ESTABLISHED: 'Before 20% of their audience, or in the first 80% of the channel’s life.',
  RECENT: 'After most of their current audience.',
};

/** Subscriber count at time t from the extension's own snapshots, if t is covered. */
export function countAt(ch: Channel, t: number): { count: number; interpolated: boolean } | null {
  const h = ch.subscriberHistory;
  if (!h?.length) return null;
  const DAY = 86_400_000;
  if (t < h[0].t - 2 * DAY || t > h[h.length - 1].t + 2 * DAY) return null;
  let before = h[0];
  let after = h[h.length - 1];
  for (const s of h) {
    if (s.t <= t) before = s;
    if (s.t >= t) {
      after = s;
      break;
    }
  }
  if (Math.abs(before.t - t) < DAY) return { count: before.count, interpolated: false };
  if (after.t === before.t) return { count: before.count, interpolated: true };
  const f = (t - before.t) / (after.t - before.t);
  return { count: Math.round(before.count + f * (after.count - before.count)), interpolated: true };
}

export function computeOg(ch: Channel | undefined, sub: Subscription | undefined, now = Date.now()): OgResult | null {
  if (!ch || !sub || sub.subscriptionDate == null) return null;
  const at = sub.subscriptionDate;
  const current = ch.subscriberCount ?? sub.currentSubscriberCount;

  let then: number | null = sub.subscriberCountAtSubscription;
  let estimate = false;
  if (then == null) {
    const fromHistory = countAt(ch, at);
    if (fromHistory) {
      then = fromHistory.count;
      estimate = fromHistory.interpolated;
    }
  }

  if (then != null && current != null && current > 0) {
    const after = Math.max(0, Math.min(1, 1 - then / current));
    const tier = AUDIENCE_TIERS.find(([min]) => after >= min)?.[1] ?? 'RECENT';
    return {
      tier,
      basis: 'audience',
      estimate,
      audienceAfterYou: after,
      subscribersThen: then,
      subscribersNow: current,
      growthMultiple: then > 0 ? current / then : null,
      lifetimeShare: null,
      subscribedAt: at,
    };
  }

  if (ch.createdAt && ch.createdAt < at) {
    const share = (at - ch.createdAt) / Math.max(1, now - ch.createdAt);
    const tier = TIMING_TIERS.find(([max]) => share <= max)?.[1] ?? 'RECENT';
    return {
      tier,
      basis: 'timing',
      estimate: true,
      audienceAfterYou: null,
      subscribersThen: null,
      subscribersNow: current,
      growthMultiple: null,
      lifetimeShare: share,
      subscribedAt: at,
    };
  }
  return null;
}

/** Growth the extension itself has recorded since it first saw the channel. */
export function trackedGrowth(ch: Channel): { from: number; to: number; since: number; delta: number } | null {
  const h = ch.subscriberHistory;
  if (!h || h.length < 2) return null;
  const first = h[0];
  const last = h[h.length - 1];
  if (last.t - first.t < 86_400_000) return null;
  return { from: first.count, to: last.count, since: first.t, delta: last.count - first.count };
}
