import { Composition } from 'remotion';
import { Wrapped, type WrappedProps } from './Wrapped';
import { VIDEO } from './config';
import { DEFAULT_BPM, EMPTY_DURATION_FRAMES, planTimeline } from './timeline';

/**
 * The video's length is a property of the data, not a constant: a player
 * missing an optional stat gets a shorter video, with no gap where the slide
 * would have been. `calculateMetadata` is what lets the composition's duration
 * follow the timeline the same way the slides do.
 */
export const RemotionRoot: React.FC = () => (
  <Composition
    id="Wrapped"
    component={Wrapped}
    fps={VIDEO.fps}
    width={VIDEO.width}
    height={VIDEO.height}
    durationInFrames={EMPTY_DURATION_FRAMES}
    defaultProps={
      { stats: null, theme: null, boxArtMode: false, track: null, bpm: DEFAULT_BPM, cut: null } as WrappedProps
    }
    calculateMetadata={({ props }) => ({
      durationInFrames: planTimeline((props as WrappedProps).stats ?? null, {
        // Same precedence as the component: the track re-times the video.
        bpm: (props as WrappedProps).track?.bpm ?? (props as WrappedProps).bpm ?? DEFAULT_BPM,
        ...((props as WrappedProps).cut ? { cut: (props as WrappedProps).cut! } : {}),
      }).durationInFrames,
    })}
  />
);
