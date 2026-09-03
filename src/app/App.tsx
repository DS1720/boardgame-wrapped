import { useCallback, useMemo, useState } from 'react';
import { AudioPicker } from './components/AudioPicker';
import { BatchPanel } from './components/BatchPanel';
import { BggPrefetch } from './components/BggPrefetch';
import { BoxArtPrefetch } from './components/BoxArtPrefetch';
import { DropZone } from './components/DropZone';
import { PlayerPicker } from './components/PlayerPicker';
import { Preview } from './components/Preview';
import { RenderPanel } from './components/RenderPanel';
import { RangePicker } from './components/RangePicker';
import { SlidePicker, defaultSlideSelection } from './components/SlidePicker';
import { StatsInspector } from './components/StatsInspector';
import { ThemePicker } from './components/ThemePicker';
import { useDataset } from './state/useDataset';
import { useBggIndex } from './state/useBggIndex';
import { useSession } from './state/useSession';
import { displayNameFor, setPlayerName } from './state/playerNames';
import { useAppFonts, useThemeSelection } from './state/useThemeSelection';
import { allTimeRange, playersInPlays, playsInRange } from '@/ingest/select';
import { buildWrappedStats, MODULES } from '@/stats/index';
import type { SlideId } from '@/stats/types';
import type { Track } from '@/shared/audio';
import type { DateRange } from '@/shared/types';
import { VIDEO } from '@/video/config';
import {
  arrangementOf,
  buildCut,
  clampBars,
  clampLengthMultiplier,
  type TimelineSlideId,
  insertSlide,
  moveSlide,
  moveSlideTo,
  planTimeline,
  SLIDE_BARS,
} from '@/video/timeline';
import { makeRange } from '@/ingest/select';

/**
 * The control surface.
 *
 * Controls on the left, the video on the right, one screen. The preview runs
 * the real composition with the real props, so every control here is changing
 * the thing that will actually be rendered rather than a mock of it.
 */
/** A Date as the ISO day the session stores. */
const toIsoDay = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const App: React.FC = () => {
  const { dataset, error, loading, load, clear } = useDataset();
  const themeSelection = useThemeSelection();
  useAppFonts();

  const { session, patch, restored } = useSession();
  // Feeds the five credit modules. Empty until the credit prefetch has run,
  // which is what keeps those slides from appearing on a machine without it.
  const bgg = useBggIndex();
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [track, setTrack] = useState<Track | null>(null);

  const playerId = session.playerId;
  const slides = session.slides;
  const bars = session.bars;
  const lengthMultiplier = session.lengthMultiplier;
  const playerNames = session.playerNames;

  // The stored range is two ISO days; a DateRange needs real Dates.
  const range: DateRange | null = useMemo(() => {
    if (!session.rangeFrom || !session.rangeTo) return null;
    return makeRange(
      new Date(`${session.rangeFrom}T00:00:00`),
      new Date(`${session.rangeTo}T23:59:59`),
      session.rangeLabel ?? `${session.rangeFrom} → ${session.rangeTo}`,
    );
  }, [session.rangeFrom, session.rangeTo, session.rangeLabel]);

  const setRange = useCallback(
    (next: DateRange | null) => {
      patch({
        rangeFrom: next ? toIsoDay(next.from) : null,
        rangeTo: next ? toIsoDay(next.to) : null,
        rangeLabel: next?.label ?? null,
      });
    },
    [patch],
  );

  const setPlayerId = useCallback((id: number) => patch({ playerId: id }), [patch]);

  /* Blank clears the override rather than storing an empty name — see
     `setPlayerName`, which is where that rule lives. */
  const renamePlayer = useCallback(
    (id: number, name: string) => patch({ playerNames: setPlayerName(playerNames, id, name) }),
    [patch, playerNames],
  );

  const activeRange = useMemo(() => {
    if (!dataset) return null;
    return range ?? allTimeRange(dataset);
  }, [dataset, range]);

  /**
   * The same range, wearing whatever name was typed for it.
   *
   * Only the stats get this one. The picker keeps `activeRange`, because its
   * year chips match on the derived label — rename the range to "Our first
   * year" and the 2026 chip would otherwise stop looking selected.
   */
  const namedRange = useMemo(() => {
    if (!activeRange) return null;
    const typed = session.rangeName?.trim();
    return typed ? { ...activeRange, label: typed } : activeRange;
  }, [activeRange, session.rangeName]);

  const players = useMemo(() => {
    if (!dataset || !activeRange) return [];
    return playersInPlays(playsInRange(dataset.plays, activeRange));
  }, [dataset, activeRange]);

  // Every module is computed; the cut decides which reach the video. Computing
  // them all means toggling a slide on is instant rather than a recalculation.
  const stats = useMemo(() => {
    if (!dataset || !namedRange || playerId === null) return null;
    return buildWrappedStats(
      dataset,
      playerId,
      namedRange,
      MODULES.map((m) => m.id),
      {
        // `displayNameFor` rather than a raw lookup: it is the one place the
        // trimming happens, so a name still being typed cannot reach the video
        // or the filename with a trailing space on it. Passing the resolver
        // lets slides that name other players use their aliases too.
        displayNameOf: (id, actual) => displayNameFor(playerNames, id, actual),
        bgg,
      },
    );
  }, [dataset, namedRange, playerId, playerNames, bgg]);

  const cut = useMemo(() => buildCut(slides), [slides]);

  // The audio picker needs the video's length to work out looping.
  const timeline = useMemo(
    () => planTimeline(stats, { bpm: track?.bpm, cut, bars, lengthMultiplier }),
    [stats, track?.bpm, cut, bars, lengthMultiplier],
  );

  // Every edit is made against the arrangement as it will play, not against
  // the raw stored list — the two differ wherever a linked pair was pulled
  // together, and editing the list you cannot see is how a drag ends up
  // landing somewhere else.
  const arrangement = useMemo(() => arrangementOf(slides), [slides]);

  const toggleSlide = useCallback(
    (id: SlideId, on: boolean) => {
      patch({
        slides: on ? insertSlide(arrangement, id) : arrangement.filter((s) => s !== id),
      });
    },
    [arrangement, patch],
  );

  const reorderSlide = useCallback(
    (id: SlideId, delta: number) => patch({ slides: moveSlide(arrangement, id, delta) }),
    [arrangement, patch],
  );

  const dropSlide = useCallback(
    (id: SlideId, index: number) => patch({ slides: moveSlideTo(arrangement, id, index) }),
    [arrangement, patch],
  );

  /**
   * Set one slide's length, or clear it back to the default.
   *
   * Stored sparsely: a value equal to the default is removed rather than
   * written, so the stored session says what someone changed rather than
   * freezing today's defaults into it.
   */
  const setSlideBars = useCallback(
    (id: TimelineSlideId, value: number | null) => {
      const next = { ...bars };
      if (value === null || value === SLIDE_BARS[id]) delete next[id];
      else next[id] = clampBars(value);
      patch({ bars: next });
    },
    [bars, patch],
  );

  // Which slide the preview is on, so the list can mark it. Session state, not
  // saved state — it belongs to the playhead, not to the arrangement.
  const [playing, setPlaying] = useState<TimelineSlideId | null>(null);

  // Adding everything keeps the current arrangement and folds the rest in
  // around it, rather than replacing what someone has already ordered.
  const allAvailable = useCallback(() => {
    const availableIds = (stats?.stats.map((s) => s.id) ?? []) as SlideId[];
    patch({ slides: availableIds.reduce(insertSlide, arrangement) });
  }, [arrangement, patch, stats]);

  // Never an empty screen: a blank shell tells someone whose storage is slow or
  // blocked nothing at all about what the tool is doing.
  if (loading || !restored) {
    return (
      <main className="shell shell-empty">
        <header>
          <h1>Board Game Wrapped</h1>
          <p>Mobile format · 1080 × 1920 · 30 fps</p>
        </header>
        <p className="empty">Looking for your last export…</p>
      </main>
    );
  }

  /* Before an export is loaded there is exactly one thing to do, so there is
     exactly one thing on screen. */
  if (!dataset) {
    return (
      <main className="shell shell-empty">
        <header>
          <h1>Board Game Wrapped</h1>
          <p>Mobile format · 1080 × 1920 · 30 fps</p>
        </header>
        <DropZone onFile={load} />
        {error && (
          <p className="error">
            {error} Export again from BG Stats: Settings → Export, import and backup.
          </p>
        )}
      </main>
    );
  }

  const actualName = players.find((p) => p.id === playerId)?.name ?? null;
  // What the video will actually say, so the preview and the render agree.
  const playerName =
    actualName === null || playerId === null
      ? null
      : displayNameFor(playerNames, playerId, actualName);

  return (
    <main className="shell shell-loaded">
      <header>
        <h1>Board Game Wrapped</h1>
        <p>Mobile format · 1080 × 1920 · 30 fps</p>
      </header>

      <div className="layout">
        <div className="controls">
          <section className="panel summary">
            <p>
              {dataset.counts.plays} plays · {dataset.counts.players} players ·{' '}
              {dataset.counts.games} games
              {dataset.counts.ignored > 0 && ` · ${dataset.counts.ignored} ignored`}
            </p>
            <button className="link" onClick={clear}>
              Load a different export
            </button>
          </section>

          {activeRange && (
            <RangePicker
              dataset={dataset}
              range={activeRange}
              name={session.rangeName ?? ''}
              onName={(value) => patch({ rangeName: value })}
              onChange={setRange}
              error={rangeError}
              onError={setRangeError}
            />
          )}

          <PlayerPicker
            players={players}
            selected={playerId}
            onSelect={setPlayerId}
            names={playerNames}
            onRename={renamePlayer}
          />

          <SlidePicker
            stats={stats}
            order={arrangement}
            onToggle={toggleSlide}
            onMove={reorderSlide}
            onReorder={dropSlide}
            playing={playing}
            bars={bars}
            onBars={setSlideBars}
            onReset={() => patch({ slides: defaultSlideSelection(), bars: {} })}
            onAll={allAvailable}
          />

          <AudioPicker
            videoDurationInFrames={timeline.durationInFrames}
            fps={VIDEO.fps}
            selectedId={track?.id ?? session.trackId}
            lengthMultiplier={lengthMultiplier}
            onLengthMultiplier={(value) => patch({ lengthMultiplier: clampLengthMultiplier(value) })}
            onSelect={(next) => {
              setTrack(next);
              patch({ trackId: next?.id ?? null });
            }}
          />

          <ThemePicker
            theme={themeSelection.theme}
            mode={themeSelection.mode}
            boxArtMode={themeSelection.boxArtMode}
            onSelectStarter={themeSelection.selectStarter}
            onRoll={themeSelection.roll}
            onSetColor={themeSelection.setColor}
            onSetFont={themeSelection.setFont}
            onToggleBoxArt={themeSelection.setBoxArtMode}
          />

          <RenderPanel
            stats={stats}
            theme={themeSelection.theme}
            track={track}
            cut={cut}
            bars={bars}
            lengthMultiplier={lengthMultiplier}
            durationInFrames={timeline.durationInFrames}
          />

          <BatchPanel
            dataset={dataset}
            players={players}
            names={playerNames}
            range={activeRange}
            theme={themeSelection.theme}
            track={track}
            cut={cut}
            bars={bars}
            lengthMultiplier={lengthMultiplier}
            bgg={bgg}
          />

          <BoxArtPrefetch dataset={dataset} />
          <BggPrefetch dataset={dataset} />

          {stats && <StatsInspector stats={stats} />}
        </div>

        <Preview
          stats={stats}
          theme={themeSelection.theme}
          track={track}
          boxArtMode={themeSelection.boxArtMode}
          cut={cut}
          bars={bars}
          lengthMultiplier={lengthMultiplier}
          playerName={playerName}
          onSlideChange={setPlaying}
        />
      </div>
    </main>
  );
};
