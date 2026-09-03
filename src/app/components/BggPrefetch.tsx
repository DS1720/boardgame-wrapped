import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dataset } from '@/shared/types';
import { estimateRemainingSeconds, formatEta, type BggManifest } from '@/shared/bgg';

/**
 * BGG credit prefetch, driven from the UI but executed by the render service.
 *
 * The export carries designers and nothing else about who made a game — no
 * mechanics, categories, publisher or artist — so the five credit slides need
 * this to have been run at least once. Without it they simply do not appear.
 *
 * A sibling of the box art panel rather than a second button inside it: the two
 * report different things (no bytes here, no fallbacks) and merging them would
 * mean one component branching on which of two jobs is in flight.
 */

/** Proxied to the render service on :4000 by the dev server. */
const API = '/api';
const POLL_MS = 400;

interface Progress {
  done: number;
  total: number;
  fetched: number;
  skipped: number;
  failed: number;
  current: string | null;
}

interface Summary extends Omit<Progress, 'current'> {
  errors: Array<{ bggId: number; name: string; message: string }>;
}

interface PollResponse {
  running: boolean;
  progress: Progress | null;
  summary: Summary | null;
  error: string | null;
}

export const BggPrefetch: React.FC<{ dataset: Dataset }> = ({ dataset }) => {
  const [manifest, setManifest] = useState<BggManifest | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [running, setRunning] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  /*
    When the run started, for the estimate. A ref rather than state: it is read
    on every poll and never itself a reason to re-render.
  */
  const startedAt = useRef<number>(0);

  const games = [...dataset.gamesById.values()];
  // Only games matched to BGG can be looked up, and an id can be shared.
  const fetchable = new Set(games.filter((g) => g.bggId > 0).map((g) => g.bggId));

  const loadManifest = useCallback(async () => {
    try {
      const res = await fetch(`${API}/bgg/manifest`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setManifest((await res.json()) as BggManifest);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    void loadManifest();
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [loadManifest]);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`${API}/bgg/progress`);
      const state = (await res.json()) as PollResponse;
      if (state.progress) setProgress(state.progress);
      if (state.running) return;

      if (timer.current) window.clearInterval(timer.current);
      timer.current = null;
      setRunning(false);
      if (state.error) setError(state.error);
      if (state.summary) setSummary(state.summary);
      await loadManifest();
    } catch (err) {
      if (timer.current) window.clearInterval(timer.current);
      timer.current = null;
      setRunning(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [loadManifest]);

  const start = async () => {
    setError(null);
    setSummary(null);
    setRunning(true);
    startedAt.current = Date.now();
    setProgress({ done: 0, total: fetchable.size, fetched: 0, skipped: 0, failed: 0, current: null });

    try {
      const res = await fetch(`${API}/bgg/prefetch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ games }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `HTTP ${res.status}`);
      timer.current = window.setInterval(() => void poll(), POLL_MS);
    } catch (err) {
      setRunning(false);
      setError(
        err instanceof Error && err.message.includes('Failed to fetch')
          ? 'The render service is not running. Start it with: npm run server'
          : err instanceof Error
            ? err.message
            : String(err),
      );
    }
  };

  const cancel = async () => {
    await fetch(`${API}/bgg/cancel`, { method: 'POST' }).catch(() => {});
  };

  const entries = manifest ? Object.values(manifest.entries) : [];
  const known = entries.filter((e) => !e.error).length;
  const missing = fetchable.size - known;
  const ready = known > 0 && missing <= 0;
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const eta =
    running && progress
      ? formatEta(
          estimateRemainingSeconds({
            done: progress.done,
            total: progress.total,
            fetched: progress.fetched,
            elapsedMs: Date.now() - startedAt.current,
          }),
        )
      : null;

  return (
    <section className="panel">
      <h2>Game credits</h2>

      {offline ? (
        <p className="empty">
          Start the render service to fetch game credits: <code>npm run server</code>
        </p>
      ) : (
        <>
          <p className="boxart-state">
            {ready ? (
              <>
                Credits for <strong>{known}</strong> games. The themes, mechanics, designers, artists and
                publishers slides can be switched on.
              </>
            ) : known === 0 ? (
              <>
                No credits fetched yet. {fetchable.size} games to look up, about a minute. Without this the
                five credit slides do not appear.
              </>
            ) : (
              <>
                <strong>{known}</strong> games done, <strong>{missing}</strong> still to look up.
              </>
            )}
          </p>

          {running && progress && (
            <div className="boxart-progress">
              <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${pct}%` }} />
              </div>
              {/*
                The percentage and the estimate sit on their own line above the
                counts, because they are what somebody watching the bar actually
                wants — the breakdown underneath is for afterwards.

                The estimate is absent for the first few fetches rather than
                wrong: see `estimateRemainingSeconds`.
              */}
              <p className="boxart-eta">
                <strong>{pct}%</strong>
                {eta && <span className="boxart-eta-time">{eta}</span>}
              </p>
              <p className="boxart-counts">
                {progress.done} / {progress.total} · {progress.fetched} new · {progress.skipped} cached
                {progress.failed > 0 && ` · ${progress.failed} failed`}
                {progress.current && <span className="boxart-current"> — {progress.current}</span>}
              </p>
            </div>
          )}

          {summary && !running && (
            <p className="boxart-state">
              Done: {summary.fetched} fetched, {summary.skipped} already had.
              {summary.failed > 0 && ` ${summary.failed} failed.`}
            </p>
          )}

          {summary && summary.errors.length > 0 && (
            <ul className="boxart-errors">
              {summary.errors.slice(0, 8).map((e) => (
                <li key={e.bggId}>
                  {e.name}: {e.message}
                </li>
              ))}
              {summary.errors.length > 8 && <li>…and {summary.errors.length - 8} more</li>}
            </ul>
          )}

          {error && <p className="error">{error}</p>}

          <div className="boxart-actions">
            <button onClick={() => void start()} disabled={running}>
              {running ? 'Fetching…' : ready ? 'Check for new games' : 'Fetch game credits'}
            </button>
            {running && (
              <button className="link" onClick={() => void cancel()}>
                Stop
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
};
