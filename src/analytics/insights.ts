/**
 * Plain-language observations generated from recorded data.
 * Every insight has a minimum-data rule; if the rule isn't met it isn't shown.
 * Wording states facts ("34% more") and never guesses at motives or feelings.
 */
import { formatDuration, formatHour, formatPercent } from '../lib/format';
import type { Analytics } from './engine';
import { addDays, DAY_MS, elapsedComparable, previousRange, rangeFor, startOfDay, type Range } from './periods';

export interface Insight {
  id: string;
  text: string;
  /** Higher = more interesting; used to pick the one shown on Overview. */
  weight: number;
}

const HOUR = 3600;

export function generateInsights(a: Analytics, now = Date.now()): Insight[] {
  const out: Insight[] = [];
  const week = rangeFor('week', now);
  const month = rangeFor('month', now);
  const all = rangeFor('all', now, a.firstDataAt ?? now);

  // Week over week, compared at the same point in each week.
  {
    const prev = elapsedComparable(week, previousRange(week)!, now);
    const cur = a.summary(week).watchSeconds;
    const was = a.summary(prev).watchSeconds;
    if (cur >= 1800 && was >= 1800) {
      const change = cur / was - 1;
      if (Math.abs(change) >= 0.1) {
        out.push({
          id: 'wow',
          text: `You watched ${formatPercent(Math.abs(change))} ${change > 0 ? 'more' : 'less'} YouTube this week than at this point last week.`,
          weight: 60 + Math.min(30, Math.abs(change) * 30),
        });
      }
    }
  }

  // Peak three-hour window.
  {
    const hours = a.hourly(all);
    const total = hours.reduce((x, y) => x + y, 0);
    if (total >= 5 * HOUR) {
      let bestStart = 0;
      let bestSum = 0;
      for (let h = 0; h < 24; h++) {
        const sum = hours[h] + hours[(h + 1) % 24] + hours[(h + 2) % 24];
        if (sum > bestSum) {
          bestSum = sum;
          bestStart = h;
        }
      }
      const share = bestSum / total;
      if (share >= 0.3) {
        out.push({
          id: 'peak',
          text: `${formatPercent(share)} of your watch time happens between ${formatHour(bestStart)} and ${formatHour(bestStart + 3)}.`,
          weight: 55 + share * 20,
        });
      }
    }
  }

  // Top category changed this month.
  {
    const prevMonth = previousRange(month)!;
    const cur = a.categoryShares(month);
    const prev = a.categoryShares(prevMonth);
    if (!cur.byVideos && !prev.byVideos && a.summary(month).watchSeconds >= HOUR && a.summary(prevMonth).watchSeconds >= HOUR) {
      const nowTop = cur.items[0];
      const wasTop = prev.items[0];
      if (nowTop && wasTop && nowTop.category !== wasTop.category) {
        out.push({
          id: 'category-shift',
          text: `${nowTop.category} became your most watched category this month, taking over from ${wasTop.category}.`,
          weight: 70,
        });
      }
    }
  }

  // Top creators' share of your time.
  {
    const s = a.summary(month);
    const top = a.topCreators(month, 'time', 3);
    if (s.watchSeconds >= 3 * HOUR && top.length === 3 && s.creators >= 8) {
      const share = top.reduce((x, c) => x + c.watchSeconds, 0) / s.watchSeconds;
      out.push({
        id: 'loyalty',
        text: `Three creators — ${top.map((c) => c.channelName).join(', ')} — account for ${formatPercent(share)} of your watch time this month.`,
        weight: 45 + share * 20,
      });
    }
  }

  // Shorts vs long-form.
  {
    const list = a.in(month).filter((w) => w.source === 'tracked');
    const shorts = list.filter((w) => w.isShort);
    if (list.length >= 30 && shorts.length >= 10) {
      const total = list.reduce((x, w) => x + (w.watchedSeconds ?? 0), 0);
      const shortSecs = shorts.reduce((x, w) => x + (w.watchedSeconds ?? 0), 0);
      out.push({
        id: 'shorts',
        text: `Shorts were ${formatPercent(shorts.length / list.length)} of the videos you watched this month but ${formatPercent(shortSecs / Math.max(1, total))} of your watch time.`,
        weight: 50,
      });
    }
  }

  // Completion rate.
  {
    const s = a.summary(all);
    if (s.startedLong >= 20) {
      out.push({
        id: 'completion',
        text: `You finish ${formatPercent(s.completedLong / s.startedLong)} of the long-form videos you start.`,
        weight: 40,
      });
    }
  }

  // Weekends vs weekdays (per day, over the last 8 weeks).
  {
    const r: Range = { kind: 'all', start: addDays(startOfDay(now), -56), end: now, label: '' };
    const span = (now - Math.max(r.start, a.firstDataAt ?? now)) / DAY_MS;
    if (span >= 14) {
      let we = 0;
      let wd = 0;
      let weDays = 0;
      let wdDays = 0;
      for (const d of a.daily({ ...r, start: Math.max(r.start, startOfDay(a.firstDataAt ?? now)) })) {
        const day = new Date(d.day).getDay();
        if (day === 0 || day === 6) {
          we += d.seconds;
          weDays++;
        } else {
          wd += d.seconds;
          wdDays++;
        }
      }
      const weAvg = we / Math.max(1, weDays);
      const wdAvg = wd / Math.max(1, wdDays);
      if (weAvg > 0 && wdAvg > 0) {
        const ratio = weAvg > wdAvg ? weAvg / wdAvg : wdAvg / weAvg;
        if (ratio >= 1.3) {
          out.push({
            id: 'weekend',
            text: `On an average ${weAvg > wdAvg ? 'weekend day' : 'weekday'} you watch ${ratio.toFixed(1)}× as much as on a ${weAvg > wdAvg ? 'weekday' : 'weekend day'} (${formatDuration(Math.max(weAvg, wdAvg))} vs ${formatDuration(Math.min(weAvg, wdAvg))}).`,
            weight: 45,
          });
        }
      }
    }
  }

  // New creators this month.
  {
    const fresh = a.newCreators(month);
    const trackedDays = (now - (a.firstDataAt ?? now)) / DAY_MS;
    if (fresh.length >= 3 && trackedDays >= 35) {
      out.push({
        id: 'discovery',
        text: `You found ${fresh.length} creators you’d never watched before this month. ${fresh[0].channelName} is the one you’ve watched most.`,
        weight: 50,
      });
    }
  }

  // Record day.
  {
    const days = a.daily(all);
    const best = days.reduce((x, d) => (d.seconds > x.seconds ? d : x), { day: 0, seconds: 0, videos: 0 });
    if (best.seconds >= 2 * HOUR && days.length >= 7) {
      out.push({
        id: 'record-day',
        text: `Your biggest day was ${new Date(best.day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}: ${formatDuration(best.seconds)} across ${best.videos} videos.`,
        weight: best.day >= addDays(startOfDay(now), -7) ? 65 : 35,
      });
    }
  }

  return out.sort((x, y) => y.weight - x.weight);
}
