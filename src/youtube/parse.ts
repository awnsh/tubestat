/** Parsers for the text YouTube shows on its pages. */

const SUFFIX: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };

/**
 * "6.62M subscribers" → 6_620_000, "12,400 subscribers" → 12_400.
 * YouTube rounds public counts to three significant figures, so the result is
 * as precise as YouTube lets anyone see. Returns null for text we can't read
 * (e.g. hidden counts or unsupported locales).
 */
export function parseCount(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.replace(/ /g, ' ').match(/(\d[\d,.]*)\s*([KMB])?\b/i);
  if (!m) return null;
  const suffix = m[2]?.toLowerCase();
  let num = m[1];
  if (suffix) {
    num = num.replace(/,/g, '.');
    const v = parseFloat(num);
    return Number.isFinite(v) ? Math.round(v * SUFFIX[suffix]) : null;
  }
  const v = parseInt(num.replace(/[,.]/g, ''), 10);
  return Number.isFinite(v) ? v : null;
}

export function videoIdFromUrl(url: string): { videoId: string; isShort: boolean } | null {
  try {
    const u = new URL(url);
    if (u.pathname === '/watch') {
      const v = u.searchParams.get('v');
      return v ? { videoId: v, isShort: false } : null;
    }
    const shorts = u.pathname.match(/^\/shorts\/([\w-]{6,})/);
    if (shorts) return { videoId: shorts[1], isShort: true };
  } catch {
    /* not a URL */
  }
  return null;
}

/** "http://www.youtube.com/@jawed" → "@jawed" */
export function handleFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/(@[^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function thumbnailFor(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

/** "12:34" → 754, "1:02:03" → 3723. Null for anything else (e.g. "LIVE"). */
export function parseLength(text: string | null | undefined): number | null {
  const m = text?.trim().match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  return m[3] != null ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : Number(m[1]) * 60 + Number(m[2]);
}

const startOfLocalDay = (t: number) => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/**
 * The day a section of youtube.com/feed/history is headed with — "Today",
 * "Yesterday", a weekday for the past week, then "Oct 12" or "Oct 12, 2024" —
 * as local midnight. Uses the page's language for the words, so it works
 * beyond English. Null when the header can't be read; those items are skipped
 * rather than guessed.
 */
export function parseHistoryDay(text: string | null | undefined, lang = 'en', now = Date.now()): number | null {
  const s = text?.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return null;
  const today = startOfLocalDay(now);
  const back = (n: number) => startOfLocalDay(new Date(today).setDate(new Date(today).getDate() - n));
  try {
    const rel = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
    if (s === rel.format(0, 'day').toLowerCase()) return today;
    if (s === rel.format(-1, 'day').toLowerCase()) return back(1);
    const weekday = new Intl.DateTimeFormat(lang, { weekday: 'long' });
    for (let n = 2; n < 7; n++) if (s === weekday.format(back(n)).toLowerCase()) return back(n);

    const months = ['long', 'short'].flatMap((style) =>
      Array.from({ length: 12 }, (_, m) => ({ m, name: new Intl.DateTimeFormat(lang, { month: style as 'long' | 'short' }).format(new Date(2000, m, 15)).toLowerCase().replace(/\.$/, '') })),
    );
    // Longest names first so "june" wins over "jun".
    const month = months.sort((a, b) => b.name.length - a.name.length).find((x) => x.name && s.includes(x.name));
    const nums = s.match(/\d+/g)?.map(Number) ?? [];
    const day = nums.find((n) => n >= 1 && n <= 31);
    if (!month || day == null) return null;
    const year = nums.find((n) => n >= 2005 && n <= 2100);
    let t = new Date(year ?? new Date(now).getFullYear(), month.m, day).getTime();
    // A header without a year is this year, unless that would be in the future.
    if (year == null && t > today) t = new Date(new Date(now).getFullYear() - 1, month.m, day).getTime();
    return t;
  } catch {
    return null;
  }
}

/** Ask YouTube's image CDN for a larger avatar than the 88px one on the watch page. */
export function upscaleAvatar(url: string | null, size = 176): string | null {
  if (!url) return null;
  return url.replace(/=s\d+-/, `=s${size}-`);
}
