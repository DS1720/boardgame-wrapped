import { Audio, Sequence, staticFile, useVideoConfig } from 'remotion';
import { resolvePlayback, trackVolume, type Track } from '@/shared/audio';

/**
 * The soundtrack.
 *
 * Three jobs, all decided by `resolvePlayback`: start the track on a downbeat so
 * the slide cuts land on beats, repeat a short crop enough times to cover the
 * video, and fade rather than cut at the ends.
 *
 * Repeats are explicit `<Sequence>`s rather than a `<Loop>`. Remotion resets
 * frame numbering inside a loop, so a fade written against the loop's frame
 * would restart on every pass; knowing each repeat's offset is what lets one
 * fade run across the whole video.
 */
export const Soundtrack: React.FC<{ track: Track | null | undefined }> = ({ track }) => {
  const { durationInFrames, fps } = useVideoConfig();
  if (!track) return null;

  const playback = resolvePlayback(track, durationInFrames, fps);
  const src = staticFile(`audio/${track.file}`);

  return (
    <>
      {Array.from({ length: playback.loops }, (_, pass) => {
        const offset = pass * playback.segmentFrames;
        return (
          <Sequence
            key={pass}
            from={offset}
            durationInFrames={Math.min(playback.segmentFrames, durationInFrames - offset)}
          >
            <Audio
              src={src}
              trimBefore={playback.startFrame}
              trimAfter={playback.startFrame + playback.segmentFrames}
              // The frame here is relative to this repeat, so the pass offset
              // has to be added back to place the fade on the video's timeline.
              volume={(frame) => trackVolume(offset + frame, durationInFrames)}
            />
          </Sequence>
        );
      })}
    </>
  );
};
