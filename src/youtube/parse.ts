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

/** Ask YouTube's image CDN for a larger avatar than the 88px one on the watch page. */
export function upscaleAvatar(url: string | null, size = 176): string | null {
  if (!url) return null;
  return url.replace(/=s\d+-/, `=s${size}-`);
}
