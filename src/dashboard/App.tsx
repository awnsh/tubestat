import { useEffect } from 'react';
import { DataContext, useDatabaseState } from '../hooks/useDatabase';
import { useRoute } from '../hooks/useRoute';
import { Shell, NAV } from '../components/Shell';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Overview } from '../pages/Overview';
import { Creators } from '../pages/Creators';
import { CreatorDetail } from '../pages/CreatorDetail';
import { History } from '../pages/History';
import { Insights } from '../pages/Insights';
import { Leaderboard } from '../pages/Leaderboard';
import { Profile } from '../pages/Profile';
import { resyncQuietly } from '../youtube/api';
import { dispatch } from '../lib/dispatch';

const TITLES: Record<string, string> = Object.fromEntries(NAV.map((n) => [n.id, n.label]));

export function App() {
  const state = useDatabaseState();
  const [page = 'overview', sub] = useRoute();
  const active = page === 'welcome' ? 'overview' : page;

  useEffect(() => {
    document.title = `${TITLES[active] ?? 'TubeStat'} · TubeStat`;
  }, [active]);

  const db = state.sample ? null : state.db;
  useEffect(() => {
    if (!db) return;
    resyncQuietly({
      lastSync: db.meta.lastApiSync,
      clientId: db.settings.googleClientId,
      watchedChannelIds: Object.keys(db.channels),
      apply: (payload) => dispatch({ type: 'api:apply', payload }),
    });
  }, [db]);

  if (!state.db || !state.analytics) return <div className="min-h-screen bg-ink" />;

  return (
    <DataContext.Provider value={state}>
      <Shell active={active}>
        <ErrorBoundary key={location.hash}>
        {active === 'creators' && sub ? (
          <CreatorDetail key={sub} channelId={sub} />
        ) : active === 'creators' ? (
          <Creators />
        ) : active === 'history' ? (
          <History key={sub ?? ''} sub={sub} />
        ) : active === 'insights' ? (
          <Insights />
        ) : active === 'leaderboard' ? (
          <Leaderboard />
        ) : active === 'profile' ? (
          <Profile />
        ) : (
          <Overview welcome={page === 'welcome'} />
        )}
        </ErrorBoundary>
      </Shell>
    </DataContext.Provider>
  );
}
