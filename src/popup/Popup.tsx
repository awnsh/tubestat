import { useMemo } from 'react';
import { useDatabaseState } from '../hooks/useDatabase';
import { elapsedComparable, previousRange, rangeFor } from '../analytics/periods';
import { formatDuration } from '../lib/format';
import { Avatar, Change, Duration, Scrubber } from '../components/ui';

/** A glance, not a dashboard: this week, top creator, top category. */
export function Popup() {
  const { db, analytics: a, sample } = useDatabaseState();
  const view = useMemo(() => {
    if (!a) return null;
    const week = rangeFor('week');
    const s = a.summary(week);
    const prev = a.summary(elapsedComparable(week, previousRange(week)!));
    return {
      s,
      change: prev.watchSeconds >= 1800 ? s.watchSeconds / prev.watchSeconds - 1 : null,
      top: a.topCreators(week, 'time', 1)[0],
      cat: a.categoryShares(week).items[0],
      today: a.summary(rangeFor('day')).watchSeconds,
    };
  }, [a]);

  const open = (hash = '') => {
    const url = (typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL('dashboard.html') : '/dashboard.html') + hash;
    if (typeof chrome !== 'undefined' && chrome.tabs) chrome.tabs.create({ url });
    else window.open(url);
    window.close();
  };

  if (!db || !view) return <div className="h-[420px] w-[340px] bg-ink" />;
  const { s, change, top, cat } = view;

  return (
    <div className="w-[340px] bg-ink px-6 pb-6 pt-5 text-paper">
      <div className="flex items-center justify-between">
        <h1 className="display text-[18px]">Your YouTube</h1>
        <span className="flex items-center gap-1.5 text-[11px] text-dim">
          <span className={db.settings.trackingEnabled && !sample ? 'h-1.5 w-1.5 rounded-full bg-play' : 'h-1.5 w-1.5 rounded-full bg-faint'} />
          {sample ? 'Sample' : db.settings.trackingEnabled ? 'Tracking' : 'Paused'}
        </span>
      </div>

      <div className="mt-6">
        <Duration seconds={s.watchSeconds} className="hero-num block text-[45px]" />
        <div className="mt-2 flex items-baseline justify-between text-[13px] text-dim">
          <span>this week, {s.videos} videos</span>
          <Change value={change} />
        </div>
      </div>

      <div className="mt-6 space-y-5 border-t border-line pt-5">
        <div>
          <p className="text-[12px] text-dim">Top creator</p>
          {top ? (
            <div className="mt-2 flex items-center gap-3">
              <Avatar src={top.avatar} name={top.channelName} size={36} />
              <div className="min-w-0">
                <p className="truncate text-[15px]">{top.channelName}</p>
                <p className="tnum text-[12px] text-dim">{formatDuration(top.watchSeconds)}</p>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-[14px] text-dim">Nothing yet this week.</p>
          )}
        </div>
        {cat ? (
          <div>
            <div className="flex items-baseline justify-between">
              <p className="text-[12px] text-dim">Top category</p>
              <p className="tnum text-[12px] text-dim">{Math.round(cat.share * 100)}%</p>
            </div>
            <p className="mt-1 text-[15px]">{cat.category}</p>
            <Scrubber value={cat.share} head className="mt-2" />
          </div>
        ) : null}
      </div>

      <button onClick={() => open()} className="mt-6 w-full rounded-lg bg-paper py-2.5 text-[14px] font-medium text-ink hover:bg-white">
        Open dashboard
      </button>
      <p className="tnum mt-3 text-center text-[11px] text-faint">{formatDuration(view.today)} today</p>
    </div>
  );
}
