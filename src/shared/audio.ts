/**
 * Soundtrack: shared types and the timing maths.
 *
 * Everything here is pure and runs in both the browser and Node, so the crop
 * the UI shows and the segment the renderer plays are computed by the same
 * code. Decoding and analysis live in `server/audio.ts`.
 */

export interface Track {
  id: string;
  /** Filename inside public/audio. */
  file: string;
  name: string;
  bpm: number;
  /** Seconds from the start of the file to the first downbeat. */
  beatOffset: number;
  /** 0–1 from the detector. Low means the bpm wants a human check. */
  confidence: number;
  durationSeconds: number;
  /** User crop, in seconds into the source file. */
  trimStart: number;
  trimEnd: number;
  license: string;
  credit: string;
  /** Downsampled absolute peaks, for drawing the crop UI without re-decoding. */
  peaks: number[];
  source: 'bundled' | 'upload';
  addedAt: string;
}

export interface AudioManifest {
  version: 1;
  generatedAt: string;
  tracks: Track[];
}

export const AUDIO_MANIFEST_VERSION = 1 as const;
export const AUDIO_MANIFEST_FILE = 'manifest.json';

export const emptyAudioManifest = (): AudioManifest => ({
  version: AUDIO_MANIFEST_VERSION,
  generatedAt: new Date().toISOString(),
  tracks: [],
});

/** Formats the browser and ffmpeg both handle. */
export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'opus'] as const;
export type AudioExtension = (typeof AUDIO_EXTENSIONS)[number];

export const extensionOf = (filename: string): string =>
  filename.split('.').pop()?.toLowerCase() ?? '';

export const isSupportedAudio = (filename: string): boolean =>
  (AUDIO_EXTENSIONS as readonly string[]).includes(extensionOf(filename));

/* -------------------------------------------------------------------------- */
/* The beat grid                                                               */
/* -------------------------------------------------------------------------- */

/** Seconds per beat. */
export const beatSeconds = (bpm: number): number => 60 / Math.max(1, bpm);

/** Seconds per bar, assuming 4/4. */
export const barSeconds = (bpm: number): number => beatSeconds(bpm) * 4;

/**
 * Frames per bar. Deliberately not rounded.
 *
 * At 128 BPM and 30fps a bar is 56.25 frames. Rounding that to 56 and
 * multiplying by 26 bars loses six and a half frames by the end of the video —
 * a fifth of a second of drift, which is audible as slides falling off the
 * beat. Callers round *positions*, never the step.
 */
export const framesPerBar = (bpm: number, fps: number): number => barSeconds(bpm) * fps;

/**
 * Snap a time to the nearest downbeat of the track's grid.
 *
 * A crop a person drags is never exactly on a downbeat, and starting the audio
 * a tenth of a second early puts every slide cut off the beat for the whole
 * video. Snapping the crop is what makes the alignment automatic.
 */
export const snapToDownbeat = (seconds: number, bpm: number, beatOffset: number): number => {
  const bar = barSeconds(bpm);
  if (bar <= 0) return Math.max(0, seconds);
  const bars = Math.round((seconds - beatOffset) / bar);
  return Math.max(0, beatOffset + bars * bar);
};

/** Whole bars that fit in a span of seconds. */
export const barsIn = (seconds: number, bpm: number): number =>
  Math.max(0, Math.floor(seconds / barSeconds(bpm)));

export interface Playback {
  /** First frame of the source file to play. */
  startFrame: number;
  /** Frames in one pass of the cropped segment. */
  segmentFrames: number;
  /** Passes needed to cover the video. 1 when the crop is long enough. */
  loops: number;
  /** True when the crop is shorter than the video and has to repeat. */
  looped: boolean;
  /** Where the crop starts, after snapping, in seconds. */
  startSeconds: number;
  /** Length of one pass in seconds, after snapping to whole bars. */
  segmentSeconds: number;
}

/**
 * Work out what to play, for how long, and how many times.
 *
 * Two snaps happen here, and both exist to keep the beat: the start moves to
 * the nearest downbeat, and the length is trimmed to a whole number of bars.
 * The second is what makes looping work — a segment of 3.7 bars would put the
 * downbeat in a different place on every repeat, which is audible immediately.
 */
export const resolvePlayback = (
  track: Track,
  videoDurationInFrames: number,
  fps: number,
): Playback => {
  const bar = barSeconds(track.bpm);
  const rawStart = Math.max(0, Math.min(track.trimStart, track.durationSeconds));
  const startSeconds = Math.min(
    snapToDownbeat(rawStart, track.bpm, track.beatOffset),
    Math.max(0, track.durationSeconds - bar),
  );

  const rawEnd = Math.min(track.trimEnd || track.durationSeconds, track.durationSeconds);
  const available = Math.max(0, rawEnd - startSeconds);

  // At least one bar, even for a crop dragged down to nothing.
  const wholeBars = Math.max(1, barsIn(available, track.bpm));
  const segmentSeconds = wholeBars * bar;
  const segmentFrames = Math.max(1, Math.round(segmentSeconds * fps));

  const loops = Math.max(1, Math.ceil(videoDurationInFrames / segmentFrames));

  return {
    startFrame: Math.round(startSeconds * fps),
    segmentFrames,
    loops,
    looped: loops > 1,
    startSeconds,
    segmentSeconds,
  };
};

/* -------------------------------------------------------------------------- */
/* Volume                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A full second in, two seconds out, at 30fps.
 *
 * The fade-in was 12 frames, which is long enough to kill the click off a
 * cropped segment but too short to hear as a fade — the music simply arrived.
 * A second reads as the track coming up under the intro; two seconds out lets
 * it settle rather than stop.
 */
export const FADE_IN_FRAMES = 30;
export const FADE_OUT_FRAMES = 60;

/** Eased rather than linear, so the ramp does not sound mechanical. */
const easeInOut = (t: number): number => t * t * (3 - 2 * t);

/**
 * Track volume at a frame.
 *
 * Both ends are shortened on a video too brief to hold them, so a short cut
 * still reaches full volume in the middle instead of fading in and straight
 * back out again.
 */
export const trackVolume = (frame: number, durationInFrames: number): number => {
  const budget = Math.max(1, Math.floor(durationInFrames / 3));
  const inFrames = Math.min(FADE_IN_FRAMES, budget);
  const outFrames = Math.min(FADE_OUT_FRAMES, budget);

  const rising = Math.min(1, Math.max(0, frame / inFrames));
  const falling = Math.min(1, Math.max(0, (durationInFrames - frame) / outFrames));
  return easeInOut(Math.min(rising, falling));
};

/** A crop that has not been set yet: the whole file. */
export const defaultTrim = (durationSeconds: number) => ({ trimStart: 0, trimEnd: durationSeconds });
