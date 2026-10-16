/**
 * Video categorisation.
 *
 * Layer 1 — YouTube's own category from the video's metadata (verified; set by
 *           the uploader, e.g. "Science & Technology").
 * Layer 2 — title keywords, used only to refine a broad YouTube category into
 *           a narrower one it allows (Science & Technology → Programming).
 * Layer 3 — for imported viewings with no metadata, the category the same
 *           channel's tracked videos usually have, then keywords alone.
 *
 * Every result says which layer decided it, so the UI can be honest about it.
 * To improve accuracy, edit KEYWORDS or YT_MAP; nothing else depends on them.
 */
import type { Watch } from '../storage/schema';

export const CATEGORIES = [
  'Technology',
  'Programming',
  'Gaming',
  'Education',
  'Science',
  'Business',
  'Entrepreneurship',
  'Music',
  'Comedy',
  'Sports',
  'News',
  'Commentary',
  'Vlogs',
  'Entertainment',
  'Other',
] as const;

export type Category = (typeof CATEGORIES)[number];
export type CategoryBasis = 'youtube' | 'youtube+keywords' | 'channel' | 'keywords' | 'none';

export interface Classification {
  category: Category;
  basis: CategoryBasis;
}

const KEYWORDS: Partial<Record<Category, string[]>> = {
  Programming: [
    'programming', 'coding', 'code', 'coder', 'javascript', 'typescript', 'python', 'rust', 'golang', 'java', 'c\\+\\+', 'c#',
    'react', 'nextjs', 'next\\.js', 'vue', 'svelte', 'node\\.?js', 'developer', 'software engineer', 'software engineering',
    'leetcode', 'algorithm', 'algorithms', 'data structures', 'api', 'backend', 'frontend', 'full ?stack', 'css', 'html',
    'linux', 'git', 'github', 'compiler', 'devops', 'kubernetes', 'docker', 'neovim', 'vim', 'vscode', 'sql', 'database', 'web dev',
  ],
  Technology: [
    'iphone', 'ipad', 'macbook', 'android', 'laptop', 'gpu', 'cpu', 'tech', 'gadget', 'smartphone', 'pixel', 'samsung', 'galaxy',
    'unboxing', 'pc build', 'setup tour', 'headphones', 'camera', 'ai', 'chatgpt', 'openai', 'claude', 'nvidia', 'apple', 'vision pro',
  ],
  Science: [
    'physics', 'chemistry', 'biology', 'space', 'nasa', 'quantum', 'math', 'mathematics', 'universe', 'astronomy', 'experiment',
    'evolution', 'black hole', 'neuroscience', 'engineering', 'rocket',
  ],
  Business: [
    'business', 'stocks', 'stock market', 'investing', 'investment', 'economy', 'economics', 'finance', 'money', 'bitcoin', 'crypto',
    'earnings', 'ceo', 'company', 'real estate', 'inflation', 'recession', 'marketing',
  ],
  Entrepreneurship: [
    'startup', 'startups', 'founder', 'founders', 'entrepreneur', 'entrepreneurship', 'side hustle', 'saas', 'bootstrapped',
    'y combinator', 'ycombinator', 'dropshipping', 'agency', 'my business', 'indie hacker', 'solopreneur',
  ],
  Commentary: ['podcast', 'reacts', 'reaction', 'commentary', 'drama', 'the truth about', 'opinion', 'rant', 'debate', 'interview', 'ep\\.? ?\\d+'],
  News: ['news', 'breaking', 'election', 'president', 'politics', 'congress', 'senate', 'war', 'report'],
  Music: ['official video', 'official music video', 'music video', 'lyrics', 'lyric video', 'remix', 'album', 'song', 'live performance', 'cover', 'ft\\.', 'feat\\.', 'audio'],
  Gaming: [
    'minecraft', 'fortnite', 'gameplay', 'speedrun', 'gta', 'valorant', 'league of legends', 'elden ring', 'nintendo', 'playstation',
    'xbox', 'gaming', "let's play", 'walkthrough', 'roblox', 'call of duty', 'pokemon', 'zelda', 'steam',
  ],
  Sports: ['nba', 'nfl', 'fifa', 'soccer', 'football', 'highlights', 'ufc', 'f1', 'formula 1', 'cricket', 'tennis', 'golf', 'basketball', 'baseball', 'mlb', 'nhl', 'premier league'],
  Comedy: ['sketch', 'stand-?up', 'comedy', 'funny', 'prank', 'snl'],
  Vlogs: ['vlog', 'day in the life', 'travel', 'a week in', 'morning routine', 'moving to', 'my life'],
  Education: ['lecture', 'course', 'explained', 'how to', 'learn', 'lesson', 'history of', 'documentary', 'tutorial', 'crash course', 'guide'],
};

const PATTERNS: Array<[Category, RegExp]> = Object.entries(KEYWORDS).map(([cat, words]) => [
  cat as Category,
  new RegExp(`(?:^|[^\\w])(?:${words!.join('|')})(?=$|[^\\w])`, 'gi'),
]);

/** YouTube category → default, plus the narrower categories keywords may refine it into. */
const YT_MAP: Record<string, { base: Category; refine: Category[] }> = {
  'Science & Technology': { base: 'Technology', refine: ['Programming', 'Science', 'Business', 'Entrepreneurship', 'Gaming'] },
  Education: { base: 'Education', refine: ['Programming', 'Science', 'Business', 'Entrepreneurship', 'Technology'] },
  Gaming: { base: 'Gaming', refine: [] },
  Music: { base: 'Music', refine: [] },
  Comedy: { base: 'Comedy', refine: [] },
  Sports: { base: 'Sports', refine: [] },
  'News & Politics': { base: 'News', refine: ['Commentary', 'Business'] },
  'People & Blogs': { base: 'Vlogs', refine: ['Commentary', 'Business', 'Entrepreneurship', 'Programming', 'Technology', 'Gaming', 'Education', 'Science', 'Comedy'] },
  Entertainment: { base: 'Entertainment', refine: ['Commentary', 'Gaming', 'Comedy', 'Technology', 'Sports', 'Music'] },
  'Film & Animation': { base: 'Entertainment', refine: ['Comedy', 'Commentary'] },
  'Howto & Style': { base: 'Education', refine: ['Programming', 'Technology', 'Vlogs'] },
  'Travel & Events': { base: 'Vlogs', refine: [] },
  'Autos & Vehicles': { base: 'Other', refine: ['Technology', 'Sports'] },
  'Pets & Animals': { base: 'Other', refine: ['Science'] },
  'Nonprofits & Activism': { base: 'Other', refine: ['News', 'Education'] },
};

function keywordScores(text: string): Map<Category, number> {
  const scores = new Map<Category, number>();
  for (const [cat, re] of PATTERNS) {
    re.lastIndex = 0;
    const hits = text.match(re)?.length ?? 0;
    if (hits) scores.set(cat, hits);
  }
  return scores;
}

function best(scores: Map<Category, number>, allowed?: Category[]): Category | null {
  let top: Category | null = null;
  let topScore = 0;
  for (const [cat, s] of scores) {
    if (allowed && !allowed.includes(cat)) continue;
    if (s > topScore) {
      top = cat;
      topScore = s;
    }
  }
  return top;
}

export function classify(w: Pick<Watch, 'title' | 'ytCategory' | 'channelName'>, channelPrior?: Category | null): Classification {
  const text = `${w.title} ${w.channelName}`;
  if (w.ytCategory) {
    const mapped = YT_MAP[w.ytCategory];
    if (!mapped) return { category: 'Other', basis: 'youtube' };
    if (mapped.refine.length) {
      const refined = best(keywordScores(text), mapped.refine);
      if (refined) return { category: refined, basis: 'youtube+keywords' };
    }
    return { category: mapped.base, basis: 'youtube' };
  }
  if (channelPrior) return { category: channelPrior, basis: 'channel' };
  const kw = best(keywordScores(text));
  return kw ? { category: kw, basis: 'keywords' } : { category: 'Other', basis: 'none' };
}

/**
 * Classifies every watch, using each channel's most common YouTube-derived
 * category as a prior for viewings that have no metadata of their own.
 */
export function classifyAll(watches: Watch[]): Map<string, Classification> {
  const out = new Map<string, Classification>();
  const channelVotes = new Map<string, Map<Category, number>>();
  for (const w of watches) {
    if (!w.ytCategory) continue;
    const c = classify(w);
    out.set(w.id, c);
    const votes = channelVotes.get(w.channelId) ?? new Map<Category, number>();
    votes.set(c.category, (votes.get(c.category) ?? 0) + 1);
    channelVotes.set(w.channelId, votes);
  }
  const priors = new Map<string, Category>();
  for (const [ch, votes] of channelVotes) {
    const top = best(votes);
    if (top) priors.set(ch, top);
  }
  for (const w of watches) {
    if (!out.has(w.id)) out.set(w.id, classify(w, priors.get(w.channelId)));
  }
  return out;
}
