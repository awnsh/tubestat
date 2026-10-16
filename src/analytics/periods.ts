import { formatDate, monthName } from '../lib/format';

export type PeriodKind = 'day' | 'week' | 'month' | 'year' | 'all';

export interface Range {
  kind: PeriodKind;
  start: number;
  /** Exclusive. */
  end: number;
  label: string;
}

export const DAY_MS = 86_400_000;

export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Weeks start on Monday. */
export function startOfWeek(t: number): number {
  const d = new Date(startOfDay(t));
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d.getTime();
}

export function startOfMonth(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export function startOfYear(t: number): number {
  return new Date(new Date(t).getFullYear(), 0, 1).getTime();
}

export function addDays(t: number, n: number): number {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthRange(key: string): Range {
  const [y, m] = key.split('-').map(Number);
  const start = new Date(y, m - 1, 1).getTime();
  const end = new Date(y, m, 1).getTime();
  return { kind: 'month', start, end, label: `${monthName(m - 1)} ${y}` };
}

export function yearRange(year: number): Range {
  return { kind: 'year', start: new Date(year, 0, 1).getTime(), end: new Date(year + 1, 0, 1).getTime(), label: String(year) };
}

export function rangeFor(kind: PeriodKind, anchor = Date.now(), firstData?: number): Range {
  switch (kind) {
    case 'day': {
      const start = startOfDay(anchor);
      return { kind, start, end: addDays(start, 1), label: start === startOfDay(Date.now()) ? 'Today' : formatDate(start, 'weekday') };
    }
    case 'week': {
      const start = startOfWeek(anchor);
      return { kind, start, end: addDays(start, 7), label: start === startOfWeek(Date.now()) ? 'This week' : `Week of ${formatDate(start, 'short')}` };
    }
    case 'month': {
      const start = startOfMonth(anchor);
      const d = new Date(start);
      return { kind, start, end: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(), label: start === startOfMonth(Date.now()) ? 'This month' : `${monthName(d.getMonth())} ${d.getFullYear()}` };
    }
    case 'year': {
      const r = yearRange(new Date(anchor).getFullYear());
      return { ...r, label: r.start === startOfYear(Date.now()) ? 'This year' : r.label };
    }
    case 'all':
      return { kind, start: firstData ?? 0, end: addDays(startOfDay(Date.now()), 1), label: 'All time' };
  }
}

/** The equivalent period immediately before `r` (for "vs last week"). */
export function previousRange(r: Range): Range | null {
  switch (r.kind) {
    case 'day':
      return rangeFor('day', addDays(r.start, -1));
    case 'week':
      return rangeFor('week', addDays(r.start, -7));
    case 'month':
      return rangeFor('month', addDays(r.start, -1));
    case 'year':
      return rangeFor('year', addDays(r.start, -1));
    default:
      return null;
  }
}

/**
 * For "this week vs last week" while the week is in progress, compare against
 * the same elapsed portion of last week so Monday doesn't always look like a drop.
 */
export function elapsedComparable(r: Range, prev: Range, now = Date.now()): Range {
  if (now >= r.end || now < r.start) return prev;
  const elapsed = now - r.start;
  return { ...prev, end: Math.min(prev.end, prev.start + elapsed) };
}

export function isoWeek(t: number): string {
  const d = new Date(startOfDay(t));
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const n = 1 + Math.round(((d.getTime() - week1.getTime()) / DAY_MS - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(n).padStart(2, '0')}`;
}
