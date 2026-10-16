import type { Category } from '../analytics/categories';
import type { OgTier } from '../analytics/og';

/**
 * Colour follows the category, never its rank, so a category keeps its
 * colour on every screen. Fifteen categories share five hues by family;
 * every use also shows the category's name, so colour is never the only cue.
 */
export const CATEGORY_COLOR: Record<Category, string> = {
  Programming: 'var(--color-cat-blue)',
  News: 'var(--color-cat-blue)',
  Technology: 'var(--color-cat-cyan)',
  Science: 'var(--color-cat-cyan)',
  Gaming: 'var(--color-cat-green)',
  Sports: 'var(--color-cat-green)',
  Vlogs: 'var(--color-cat-green)',
  Education: 'var(--color-cat-amber)',
  Business: 'var(--color-cat-amber)',
  Entrepreneurship: 'var(--color-cat-amber)',
  Commentary: 'var(--color-cat-magenta)',
  Music: 'var(--color-cat-magenta)',
  Comedy: 'var(--color-cat-magenta)',
  Entertainment: 'var(--color-cat-magenta)',
  Other: 'var(--color-cat-other)',
};

export const categoryColor = (c: Category | string | null | undefined) => CATEGORY_COLOR[c as Category] ?? 'var(--color-cat-other)';

/** Badge colours: the earlier you were, the hotter the badge. */
export const TIER_STYLE: Record<OgTier, { bg: string; fg: string } | null> = {
  'DAY ONE': { bg: 'var(--color-bar-red)', fg: '#fff' },
  OG: { bg: 'var(--color-bar-yellow)', fg: '#1a1600' },
  EARLY: { bg: 'var(--color-bar-cyan)', fg: '#00191c' },
  ESTABLISHED: null,
  RECENT: null,
};

/**
 * The test-pattern bars, in broadcast order. Written out in full: Tailwind
 * only emits theme variables it can find literally in the source.
 */
export const STRIP = [
  'var(--color-bar-white)',
  'var(--color-bar-yellow)',
  'var(--color-bar-cyan)',
  'var(--color-bar-green)',
  'var(--color-bar-magenta)',
  'var(--color-bar-red)',
  'var(--color-bar-blue)',
];

/** Data-safe hues for things that need a stable colour per name (avatars, slides). */
const HUES = ['--color-cat-blue', '--color-cat-amber', '--color-cat-green', '--color-cat-magenta', '--color-cat-cyan'];

export function hueFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}

/** Tinted circle + same-hue initial, for creators without a picture. */
export function avatarTone(name: string): { background: string; color: string } {
  const v = hueFor(name);
  return { background: `color-mix(in oklab, var(${v}) 28%, var(--color-ink))`, color: `color-mix(in oklab, var(${v}) 55%, white)` };
}
