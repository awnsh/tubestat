/**
 * "Your biggest wins": standout facts about your creator history.
 * Each win is included only when the data behind it exists.
 */
import type { Database } from '../storage/schema';
import { formatCompact, formatDuration, formatSpan } from '../lib/format';
import { computeOg, trackedGrowth, type OgResult } from './og';
import type { Analytics } from './engine';

export interface Win {
  id: string;
  title: string;
  headline: string;
  detail: string;
  channelId: string;
  estimate: boolean;
}

export interface CreatorOg {
  channelId: string;
  channelName: string;
  avatar: string | null;
  og: OgResult;
}

export function allOg(db: Database): CreatorOg[] {
  const out: CreatorOg[] = [];
  for (const sub of Object.values(db.subscriptions)) {
    if (!sub.active) continue;
    const ch = db.channels[sub.channelId];
    const og = computeOg(ch, sub);
    if (og && ch) out.push({ channelId: ch.channelId, channelName: ch.channelName, avatar: ch.avatar, og });
  }
  return out;
}

export function biggestWins(db: Database, a: Analytics, now = Date.now()): Win[] {
  const wins: Win[] = [];
  const ogs = allOg(db);
  const audience = ogs.filter((o) => o.og.basis === 'audience' && o.og.subscribersThen != null);

  const growth = audience.filter((o) => (o.og.growthMultiple ?? 0) >= 2).sort((x, y) => y.og.growthMultiple! - x.og.growthMultiple!)[0];
  if (growth) {
    const m = growth.og.growthMultiple!;
    wins.push({
      id: 'growth',
      title: 'Biggest growth',
      headline: `${m >= 10 ? Math.round(m).toLocaleString() : m.toFixed(1)}×`,
      detail: `You’ve watched ${growth.channelName} grow ${m >= 10 ? Math.round(m).toLocaleString() : m.toFixed(1)}× since you subscribed.`,
      channelId: growth.channelId,
      estimate: growth.og.estimate,
    });
  }

  const earliest = [...audience].sort((x, y) => x.og.subscribersThen! - y.og.subscribersThen!)[0];
  if (earliest && earliest.og.subscribersThen! < (earliest.og.subscribersNow ?? Infinity)) {
    wins.push({
      id: 'earliest',
      title: 'Earliest creator',
      headline: formatCompact(earliest.og.subscribersThen!),
      detail: `You subscribed to ${earliest.channelName} when they had ${earliest.og.subscribersThen!.toLocaleString()} subscribers.`,
      channelId: earliest.channelId,
      estimate: earliest.og.estimate,
    });
  }

  const blewUp = audience.find((o) => o.og.subscribersThen! < 1_000_000 && (o.og.subscribersNow ?? 0) >= 1_000_000)
    ?? audience.find((o) => o.og.subscribersThen! < 100_000 && (o.og.subscribersNow ?? 0) >= 100_000);
  if (blewUp) {
    const mark = (blewUp.og.subscribersNow ?? 0) >= 1_000_000 && blewUp.og.subscribersThen! < 1_000_000 ? '1M' : '100K';
    wins.push({
      id: 'blewup',
      title: 'Before they blew up',
      headline: mark,
      detail: `You subscribed to ${blewUp.channelName} before they reached ${mark} subscribers.`,
      channelId: blewUp.channelId,
      estimate: blewUp.og.estimate,
    });
  }

  const dated = Object.values(db.subscriptions)
    .filter((s) => s.active && s.subscriptionDate != null)
    .sort((x, y) => x.subscriptionDate! - y.subscriptionDate!)[0];
  if (dated && now - dated.subscriptionDate! > 30 * 86_400_000) {
    const ch = db.channels[dated.channelId];
    wins.push({
      id: 'longest',
      title: 'Longest subscription',
      headline: formatSpan(now - dated.subscriptionDate!),
      detail: `You’ve been subscribed to ${ch?.channelName ?? 'this channel'} for ${formatSpan(now - dated.subscriptionDate!)}.`,
      channelId: dated.channelId,
      estimate: false,
    });
  }

  const top = a.topCreators({ kind: 'all', start: 0, end: Infinity, label: '' }, 'time', 1)[0];
  if (top && top.watchSeconds >= 3600) {
    wins.push({
      id: 'most',
      title: 'Most watched',
      headline: formatDuration(top.watchSeconds, { short: true }),
      detail: `You’ve spent ${formatDuration(top.watchSeconds)} watching ${top.channelName}.`,
      channelId: top.channelId,
      estimate: false,
    });
  }

  const tracked = Object.values(db.channels)
    .map((ch) => ({ ch, g: trackedGrowth(ch) }))
    .filter((x) => x.g && x.g.delta > 0)
    .sort((x, y) => y.g!.delta - x.g!.delta)[0];
  if (tracked) {
    wins.push({
      id: 'tracked-growth',
      title: 'Growing fastest',
      headline: `+${formatCompact(tracked.g!.delta)}`,
      detail: `${tracked.ch.channelName} gained ${tracked.g!.delta.toLocaleString()} subscribers since TubeStat started recording them.`,
      channelId: tracked.ch.channelId,
      estimate: false,
    });
  }
  return wins;
}
