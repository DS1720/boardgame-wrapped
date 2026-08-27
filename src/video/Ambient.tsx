import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { withAlpha } from '@/theme/color';
import type { ThemeColor } from '@/theme/types';

/**
 * The moving ground.
 *
 * Three soft colour fields drifting on their own periods, behind everything, for
 * the whole video. Its job is that the frame is never completely still — a
 * static slide between two counts reads as a stalled video even when it is
 * doing exactly what it should.
 *
 * It lives above the `<Series>` in `Wrapped`, so it runs on the video's absolute
 * frame and drifts straight through every cut. A background that restarted at
 * each slide would draw attention to the cuts instead of covering them.
 */

/** Slow enough to be felt rather than watched. Seconds per full cycle. */
const PERIODS = [23, 31, 41] as const;

/** How far each field travels, in percent of the frame. */
const TRAVEL = [14, 11, 9] as const;

interface Blob {
  /** Which of the theme's colours this field is made from. */
  tint: keyof Pick<ThemeColor, 'accent' | 'accentAlt' | 'surface'>;
  origin: { x: number; y: number };
  size: { w: number; h: number };
  opacity: number;
  /** Offsets the phase so the three never line up and pulse together. */
  phase: number;
}

const BLOBS: Blob[] = [
  { tint: 'accent', origin: { x: 28, y: 26 }, size: { w: 78, h: 52 }, opacity: 0.16, phase: 0 },
  { tint: 'accentAlt', origin: { x: 74, y: 62 }, size: { w: 68, h: 46 }, opacity: 0.13, phase: 2.1 },
  { tint: 'surface', origin: { x: 46, y: 88 }, size: { w: 92, h: 40 }, opacity: 0.5, phase: 4.3 },
];

export const Ambient: React.FC<{ color: ThemeColor; fps?: number }> = ({ color, fps = 30 }) => {
  const frame = useCurrentFrame();
  const seconds = frame / fps;

  return (
    <AbsoluteFill aria-hidden style={{ pointerEvents: 'none' }}>
      {BLOBS.map((blob, index) => {
        const period = PERIODS[index];
        const travel = TRAVEL[index];
        const t = (seconds / period) * Math.PI * 2 + blob.phase;

        // Two different frequencies per axis, so the path is a slow wander
        // rather than a circle you can predict after one loop.
        const x = blob.origin.x + Math.sin(t) * travel;
        const y = blob.origin.y + Math.cos(t * 0.61) * travel * 0.7;
        // A gentle breath in size, well under a tenth, so it never reads as a
        // pulse in time with anything.
        const scale = 1 + Math.sin(t * 0.43) * 0.06;

        return (
          <AbsoluteFill
            key={blob.tint}
            style={{
              backgroundImage: `radial-gradient(${blob.size.w * scale}% ${
                blob.size.h * scale
              }% at ${x}% ${y}%, ${withAlpha(color[blob.tint], blob.opacity)} 0%, transparent 68%)`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
