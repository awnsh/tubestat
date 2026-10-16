/**
 * Monthly / yearly Wrapped: a fixed sequence of slides built from one period.
 * Slides without enough data are dropped rather than padded.
 */
import type { Database } from '../storage/schema';
import type { Analytics, CategoryShare, CreatorStat, Session, VideoStat } from './engine';
import { periodDetail } from './history';
import { previousRange, type Range } from './periods';
import { allOg, type CreatorOg } from './wins';
import { formatDuration, formatHour } from '../lib/format';

export type WrappedSlide =
  | { kind: 'intro'; title: string; subtitle: string }
  | { kind: 'total'; seconds: number; videos: number; creators: number; days: number; unknownTimeVideos: number }
  | { kind: 'creators'; items: CreatorStat[] }
  | { kind: 'categories'; items: CategoryShare[]; byVideos: boolean }
  | { kind: 'session'; session: Session }
  | { kind: 'video'; video: VideoStat }
  | { kind: 'growth'; creator: CreatorOg }
  | { kind: 'facts'; facts: string[] }
  | { kind: 'change'; lines: string[] }
  | { kind: 'outro'; title: string; seconds: number; videos: number; topCreator: string | null; topCategory: string | null };

export function buildWrapped(a: Analytics, db: Database, range: Range): WrappedSlide[] {
  const d = periodDetail(a, range);
  const slides: WrappedSlide[] = [];
  const title = range.kind === 'year' ? `Your ${range.label} on YouTube` : `Your ${range.label.replace(/ \d{4}$/, '')}`;
  slides.push({ kind: 'intro', title, subtitle: range.label });
  if (!d.summary.videos) return slides;

  slides.push({
    kind: 'total',
    seconds: d.summary.watchSeconds,
    videos: d.summary.videos,
    creators: d.summary.creators,
    days: d.summary.activeDays,
    unknownTimeVideos: d.summary.unknownTimeVideos,
  });
  if (d.topCreators.length) slides.push({ kind: 'creators', items: d.topCreators });
  if (d.categories.items.length) slides.push({ kind: 'categories', items: d.categories.items.slice(0, 5), byVideos: d.categories.byVideos });
  if (d.longestSession && d.longestSession.watchSeconds >= 600) slides.push({ kind: 'session', session: d.longestSession });
  if (d.topVideos[0] && (d.topVideos[0].watchSeconds >= 300 || d.topVideos[0].views >= 2)) slides.push({ kind: 'video', video: d.topVideos[0] });

  // The creator you watched this period who has grown the most since you subscribed.
  const watched = new Set(a.in(range).map((w) => w.channelId));
  const growth = allOg(db)
    .filter((o) => watched.has(o.channelId) && (o.og.growthMultiple ?? 0) >= 1.5)
    .sort((x, y) => (y.og.growthMultiple ?? 0) - (x.og.growthMultiple ?? 0))[0];
  if (growth) slides.push({ kind: 'growth', creator: growth });

  const facts: string[] = [];
  const hours = a.hourly(range);
  const peak = hours.indexOf(Math.max(...hours));
  if (hours[peak] > 0) facts.push(`Your most-watched hour was ${formatHour(peak)}.`);
  const days = a.daily(range);
  const best = days.reduce((x, y) => (y.seconds > x.seconds ? y : x), days[0]);
  if (best?.seconds > 0) facts.push(`Your biggest day was ${new Date(best.day).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}, with ${formatDuration(best.seconds)}.`);
  if (d.summary.shorts) facts.push(`You watched ${d.summary.shorts.toLocaleString()} Shorts.`);
  if (d.summary.startedLong >= 10) facts.push(`You finished ${Math.round((d.summary.completedLong / d.summary.startedLong) * 100)}% of the long videos you started.`);
  if (d.newCreators.length) facts.push(`You discovered ${d.newCreators.length} new creators.`);
  if (facts.length >= 2) slides.push({ kind: 'facts', facts: facts.slice(0, 4) });

  const prev = previousRange(range);
  if (prev) {
    const p = a.summary(prev);
    if (p.watchSeconds >= 1800 && d.summary.watchSeconds >= 1800) {
      const change = d.summary.watchSeconds / p.watchSeconds - 1;
      const lines = [`${Math.abs(Math.round(change * 100))}% ${change >= 0 ? 'more' : 'less'} watch time than ${prev.label}.`];
      const prevTop = a.topCreators(prev, 'time', 1)[0];
      if (prevTop && d.topCreators[0] && prevTop.channelId !== d.topCreators[0].channelId) {
        lines.push(`Your top creator changed from ${prevTop.channelName} to ${d.topCreators[0].channelName}.`);
      }
      slides.push({ kind: 'change', lines });
    }
  }

  slides.push({
    kind: 'outro',
    title,
    seconds: d.summary.watchSeconds,
    videos: d.summary.videos,
    topCreator: d.topCreators[0]?.channelName ?? null,
    topCategory: d.categories.items[0]?.category ?? null,
  });
  return slides;
}
