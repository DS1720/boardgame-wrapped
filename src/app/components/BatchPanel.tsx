import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayerSummary } from '@/ingest/select';
import type { Track } from '@/shared/audio';
import type { Dataset, DateRange } from '@/shared/types';
import { buildWrappedStats, MODULES, THIN_PLAY_THRESHOLD } from '@/stats/index';
import type { BggIndex } from '@/shared/bgg';
import { themeForPlayer } from '@/theme/generate';
import type { Theme } from '@/theme/types';
import type { SlideBarOverrides, TimelineSlideId } from '@/video/timeline';
import { isRenamed, overrideFor, type PlayerNameOverrides } from '../state/playerNames';

/**
 * Batch render: every selected player, one shared range, one button.
 *
 * Stats and themes are computed here rather than on the server. Both are pure
 * functions the browser already has, and sending the finished payload keeps the
 * service from needing a second copy of the ingest and stats layers.
 */

const API = '/api';
const POLL_MS = 600;

interface BatchItem {
  playerId: number;
  playerName: string;
  plays: number;
  status: 'queued' | 'rendering' | 'done' | 'failed' | 'skipped';
  file: string | null;
  bytes: number | null;
  reason: string | null;
  durationMs: number | null;
}

interface BatchState {
  running: boolean;
  items: BatchItem[];
  currentIndex: number;
  currentProgress: number;
  summary: {
    total: number;
    rendered: number;
    failed: number;
    skipped: number;
    bytes: number;
    durationMs: number;
  } | null;
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const mins = (ms: number) => `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;

const STATUS_MARK: Record<BatchItem['status'], string> = {
  queued: '·',
  rendering: '▶',
  done: '✓',
  failed: '✕',
  skipped: '–',
};

interface Props {
  dataset: Dataset;
  players: PlayerSummary[];
  range: DateRange | null;
  theme: Theme;
  track: Track | null;
  cut: TimelineSlideId[];
  bars: SlideBarOverrides;
  /** Names typed by hand in the player picker. Sparse. */
  names: PlayerNameOverrides;
  /**
   * BGG credits. Passed through rather than fetched here so a batch and the
   * preview cannot disagree about which slides a player has.
   */
  bgg: BggIndex;
}

export const BatchPanel: React.FC<Props> = ({
  dataset,
  players,
  range,
  theme,
  track,
  cut,
  bars,
  names,
  bgg,
}) => {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [randomThemes, setRandomThemes] = useState(false);
  const [minPlays, setMinPlays] = useState(THIN_PLAY_THRESHOLD);
  const [state, setState] = useState<BatchState | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    setRunning(false);
  }, []);

  useEffect(() => stop, [stop]);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`${API}/batch/progress`);
      const body = (await res.json()) as { running: boolean; state: BatchState | null };
      if (body.state) setState(body.state);
      if (!body.running) stop();
    } catch (err) {
      stop();
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [stop]);

  const eligible = players.filter((p) => selected.has(p.id));

  const start = async () => {
    if (!range || eligible.length === 0) return;
    setError(null);
    setState(null);
    setRunning(true);

    try {
      const items = eligible.map((player) => ({
        playerId: player.id,
        plays: player.playCount,
        stats: buildWrappedStats(
          dataset,
          player.id,
          range,
          MODULES.map((m) => m.id),
          // The same override the preview uses. It travels on the stats rather
          // than beside them because `playerName` is what the intro, the
          // square and the output filename all read — a batch that renamed
          // only the video would write the file under the old name.
          overrideFor(names, player.id),
          bgg,
        ),
        // Seeded by player id, so a re-run produces the same set of videos.
        theme: randomThemes ? themeForPlayer(player.id) : theme,
        track,
        slides: cut,
        // Lengths are a choice about the video, not about the player, so every
        // item in a batch gets the same ones the preview is running.
        bars,
      }));

      const res = await fetch(`${API}/batch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items, minPlays }),
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

  const toggle = (id: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const willRender = eligible.filter((p) => p.playCount >= minPlays).length;

  return (
    <section className="panel">
      <h2>Batch render</h2>

      <p className="panel-note">
        {selected.size === 0
          ? 'Select players to render them all in one go, over the range above.'
          : `${selected.size} selected · ${willRender} will render, ${selected.size - willRender} below the minimum.`}
      </p>

      <div className="batch-select">
        <button className="link" onClick={() => setSelected(new Set(players.map((p) => p.id)))}>
          Select all {players.length}
        </button>
        <button className="link" onClick={() => setSelected(new Set())}>
          Clear
        </button>
        <label className="batch-min">
          <span>Minimum plays</span>
          <input
            type="number"
            min={0}
            max={999}
            value={minPlays}
            onChange={(e) => setMinPlays(Math.max(0, Number(e.target.value)))}
          />
        </label>
        <label className="theme-toggle">
          <input
            type="checkbox"
            checked={randomThemes}
            onChange={(e) => setRandomThemes(e.target.checked)}
          />
          A random theme per player
        </label>
      </div>

      <ul className="batch-players">
        {players.map((player) => {
          const item = state?.items.find((i) => i.playerId === player.id);
          const below = player.playCount < minPlays;
          return (
            <li key={player.id} className={below && selected.has(player.id) ? 'is-below' : ''}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.has(player.id)}
                  disabled={running}
                  onChange={() => toggle(player.id)}
                />
                <span className="batch-name">
                  {player.name}
                  {isRenamed(names, player.id, player.name) && (
                    <em className="player-alias"> ({overrideFor(names, player.id)})</em>
                  )}
                </span>
                <span className="count">{player.playCount}</span>
                {item && (
                  <span className={`batch-status is-${item.status}`} title={item.reason ?? ''}>
                    {STATUS_MARK[item.status]}
                  </span>
                )}
              </label>
            </li>
          );
        })}
      </ul>

      {running && state && (
        <p className="batch-running">
          {state.currentIndex >= 0
            ? `Rendering ${state.items[state.currentIndex]?.playerName} — ${Math.round(
                state.currentProgress * 100,
              )}% · ${state.items.filter((i) => i.status === 'done').length} of ${
                state.items.filter((i) => i.status !== 'skipped').length
              } done`
            : 'Starting…'}
        </p>
      )}

      {state?.summary && !running && (
        <div className="batch-summary">
          <p>
            <strong>{state.summary.rendered}</strong> rendered · {state.summary.failed} failed ·{' '}
            {state.summary.skipped} skipped · {mb(state.summary.bytes)} · {mins(state.summary.durationMs)}
          </p>
          {/* A failure names the player and the reason, so a re-run can be
              targeted rather than repeating the whole set. */}
          {state.items.filter((i) => i.status === 'failed').length > 0 && (
            <ul className="batch-failures">
              {state.items
                .filter((i) => i.status === 'failed')
                .map((i) => (
                  <li key={i.playerId}>
                    <strong>{i.playerName}</strong>: {i.reason}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <div className="batch-actions">
        <button onClick={() => void start()} disabled={running || willRender === 0 || !range}>
          {running ? 'Rendering…' : `Render ${willRender || ''} video${willRender === 1 ? '' : 's'}`}
        </button>
        {running && (
          <button className="link" onClick={() => void fetch(`${API}/batch/cancel`, { method: 'POST' })}>
            Stop after this one
          </button>
        )}
      </div>
    </section>
  );
};
