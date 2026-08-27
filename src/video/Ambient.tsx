import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { lift, withAlpha } from '@/theme/color';
import type { ThemeColor } from '@/theme/types';

/**
 * The moving ground.
 *
 * Large colour fields sliding over each other, plus a slow sweep across the
 * whole frame, for the entire video. Its job is that no frame is ever still:
 * a stat that has finished animating in should still be sitting on something
 * alive, the way a Wrapped card does.
 *
 * It lives above the `<Series>` in `Wrapped`, so it runs on the video's absolute
 * frame and moves straight through every cut. A background that restarted at
 * each slide would draw attention to the cuts instead of covering them.
 */

/** Seconds per full cycle, per field. Coprime-ish so they never resynchronise. */
const PERIODS = [17, 23, 29, 37] as const;

/** How far each field travels, in percent of the frame. */
const TRAVEL = [26, 22, 19, 30] as const;

interface Field {
  tint: keyof Pick<ThemeColor, 'accent' | 'accentAlt' | 'surface' | 'ink'>;
  origin: { x: number; y: number };
  size: { w: number; h: number };
  opacity: number;
  /** Offsets the phase so the fields never bunch up in one corner. */
  phase: number;
}

/**
 * Colour fields only — no full-frame lift.
 *
 * The first attempt at "more visible" raised every field's opacity and added a
 * wide `surface` wash across the whole frame. On a dark theme that is not
 * movement, it is fog: the felt-dark ground turned into a flat olive haze and
 * the contrast that makes big type land went with it.
 *
 * Movement here comes from *coloured* fields travelling across a ground that
 * stays dark, which is how the reference videos do it. Tighter fields at
 * moderate opacity read as motion; broad pale ones just raise the black level.
 */
const FIELDS: Field[] = [
  { tint: 'accent', origin: { x: 24, y: 24 }, size: { w: 58, h: 40 }, opacity: 0.2, phase: 0 },
  { tint: 'accentAlt', origin: { x: 78, y: 62 }, size: { w: 54, h: 38 }, opacity: 0.18, phase: 2.1 },
  { tint: 'accent', origin: { x: 68, y: 16 }, size: { w: 44, h: 32 }, opacity: 0.12, phase: 4.3 },
  { tint: 'accentAlt', origin: { x: 30, y: 84 }, size: { w: 50, h: 34 }, opacity: 0.14, phase: 5.6 },
];

export const Ambient: React.FC<{ color: ThemeColor; fps?: number }> = ({ color, fps = 30 }) => {
  const frame = useCurrentFrame();
  const seconds = frame / fps;

  // A slow rotation across the frame, so there is large-scale movement even
  // where the fields happen to be still. Kept faint: its job is to move, not to
  // lighten.
  const sweepAngle = (seconds / 47) * 360;
  const sweepShift = 50 + Math.sin((seconds / 19) * Math.PI * 2) * 24;

  return (
    <AbsoluteFill aria-hidden style={{ pointerEvents: 'none' }}>
      {FIELDS.map((field, index) => {
        const period = PERIODS[index];
        const travel = TRAVEL[index];
        const t = (seconds / period) * Math.PI * 2 + field.phase;

        // Two different frequencies per axis, so the path is a wander rather
        // than a circle you can predict after one loop.
        const x = field.origin.x + Math.sin(t) * travel;
        const y = field.origin.y + Math.cos(t * 0.61) * travel * 0.66;
        const scale = 1 + Math.sin(t * 0.43) * 0.14;

        return (
          <AbsoluteFill
            key={`${field.tint}-${index}`}
            style={{
              backgroundImage: `radial-gradient(${field.size.w * scale}% ${
                field.size.h * scale
              }% at ${x}% ${y}%, ${withAlpha(color[field.tint], field.opacity)} 0%, transparent 70%)`,
            }}
          />
        );
      })}

      {/* The sweep: a soft band rotating over the fields, keeping the corners
          moving where the radial fields have least effect. At 0.5 it washed the
          frame out; this is the level where it reads as movement and not haze. */}
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${sweepAngle}deg, transparent 0%, ${withAlpha(
            lift(color.surface, 6),
            0.16,
          )} ${sweepShift}%, transparent 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};
