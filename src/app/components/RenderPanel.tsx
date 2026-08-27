import { useCallback, useEffect, useRef, useState } from 'react';
import type { Track } from '@/shared/audio';
import type { WrappedStats } from '@/stats/types';
import type { Theme } from '@/theme/types';
import { VIDEO } from '@/video/config';
import type { TimelineSlideId } from '@/video/timeline';

/**
 * Render to MP4.
 *
 * Sends the same props the preview is already running, so what comes out is
 * what was on screen. Progress is polled rather than streamed: a render is
 * seconds-to-minutes and a poll is a great deal less machinery than a socket.
 */

const API = '/api';
const POLL_MS = 400;

interface Progress {
  phase:
    | 'bundling'
    | 'preparing'
    | 'rendering'
    | 'encoding'
    | 'still'
    | 'done'
    | 'failed'
    | 'cancelled';
  progress: number;
  renderedFrames: number;
  encodedFrames: number;
  totalFrames: number;
  outputFile: string | null;
  /** The square written beside the video. Null if it could not be made. */
  stillFile: string | null;
  bytes: number | null;
  error: string | null;
}

const PHASE_LABEL: Record<Progress['phase'], string> = {
  bundling: 'Building the bundle…',
  preparing: 'Working out the length…',
  rendering: 'Rendering frames',
  encoding: 'Encoding',
  still: 'Making the square…',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

interface Props {
  stats: WrappedStats | null;
  theme: Theme;
  track: Track | null;
  cut: TimelineSlideId[];
  durationInFrames: number;
}

export const RenderPanel: React.FC<Props> = ({ stats, theme, track, cut, durationInFrames }) => {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const timer = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    setRunning(false);
  }, []);

  useEffect(() => stop, [stop]);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`${API}/render/progress`);
      const state = (await res.json()) as { running: boolean; progress: Progress | null };
      if (state.progress) setProgress(state.progress);
      if (!state.running) {
        stop();
        if (state.progress?.phase === 'failed') setError(state.progress.error);
      }
    } catch (err) {
      stop();
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [stop]);

  const start = async () => {
    if (!stats) return;
    setError(null);
    setProgress(null);
    setRunning(true);
    try {
      const res = await fetch(`${API}/render`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Exactly what the preview is running.
        body: JSON.stringify({ stats, theme, track, slides: cut }),
      });
      if (!res.ok) {
        throw new Error(((await res.json()) as { error?: string }).error ?? `HTTP ${res.status}`);
      }
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

  useEffect(() => {
    // Detect the service once, so the panel can say why it is unusable.
    void fetch(`${API}/health`)
      .then((res) => setOffline(!res.ok))
      .catch(() => setOffline(true));
  }, []);

  if (offline) {
    return (
      <section className="panel">
        <h2>Render</h2>
        <p className="empty">
          Start the render service to export an MP4: <code>npm run server</code>
        </p>
      </section>
    );
  }

  const seconds = durationInFrames / VIDEO.fps;
  const pct = progress ? Math.round(progress.progress * 100) : 0;
  const finished = progress?.phase === 'done';

  return (
    <section className="panel">
      <h2>Render</h2>

      <p className="panel-note">
        {stats
          ? `${stats.playerName} · ${stats.rangeLabel} · ${theme.name} — ${seconds.toFixed(1)}s, 1080 × 1920`
          : 'Pick a player to render a video.'}
      </p>

      {running && progress && (
        <div className="render-progress">
          <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${pct}%` }} />
          </div>
          <p className="render-counts">
            {PHASE_LABEL[progress.phase]}
            {progress.totalFrames > 0 &&
              ` · ${progress.renderedFrames} / ${progress.totalFrames} frames`}
            {` · ${pct}%`}
          </p>
        </div>
      )}

      {finished && progress?.outputFile && (
        <p className="render-done">
          Wrote <strong>{progress.outputFile.split(/[\\/]/).pop()}</strong>
          {progress.bytes ? ` · ${mb(progress.bytes)}` : ''}
          {progress.stillFile ? ' · plus a 1080 × 1080 square to share' : ''}
        </p>
      )}

      {progress?.phase === 'cancelled' && <p className="panel-note">Render cancelled.</p>}

      {/* The service sends the real message — a webpack error names the file and
          line, and a generic "render failed" would throw the fix away. */}
      {error && <p className="error render-error">{error}</p>}

      <div className="render-actions">
        <button onClick={() => void start()} disabled={running || !stats}>
          {running ? 'Rendering…' : 'Render MP4'}
        </button>
        {running && (
          <button
            className="link"
            onClick={() => void fetch(`${API}/render/cancel`, { method: 'POST' })}
          >
            Cancel
          </button>
        )}
        {finished && (
          <button
            className="link"
            onClick={() => void fetch(`${API}/render/reveal`, { method: 'POST' })}
          >
            Show in folder
          </button>
        )}
      </div>
    </section>
  );
};
