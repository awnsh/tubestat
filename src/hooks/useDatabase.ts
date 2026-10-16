import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { loadDatabase } from '../storage/db';
import { kvSubscribe } from '../storage/kv';
import type { Database } from '../storage/schema';
import { Analytics } from '../analytics/engine';
import { makeSampleDatabase } from '../lib/sample-data';

const DEMO_KEY = 'tubestat:preview-sample';

function readDemoFlag(): boolean {
  try {
    return localStorage.getItem(DEMO_KEY) === '1';
  } catch {
    return false;
  }
}

export interface DataState {
  db: Database | null;
  analytics: Analytics | null;
  /** True while the in-memory sample data is shown instead of real data. */
  sample: boolean;
  setSample: (on: boolean) => void;
  reload: () => void;
}

/** Loads the database, and reloads (debounced) whenever storage changes. */
export function useDatabaseState(): DataState {
  const [real, setReal] = useState<Database | null>(null);
  const [sample, setSampleState] = useState(readDemoFlag);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadDatabase().then((db) => !cancelled && setReal(db));
    return () => {
      cancelled = true;
    };
  }, [version]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = kvSubscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(() => setVersion((v) => v + 1), 800);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, []);

  const sampleDb = useMemo(() => (sample ? makeSampleDatabase() : null), [sample]);
  const db = sample ? sampleDb : real;
  const analytics = useMemo(() => (db ? new Analytics(db) : null), [db]);

  return {
    db,
    analytics,
    sample,
    setSample: (on) => {
      try {
        localStorage.setItem(DEMO_KEY, on ? '1' : '0');
      } catch {
        /* preview flag just won't persist */
      }
      setSampleState(on);
    },
    reload: () => setVersion((v) => v + 1),
  };
}

export const DataContext = createContext<DataState | null>(null);

export function useData(): DataState & { db: Database; analytics: Analytics } {
  const ctx = useContext(DataContext);
  if (!ctx?.db || !ctx.analytics) throw new Error('useData must be used after the database has loaded');
  return ctx as DataState & { db: Database; analytics: Analytics };
}
