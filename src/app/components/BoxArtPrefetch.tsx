import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dataset } from '@/shared/types';
import type { BoxArtManifest } from '@/shared/boxart';

/**
 * Box art prefetch, driven from the UI but executed by the render service —
 * the browser cannot write to public/boxart, and the images have to be on disk
 * for an offline render to work.
 *
 * Run once per export. The service does the skipping, so pressing this again is
 * cheap and safe.
 */

/** Proxied to the render service on :4000 by the dev server. */
const API = '/api';
const POLL_MS = 400;

interface Progress {
  done: number;
  total: number;
  downloaded: number;
  skipped: number;
  fallback: number;
  failed: number;
  current: string | null;
}

interface Summary extends Omit<Progress, 'current'> {
  bytes: number;
  errors: Array<{ gameId: number; name: string; message: string }>;
}

interface PollResponse {
  running: boolean;
  progress: Progress | null;
  summary: Summary | null;
  error: string | null;
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export const BoxArtPrefetch: React.FC<{ dataset: Dataset }> = ({ dataset }) => {
  const [manifest, setManifest] = useState<BoxArtManifest | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [running, setRunning] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const games = [...dataset.gamesById.values()];

  const loadManifest = useCallback(async () => {
    try {
      const res = await fetch(`${API}/boxart/manifest`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setManifest((await res.json()) as BoxArtManifest);
      setOffline(false);
    } catch {
      // The service simply is not running. That is a normal state before a
      // render, not an error worth shouting about.
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
      const res = await fetch(`${API}/boxart/progress`);
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
    setProgress({ done: 0, total: games.length, downloaded: 0, skipped: 0, fallback: 0, failed: 0, current: null });

    try {
      const res = await fetch(`${API}/boxart/prefetch`, {
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
    await fetch(`${API}/boxart/cancel`, { method: 'POST' }).catch(() => {});
  };

  const stored = manifest ? Object.values(manifest.entries).filter((e) => e.file).length : 0;
  const known = manifest ? Object.keys(manifest.entries).length : 0;
  const missing = games.length - known;
  const ready = known > 0 && missing <= 0;
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <section className="panel">
      <h2>Box art</h2>

      {offline ? (
        <p className="empty">
          Start the render service to download box art: <code>npm run server</code>
        </p>
      ) : (
        <>
          <p className="boxart-state">
            {ready ? (
              <>
                <strong>{stored}</strong> covers on disk, {known - stored} using a fallback tile. Renders
                work offline.
              </>
            ) : known === 0 ? (
              <>No box art downloaded yet. {games.length} games to fetch, roughly 110 MB.</>
            ) : (
              <>
                <strong>{stored}</strong> covers on disk, <strong>{missing}</strong> games not looked at
                yet.
              </>
            )}
          </p>

          {running && progress && (
            <div className="boxart-progress">
              <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${pct}%` }} />
              </div>
              <p className="boxart-counts">
                {progress.done} / {progress.total} · {progress.downloaded} new · {progress.skipped} cached
                {progress.failed > 0 && ` · ${progress.failed} failed`}
                {progress.current && <span className="boxart-current"> — {progress.current}</span>}
              </p>
            </div>
          )}

          {summary && !running && (
            <p className="boxart-state">
              Done: {summary.downloaded} downloaded ({mb(summary.bytes)}), {summary.skipped} already had,{' '}
              {summary.fallback} without art.
              {summary.failed > 0 && ` ${summary.failed} failed.`}
            </p>
          )}

          {summary && summary.errors.length > 0 && (
            <ul className="boxart-errors">
              {summary.errors.slice(0, 8).map((e) => (
                <li key={e.gameId}>
                  {e.name}: {e.message}
                </li>
              ))}
              {summary.errors.length > 8 && <li>…and {summary.errors.length - 8} more</li>}
            </ul>
          )}

          {error && <p className="error">{error}</p>}

          <div className="boxart-actions">
            <button onClick={() => void start()} disabled={running}>
              {running ? 'Downloading…' : ready ? 'Check for new art' : 'Download box art'}
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
