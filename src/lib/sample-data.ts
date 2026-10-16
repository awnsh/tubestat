/**
 * Sample data for previewing the dashboard before real history exists.
 * Held in memory only — never written to storage, never mixed with real data —
 * and every screen shows a "Sample data" banner while it's on.
 * Creators are fictional.
 */
import { isoWeek } from '../analytics/periods';
import { DEFAULT_SETTINGS, type Channel, type Database, type Subscription, type Watch } from '../storage/schema';

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Creator {
  id: string;
  name: string;
  cat: string;
  len: number; // typical video minutes
  words: string[];
  weight: number;
  /** How their share of your viewing drifts over the 14 months: -1 fading, +1 rising. */
  trend: number;
  subs: number;
  created: number; // year
  subscribed?: [number, number]; // year, month
  thenSubs?: number;
  shorts?: number;
}

const CREATORS: Creator[] = [
  { id: 'lumen', name: 'Lumen Labs', cat: 'Science & Technology', len: 16, words: ['iPhone review', 'The best laptop', 'GPU showdown', 'Smartphone awards'], weight: 10, trend: 0.4, subs: 19_800_000, created: 2009, subscribed: [2019, 6], thenSubs: 1_800_000 },
  { id: 'kai', name: 'Kai Codes', cat: 'Science & Technology', len: 22, words: ['TypeScript tips', 'Rust in 100 seconds', 'React server components', 'Build an API'], weight: 8, trend: 1, subs: 3_400_000, created: 2017, subscribed: [2020, 2], thenSubs: 12_400 },
  { id: 'ferrous', name: 'Ferrous', cat: 'Education', len: 28, words: ['Algorithms explained', 'Compilers from scratch', 'Data structures course', 'Linux deep dive'], weight: 5, trend: 1, subs: 842_000, created: 2019, subscribed: [2021, 9], thenSubs: 842 },
  { id: 'quarry', name: 'Quarry Games', cat: 'Gaming', len: 35, words: ['Minecraft hardcore', 'Elden Ring boss', 'Speedrun attempt', 'Gameplay'], weight: 9, trend: -1, subs: 6_100_000, created: 2012, subscribed: [2018, 3], thenSubs: 2_100_000, shorts: 0.3 },
  { id: 'arcade', name: 'Night Arcade', cat: 'Gaming', len: 24, words: ["Let's play", 'Walkthrough', 'Nintendo direct', 'Roblox'], weight: 6, trend: -0.8, subs: 1_200_000, created: 2015 },
  { id: 'fieldnotes', name: 'Field Notes', cat: 'Education', len: 19, words: ['The history of', 'Documentary', 'How cities work', 'Explained'], weight: 6, trend: 0.5, subs: 4_700_000, created: 2014, subscribed: [2020, 11], thenSubs: 900_000 },
  { id: 'orbital', name: 'Orbital', cat: 'Science & Technology', len: 14, words: ['Black hole physics', 'Quantum explained', 'NASA launch', 'Space telescope'], weight: 4, trend: 0.6, subs: 2_300_000, created: 2016, subscribed: [2022, 1] },
  { id: 'margin', name: 'Margin Call', cat: 'People & Blogs', len: 18, words: ['Startup founder story', 'Side hustle', 'Entrepreneur interview', 'SaaS numbers'], weight: 4, trend: 0.8, subs: 610_000, created: 2020, subscribed: [2023, 4], thenSubs: 180_000 },
  { id: 'ledger', name: 'Ledger', cat: 'Education', len: 15, words: ['Stock market', 'Investing basics', 'Economy explained', 'Earnings'], weight: 3, trend: 0.3, subs: 1_900_000, created: 2018 },
  { id: 'loud', name: 'Loud Room', cat: 'Comedy', len: 9, words: ['Sketch', 'Stand-up special', 'Funny moments', 'Comedy'], weight: 4, trend: -0.2, subs: 8_800_000, created: 2011, shorts: 0.6 },
  { id: 'sideline', name: 'Sideline', cat: 'Sports', len: 11, words: ['NBA highlights', 'F1 race recap', 'Premier League', 'Highlights'], weight: 3, trend: 0, subs: 5_200_000, created: 2013, shorts: 0.4 },
  { id: 'wire', name: 'The Wire Desk', cat: 'News & Politics', len: 12, words: ['Breaking news', 'Election night', 'World report', 'Politics'], weight: 2, trend: 0, subs: 12_000_000, created: 2008 },
  { id: 'tangent', name: 'Tangent Pod', cat: 'Entertainment', len: 62, words: ['Podcast ep. 212', 'Reacts to', 'Commentary', 'The truth about'], weight: 5, trend: 0.2, subs: 2_800_000, created: 2016, subscribed: [2021, 5], thenSubs: 450_000 },
  { id: 'vinyl', name: 'Vinyl Hour', cat: 'Music', len: 4, words: ['Official music video', 'Live performance', 'Lyric video', 'Remix'], weight: 3, trend: 0, subs: 15_000_000, created: 2010, shorts: 0.2 },
  { id: 'wander', name: 'Wander Days', cat: 'Travel & Events', len: 21, words: ['Vlog', 'A week in Tokyo', 'Day in the life', 'Travel'], weight: 2, trend: -0.3, subs: 980_000, created: 2017 },
  { id: 'bench', name: 'Bench Build', cat: 'Howto & Style', len: 17, words: ['Desk setup tour', 'PC build guide', 'How to'], weight: 2, trend: 0.3, subs: 420_000, created: 2019, subscribed: [2024, 2], thenSubs: 150_000 },
  { id: 'pixel', name: 'Pixel Parade', cat: 'Film & Animation', len: 13, words: ['Short film', 'Animation', 'Behind the scenes'], weight: 2, trend: 0, subs: 3_100_000, created: 2014 },
];

const EXTRA_NAMES = ['Northbound', 'Signal Path', 'Low Orbit', 'Common Room', 'Paper Plane', 'Glasshouse', 'Brightline', 'Studio Nine', 'Quiet Hours', 'Riverbank', 'Copper Street', 'Open Shelf', 'Oddly Useful', 'Wavelength', 'Small Batch'];
const EXTRA_CATS = ['Entertainment', 'Science & Technology', 'Education', 'Gaming', 'Comedy', 'People & Blogs', 'Music'];

const HOUR_WEIGHTS = [4, 2, 1, 0.3, 0.1, 0.1, 0.3, 0.8, 1, 1, 1, 1.2, 1.8, 1.5, 1.2, 1.3, 1.6, 2, 2.6, 3.2, 4, 5, 5.5, 5];

function pickWeighted<T>(r: () => number, items: T[], weight: (t: T) => number): T {
  const total = items.reduce((s, i) => s + weight(i), 0);
  let x = r() * total;
  for (const i of items) {
    x -= weight(i);
    if (x <= 0) return i;
  }
  return items[items.length - 1];
}

export function makeSampleDatabase(now = Date.now()): Database {
  const r = rng(20260926);
  const channelId = (slug: string) => `UCsample${slug.padEnd(14, 'x')}`;
  const creators: Creator[] = [
    ...CREATORS,
    ...EXTRA_NAMES.map((name, i) => ({
      id: `extra${i}`,
      name,
      cat: EXTRA_CATS[i % EXTRA_CATS.length],
      len: 8 + Math.round(r() * 20),
      words: ['New video', 'Episode', 'Part 2', 'Update'],
      weight: 0.4,
      trend: r() - 0.5,
      subs: Math.round(20_000 + r() * 900_000),
      created: 2015 + Math.floor(r() * 8),
    })),
  ];

  const start = new Date(now);
  start.setMonth(start.getMonth() - 14, 1);
  start.setHours(0, 0, 0, 0);
  const totalDays = Math.floor((now - start.getTime()) / 86_400_000);

  const watches: Watch[] = [];
  let n = 0;
  for (let day = 0; day <= totalDays; day++) {
    const progress = day / totalDays; // 0 → 1 across the span
    const date = new Date(start.getTime() + day * 86_400_000);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    const skip = r() < (weekend ? 0.04 : 0.1);
    if (skip) continue;
    const sessions = 1 + Math.floor(r() * (weekend ? 3.2 : 2.3));
    for (let s = 0; s < sessions; s++) {
      const hour = HOUR_WEIGHTS.indexOf(pickWeighted(r, HOUR_WEIGHTS, (w) => w));
      let t = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, Math.floor(r() * 60)).getTime();
      if (t > now) continue;
      const count = 2 + Math.floor(r() * (weekend ? 10 : 6));
      for (let v = 0; v < count && t < now; v++) {
        const c = pickWeighted(r, creators, (x) => Math.max(0.05, x.weight * (1 + x.trend * (progress - 0.5) * 1.6)));
        const isShort = r() < (c.shorts ?? 0.08);
        const duration = isShort ? 15 + Math.floor(r() * 45) : Math.round(c.len * 60 * (0.6 + r() * 0.8));
        const pct = isShort ? 100 : Math.min(100, r() < 0.55 ? 92 + r() * 8 : 10 + r() * 75);
        const watched = Math.round(duration * (pct / 100) * (isShort ? 1 + Math.floor(r() * 2) : 1));
        const vid = `s${(n++).toString(36).padStart(10, '0')}`;
        watches.push({
          id: `sample-${n}`,
          videoId: vid,
          title: `${c.words[Math.floor(r() * c.words.length)]}${r() < 0.4 ? ` — part ${1 + Math.floor(r() * 4)}` : ''}`,
          channelId: channelId(c.id),
          channelName: c.name,
          thumbnail: '',
          duration,
          watchedSeconds: watched,
          percentageWatched: Math.round(pct * 10) / 10,
          timestamp: t,
          endedAt: t + watched * 1000,
          completed: pct >= 90,
          isShort,
          isLive: false,
          ytCategory: c.cat,
          source: 'tracked',
        });
        t += (watched + 10 + r() * 60) * 1000;
      }
    }
  }

  const channels: Record<string, Channel> = {};
  const subscriptions: Record<string, Subscription> = {};
  for (const c of creators) {
    const id = channelId(c.id);
    const own = watches.filter((w) => w.channelId === id);
    if (!own.length && !c.subscribed) continue;
    // Snapshot history for the span the "extension" has been installed.
    const history = [];
    for (let t = start.getTime(); t < now; t += 7 * 86_400_000) {
      const f = (t - start.getTime()) / (now - start.getTime());
      history.push({ t, count: Math.round(c.subs * (0.82 + 0.18 * f)), source: 'page' as const });
    }
    channels[id] = {
      channelId: id,
      channelName: c.name,
      handle: `@${c.name.replace(/\s+/g, '').toLowerCase()}`,
      avatar: null,
      url: 'https://www.youtube.com/',
      subscriberCount: c.subs,
      firstSeen: own[0]?.timestamp ?? start.getTime(),
      totalWatchTime: own.reduce((s, w) => s + (w.watchedSeconds ?? 0), 0),
      videosWatched: own.length,
      createdAt: new Date(c.created, 2, 10).getTime(),
      subscriberHistory: history,
      lastSeenSubscribed: !!c.subscribed,
      lastSeenSubscribedAt: now,
      updatedAt: now,
    };
    if (c.subscribed) {
      const date = new Date(c.subscribed[0], c.subscribed[1] - 1, 12).getTime();
      subscriptions[id] = {
        channelId: id,
        subscriptionDate: date,
        subscriptionDateSource: c.thenSubs ? 'observed' : 'api',
        subscriberCountAtSubscription: c.thenSubs ?? null,
        currentSubscriberCount: c.subs,
        firstObserved: start.getTime(),
        lastObserved: now,
        active: true,
      };
    }
  }

  const activeDays = [...new Set(watches.map((w) => new Date(w.timestamp).toISOString().slice(0, 10)))];
  return {
    meta: { schemaVersion: 1, installedAt: start.getTime(), activeDays, lastSubscriptionSync: now, lastApiSync: now, takeoutImportedAt: null },
    settings: { ...DEFAULT_SETTINGS, displayName: 'Sam' },
    watches,
    channels,
    subscriptions,
    groups: [
      {
        id: 'sample-group',
        name: 'Purdue Friends',
        createdAt: start.getTime(),
        members: [
          { memberId: 'sample-me', name: 'Sam', isYou: true, card: null, updatedAt: now },
          ...[
            ['Jake', 15.2, 121, 34, 12],
            ['Alex', 11.1, 97, 29, 5],
            ['Priya', 9.4, 88, 41, 9],
          ].map(([name, h, v, c, streak], i) => ({
            memberId: `sample-${i}`,
            name: name as string,
            isYou: false,
            updatedAt: now,
            card: {
              v: 1 as const,
              memberId: `sample-${i}`,
              name: name as string,
              week: isoWeek(now),
              weekWatchSeconds: (h as number) * 3600,
              weekVideos: v as number,
              weekCreators: c as number,
              currentStreak: Math.max(1, (streak as number) - 3),
              longestStreak: streak as number,
              totalHours: (h as number) * 40,
              generatedAt: now,
            },
          })),
        ],
      },
    ],
    memberId: 'sample-me',
  };
}
