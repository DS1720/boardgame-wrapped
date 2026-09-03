import { Player, type PlayerRef } from '@remotion/player';
import { useEffect, useMemo, useRef } from 'react';
import type { Track } from '@/shared/audio';
import type { WrappedStats } from '@/stats/types';
import type { Theme } from '@/theme/types';
import { VIDEO } from '@/video/config';
import {
  planTimeline,
  slideAt,
  type SlideBarOverrides,
  type TimelineSlideId,
} from '@/video/timeline';
import { Wrapped } from '@/video/Wrapped';

/**
 * The preview column.
 *
 * One `<Player>` running the real composition with the real props — the same
 * object that will be handed to the renderer in step 10. Anything that looks
 * right here has to render right, because there is no second code path.
 */

/** Where the preview parks when it loads: past the intro's entry animation. */
const POSTER_FRAME = 30;

interface Props {
  stats: WrappedStats | null;
  theme: Theme;
  track: Track | null;
  boxArtMode: boolean;
  cut: TimelineSlideId[];
  /** Per-slide lengths chosen in the picker. */
  bars: SlideBarOverrides;
  /** Global multiplier applied in the timeline only. */
  lengthMultiplier: number;
  playerName: string | null;
  /**
   * Called when the slide under the playhead changes.
   *
   * The *slide*, not the frame: `frameupdate` fires thirty times a second, and
   * lifting that into React state would re-render the whole control column on
   * every frame. This fires about once every two seconds.
   */
  onSlideChange?: (id: TimelineSlideId | null) => void;
}

export const Preview: React.FC<Props> = ({
  stats,
  theme,
  track,
  boxArtMode,
  cut,
  bars,
  lengthMultiplier,
  playerName,
  onSlideChange,
}) => {
  const player = useRef<PlayerRef>(null);
  // A fresh object identity on every render restarts the Player, which would
  // throw away the scrub position on every keystroke elsewhere in the UI.
  const inputProps = useMemo(
    () => ({ stats, theme, track, boxArtMode, cut, bars, lengthMultiplier }),
    [stats, theme, track, boxArtMode, cut, bars, lengthMultiplier],
  );

  const timeline = useMemo(
    () => planTimeline(stats, { bpm: track?.bpm, cut, bars, lengthMultiplier }),
    [stats, track?.bpm, cut, bars, lengthMultiplier],
  );

  const seconds = timeline.durationInFrames / VIDEO.fps;

  // Held in a ref, so a frame that stays inside the same slide costs nothing.
  const showing = useRef<TimelineSlideId | null>(null);

  useEffect(() => {
    const node = player.current;
    if (!node || !onSlideChange) return;

    const report = (frame: number) => {
      const id = slideAt(timeline, frame);
      if (id === showing.current) return;
      showing.current = id;
      onSlideChange(id);
    };

    const onFrame = (e: { detail: { frame: number } }) => report(e.detail.frame);
    node.addEventListener('frameupdate', onFrame);
    // The listener only fires on a change, so the slide the player is already
    // parked on has to be reported once up front.
    report(node.getCurrentFrame());

    return () => {
      node.removeEventListener('frameupdate', onFrame);
      showing.current = null;
      onSlideChange(null);
    };
  }, [onSlideChange, timeline]);

  return (
    <aside className="preview">
      <div className="preview-frame">
        <Player
          ref={player}
          component={Wrapped}
          inputProps={inputProps}
          durationInFrames={timeline.durationInFrames}
          fps={VIDEO.fps}
          compositionWidth={VIDEO.width}
          compositionHeight={VIDEO.height}
          style={{ width: '100%', height: '100%' }}
          controls
          loop
          // Frame 0 is the intro mid-entry, with everything still at zero
          // opacity — the preview would open on an apparently empty video.
          // A second in, the first slide has settled.
          initialFrame={Math.min(POSTER_FRAME, timeline.durationInFrames - 1)}
          spaceKeyToPlayOrPause
          clickToPlay
        />
      </div>

      <div className="preview-meta">
        {stats ? (
          <>
            <p className="preview-title">
              {playerName ?? stats.playerName} · {stats.rangeLabel}
            </p>
            <p className="preview-facts">
              {timeline.slides.length} slides · {seconds.toFixed(1)}s · {timeline.bars} bars ·{' '}
              {Math.round(timeline.bpm)} BPM
              {track ? ` · ${track.name}` : ' · no music'}
            </p>
          </>
        ) : (
          <p className="preview-facts">Pick a player to build a video.</p>
        )}
      </div>
    </aside>
  );
};
