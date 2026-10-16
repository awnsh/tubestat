import type { Analytics, CategoryShare, CreatorStat, Session, Summary, VideoStat } from './engine';
import type { Category } from './categories';
import { monthKey, monthRange, yearRange, type Range } from './periods';

export interface MonthRow {
  key: string;
  range: Range;
  summary: Summary;
}

/** Every month that has any data, newest first, grouped by year. */
export function monthsByYear(a: Analytics): Array<{ year: number; months: MonthRow[]; summary: Summary }> {
  const keys = new Set(a.watches.map((w) => monthKey(w.timestamp)));
  const years = new Map<number, MonthRow[]>();
  for (const key of [...keys].sort().reverse()) {
    const range = monthRange(key);
    const row = { key, range, summary: a.summary(range) };
    const y = Number(key.slice(0, 4));
    if (!years.has(y)) years.set(y, []);
    years.get(y)!.push(row);
  }
  return [...years].map(([year, months]) => ({ year, months, summary: a.summary(yearRange(year)) }));
}

export interface PeriodDetail {
  range: Range;
  summary: Summary;
  topCreators: CreatorStat[];
  categories: { items: CategoryShare[]; byVideos: boolean };
  longestSession: Session | null;
  topVideos: VideoStat[];
  newCreators: CreatorStat[];
}

export function periodDetail(a: Analytics, range: Range): PeriodDetail {
  return {
    range,
    summary: a.summary(range),
    topCreators: a.topCreators(range, 'time', 5),
    categories: a.categoryShares(range),
    longestSession: a.longestSession(range),
    topVideos: a.topVideos(range, 5),
    newCreators: a.newCreators(range),
  };
}

export interface CategoryChange {
  category: Category;
  before: number;
  after: number;
}

export interface ChangeReport {
  before: Range;
  after: Range;
  byVideos: boolean;
  rows: CategoryChange[];
  sentences: string[];
}

/**
 * Picks the two most meaningful periods to compare: earliest vs latest year
 * when there are two years of data, otherwise the first vs the current month.
 */
export function defaultComparison(a: Analytics, now = Date.now()): { before: Range; after: Range } | null {
  if (!a.firstDataAt) return null;
  const firstYear = new Date(a.firstDataAt).getFullYear();
  const thisYear = new Date(now).getFullYear();
  if (thisYear > firstYear && a.summary(yearRange(firstYear)).videos >= 30) return { before: yearRange(firstYear), after: yearRange(thisYear) };
  const first = monthRange(monthKey(a.firstDataAt));
  const current = monthRange(monthKey(now));
  if (first.start === current.start) return null;
  return { before: first, after: current };
}

export function compareCategories(a: Analytics, before: Range, after: Range): ChangeReport | null {
  const b = a.categoryShares(before);
  const c = a.categoryShares(after);
  if (!b.items.length || !c.items.length) return null;
  // Only compare like with like: if either side lacks watch time, compare by videos.
  const byVideos = b.byVideos || c.byVideos;
  const shareOf = (list: CategoryShare[], total: number, cat: Category) => {
    const x = list.find((i) => i.category === cat);
    return x ? (byVideos ? x.videos : x.seconds) / total : 0;
  };
  const totalB = b.items.reduce((s, i) => s + (byVideos ? i.videos : i.seconds), 0);
  const totalC = c.items.reduce((s, i) => s + (byVideos ? i.videos : i.seconds), 0);
  const cats = [...new Set([...b.items, ...c.items].map((i) => i.category))];
  const rows = cats
    .map((category) => ({ category, before: shareOf(b.items, totalB, category), after: shareOf(c.items, totalC, category) }))
    .sort((x, y) => Math.max(y.before, y.after) - Math.max(x.before, x.after))
    .slice(0, 6);

  const unit = byVideos ? 'of the videos you watched' : 'of your watch time';
  const sentences = [...rows]
    .filter((r) => Math.abs(r.after - r.before) >= 0.05)
    .sort((x, y) => Math.abs(y.after - y.before) - Math.abs(x.after - x.before))
    .slice(0, 3)
    .map((r) => `${r.category} ${r.after > r.before ? 'now represents' : 'fell to'} ${Math.round(r.after * 100)}% ${unit}, compared with ${Math.round(r.before * 100)}% in ${before.label}.`);
  return { before, after, byVideos, rows, sentences };
}
