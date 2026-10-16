export function formatDuration(seconds: number, opts: { short?: boolean } = {}): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h >= 100 || (opts.short && h >= 10)) return `${h.toLocaleString()}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/** Split a duration into number/unit pairs for large typographic display. */
export function durationParts(seconds: number): Array<{ value: string; unit: string }> {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return [{ value: h.toLocaleString(), unit: 'h' }, { value: String(m).padStart(2, '0'), unit: 'm' }];
  if (m > 0) return [{ value: String(m), unit: 'm' }];
  return [{ value: String(s), unit: 's' }];
}

export function formatCompact(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n < 1000) return n.toLocaleString();
  const units: Array<[number, string]> = [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [v, u] of units) {
    if (n >= v) {
      const x = n / v;
      return `${x >= 100 ? Math.round(x) : x >= 10 ? x.toFixed(1).replace(/\.0$/, '') : x.toFixed(2).replace(/\.?0+$/, '')}${u}`;
    }
  }
  return String(n);
}

export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString();
}

export function formatPercent(fraction: number, digits = 0): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function formatSignedPercent(fraction: number): string {
  const v = Math.round(fraction * 100);
  return `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v)}%`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function monthName(m: number, short = false): string {
  return short ? MONTHS[m].slice(0, 3) : MONTHS[m];
}

export function formatDate(t: number, style: 'long' | 'month' | 'short' | 'weekday' | 'year' = 'long'): string {
  const d = new Date(t);
  switch (style) {
    case 'month':
      return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    case 'short':
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    case 'weekday':
      return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    case 'year':
      return String(d.getFullYear());
    default:
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }
}

export function formatHour(h: number): string {
  const hh = ((h % 24) + 24) % 24;
  if (hh === 0) return '12 AM';
  if (hh === 12) return '12 PM';
  return hh < 12 ? `${hh} AM` : `${hh - 12} PM`;
}

/** "7 years", "3 months", "12 days" */
export function formatSpan(ms: number): string {
  const days = Math.floor(ms / 86_400_000);
  if (days >= 365) {
    const y = Math.floor(days / 365.25);
    const rem = Math.floor((days - y * 365.25) / 30.44);
    return rem >= 1 && y < 3 ? `${y} ${y === 1 ? 'year' : 'years'}, ${rem} ${rem === 1 ? 'month' : 'months'}` : `${y} ${y === 1 ? 'year' : 'years'}`;
  }
  if (days >= 60) return `${Math.floor(days / 30.44)} months`;
  if (days >= 1) return `${days} ${days === 1 ? 'day' : 'days'}`;
  return 'today';
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** Share of an audience that arrived after you, floored and capped at 99% so it never overstates. */
export function formatAudienceShare(fraction: number): string {
  return `${Math.min(99, Math.floor(fraction * 100))}%`;
}
