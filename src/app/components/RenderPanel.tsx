import { useCallback, useEffect, useRef, useState } from 'react';
import type { Track } from '@/shared/audio';
import type { WrappedStats } from '@/stats/types';
import type { Theme } from '@/theme/types';
import { VIDEO } from '@/video/config';
import type { SlideBarOverrides, TimelineSlideId } from '@/video/timeline';
// Imported for the `window.bgw` declaration as much as for `shell()`: the
// folder picker is absent in a browser and the panel checks before offering it.
import { shell } from '../shell';

/**
 * Render to MP4.
 *
 * Sends the same props the preview is already running, so what comes out is
 * what was on screen. Progress is polled rather than streamed: a render is
 * seconds-to-minutes and a poll is a great deal less machinery than a socket.
 */

const API = '/api';
const POLL_MS = 400;

interface OutputSettings {
  outDir: string;
  defaultOutDir: string;
  custom: boolean;
}

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
  bars: SlideBarOverrides;
  durationInFrames: number;
}

export const RenderPanel: React.FC<Props> = ({
  stats,
  theme,
  track,
  cut,
  bars,
  durationInFrames,
}) => {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** What the service last confirmed. */
  const [output, setOutput] = useState<OutputSettings | null>(null);
  /**
   * What is in the box.
   *
   * Kept apart from `output` on purpose. Editing the confirmed value directly
   * makes "has this changed?" unanswerable — the comparison is against a value
   * the keystrokes already moved — and the blur then either always commits or
   * never does.
   */
  const [draft, setDraft] = useState('');
  const [folderError, setFolderError] = useState<string | null>(null);
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
        body: JSON.stringify({ stats, theme, track, slides: cut, bars }),
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

  /**
   * Open the output folder with the finished file selected.
   *
   * The result is read rather than dropped: the service refuses a file outside
   * the current output folder, and a button that fails in silence is the same
   * button as one that is broken.
   */
  const reveal = async () => {
    setError(null);
    try {
      const res = await fetch(`${API}/render/reveal`, { method: 'POST' });
      if (!res.ok) {
        throw new Error(((await res.json()) as { error?: string }).error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    // Detect the service once, so the panel can say why it is unusable.
    void fetch(`${API}/health`)
      .then((res) => setOffline(!res.ok))
      .catch(() => setOffline(true));
  }, []);

  useEffect(() => {
    void fetch(`${API}/settings`)
      .then((res) => (res.ok ? (res.json() as Promise<OutputSettings>) : null))
      .then((s) => {
        if (!s) return;
        setOutput(s);
        setDraft(s.outDir);
      })
      .catch(() => undefined);
  }, []);

  /**
   * Send a folder to the service, which is what decides whether it is usable.
   *
   * `committed` is what the service last confirmed. Blurring the field
   * without having changed anything must not send that value back: it would
   * store the default *as a choice*, and "Use the default" would then appear
   * for somebody who had only tabbed through the box.
   */
  const applyFolder = useCallback(async (dir: string | null) => {
    setFolderError(null);
    try {
      const res = await fetch(`${API}/settings/output`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dir }),
      });
      const body = (await res.json()) as OutputSettings & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setOutput(body);
      // The service may have resolved the path differently from what was typed.
      setDraft(body.outDir);
    } catch (err) {
      setFolderError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const browseFolder = useCallback(async () => {
    const chosen = await shell()?.chooseFolder?.(output?.outDir ?? '');
    // Null is a cancelled dialog, not a request to reset.
    if (chosen) void applyFolder(chosen);
  }, [applyFolder, output?.outDir]);

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

      <div className="render-folder">
        <label htmlFor="out-dir">Save videos to</label>
        <div className="row">
          <input
            id="out-dir"
            type="text"
            value={draft}
            spellCheck={false}
            placeholder={output?.defaultOutDir ?? ''}
            onChange={(e) => setDraft(e.target.value)}
            // Committed on blur or Enter rather than per keystroke: every commit
            // creates the folder, and doing that while somebody is halfway
            // through typing a path would litter their disk.
            // Unchanged values are not committed at all — see applyFolder.
            onBlur={() => {
              const typed = draft.trim();
              // Unchanged: not a choice, so it is not stored as one.
              if (typed === (output?.outDir ?? '')) return;
              void applyFolder(typed);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
          />
          {shell()?.chooseFolder && (
            <button className="secondary" onClick={() => void browseFolder()}>
              Choose…
            </button>
          )}
        </div>
        {output?.custom && (
          <button className="link" onClick={() => void applyFolder(null)} type="button">
            Use the default ({output.defaultOutDir})
          </button>
        )}
        {folderError && <p className="error">{folderError}</p>}
      </div>

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
        {/* Always on screen, not only once something has been rendered. With
            nothing to reveal it opens the output folder, which is the more
            common question anyway — and a button that appears halfway through a
            workflow is one nobody knows exists. */}
        <button className="link" onClick={() => void reveal()}>
          {finished ? 'Show in folder' : 'Open output folder'}
        </button>
      </div>
    </section>
  );
};
