import { useCallback, useMemo, useState } from 'react';
import { AudioPicker } from './components/AudioPicker';
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
import { useSession } from './state/useSession';
import { useAppFonts, useThemeSelection } from './state/useThemeSelection';
import { allTimeRange, playersInPlays, playsInRange } from '@/ingest/select';
import { buildWrappedStats, MODULES } from '@/stats/index';
import type { SlideId } from '@/stats/types';
import type { Track } from '@/shared/audio';
import type { DateRange } from '@/shared/types';
import { VIDEO } from '@/video/config';
import { buildCut, insertSlide, moveSlide, planTimeline } from '@/video/timeline';
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
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [track, setTrack] = useState<Track | null>(null);

  const playerId = session.playerId;
  const slides = session.slides;

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

  const activeRange = useMemo(() => {
    if (!dataset) return null;
    return range ?? allTimeRange(dataset);
  }, [dataset, range]);

  const players = useMemo(() => {
    if (!dataset || !activeRange) return [];
    return playersInPlays(playsInRange(dataset.plays, activeRange));
  }, [dataset, activeRange]);

  // Every module is computed; the cut decides which reach the video. Computing
  // them all means toggling a slide on is instant rather than a recalculation.
  const stats = useMemo(() => {
    if (!dataset || !activeRange || playerId === null) return null;
    return buildWrappedStats(
      dataset,
      playerId,
      activeRange,
      MODULES.map((m) => m.id),
    );
  }, [dataset, activeRange, playerId]);

  const cut = useMemo(() => buildCut(slides), [slides]);

  // The audio picker needs the video's length to work out looping.
  const timeline = useMemo(
    () => planTimeline(stats, { bpm: track?.bpm, cut }),
    [stats, track?.bpm, cut],
  );

  const toggleSlide = useCallback(
    (id: SlideId, on: boolean) => {
      patch({
        slides: on ? insertSlide(slides, id) : slides.filter((s) => s !== id),
      });
    },
    [patch, slides],
  );

  const reorderSlide = useCallback(
    (id: SlideId, delta: number) => patch({ slides: moveSlide(slides, id, delta) }),
    [patch, slides],
  );

  // Adding everything keeps the current arrangement and folds the rest in
  // around it, rather than replacing what someone has already ordered.
  const allAvailable = useCallback(() => {
    const availableIds = (stats?.stats.map((s) => s.id) ?? []) as SlideId[];
    patch({ slides: availableIds.reduce(insertSlide, slides) });
  }, [patch, slides, stats]);

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

  const playerName = players.find((p) => p.id === playerId)?.name ?? null;

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
              onChange={setRange}
              error={rangeError}
              onError={setRangeError}
            />
          )}

          <PlayerPicker players={players} selected={playerId} onSelect={setPlayerId} />

          <SlidePicker
            stats={stats}
            order={slides}
            onToggle={toggleSlide}
            onMove={reorderSlide}
            onReset={() => patch({ slides: defaultSlideSelection() })}
            onAll={allAvailable}
          />

          <AudioPicker
            videoDurationInFrames={timeline.durationInFrames}
            fps={VIDEO.fps}
            selectedId={track?.id ?? session.trackId}
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
            durationInFrames={timeline.durationInFrames}
          />

          <BoxArtPrefetch dataset={dataset} />

          {stats && <StatsInspector stats={stats} />}
        </div>

        <Preview
          stats={stats}
          theme={themeSelection.theme}
          track={track}
          boxArtMode={themeSelection.boxArtMode}
          cut={cut}
          playerName={playerName}
        />
      </div>
    </main>
  );
};
