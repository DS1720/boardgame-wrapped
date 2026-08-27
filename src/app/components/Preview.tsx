import { Player } from '@remotion/player';
import { useMemo } from 'react';
import type { Track } from '@/shared/audio';
import type { WrappedStats } from '@/stats/types';
import type { Theme } from '@/theme/types';
import { VIDEO } from '@/video/config';
import { planTimeline, type TimelineSlideId } from '@/video/timeline';
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
  playerName: string | null;
}

export const Preview: React.FC<Props> = ({ stats, theme, track, boxArtMode, cut, playerName }) => {
  // A fresh object identity on every render restarts the Player, which would
  // throw away the scrub position on every keystroke elsewhere in the UI.
  const inputProps = useMemo(
    () => ({ stats, theme, track, boxArtMode, cut }),
    [stats, theme, track, boxArtMode, cut],
  );

  const timeline = useMemo(
    () => planTimeline(stats, { bpm: track?.bpm, cut }),
    [stats, track?.bpm, cut],
  );

  const seconds = timeline.durationInFrames / VIDEO.fps;

  return (
    <aside className="preview">
      <div className="preview-frame">
        <Player
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
