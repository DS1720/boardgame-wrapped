import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { withAlpha } from '@/theme/color';
import { useTheme } from '@/theme/ThemeContext';
import { BOX_ART } from '../config';
import { useMotionSpring } from '../motion';

/**
 * Theme signatures — the one element that makes each theme recognizable.
 *
 * Step 6 declared these in the tokens; this is where they are drawn. A
 * signature is the thing a person would describe if asked what the video looked
 * like, so each theme gets exactly one and it appears on every slide.
 */

/* -------------------------------------------------------------------------- */
/* Punchboard: die-cut                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Stats sit in rounded rectangles that punch out of the board on entry,
 * leaving a recessed shadow behind them.
 *
 * The recess is drawn first and never moves; the plate travels out of it. That
 * ordering is the whole illusion — a plate and its hole moving together would
 * just read as a card sliding.
 */
const DieCut: React.FC<{ children: React.ReactNode; delay: number }> = ({ children, delay }) => {
  const { color } = useTheme();
  const progress = useMotionSpring(delay);
  const lift = interpolate(progress, [0, 1], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: BOX_ART.radius,
          // The hole left behind: darker than the board, lit from the top edge.
          backgroundColor: withAlpha(color.ink, 0.14),
          boxShadow: `inset 0 3px 6px ${withAlpha(color.ink, 0.3)}`,
        }}
      />
      <div
        style={{
          position: 'relative',
          borderRadius: BOX_ART.radius,
          backgroundColor: color.surface,
          padding: '40px 44px',
          transform: `translate(${lift * -10}px, ${lift * -14}px)`,
          boxShadow: `${lift * 12}px ${lift * 16}px ${lift * 26}px ${withAlpha(color.ink, 0.28)}`,
        }}
      >
        {children}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Scorepad: tally marks and ruled lines                                       */
/* -------------------------------------------------------------------------- */

/** Faint ruled lines running through every slide, like a score sheet. */
const RuledLines: React.FC = () => {
  const { color } = useTheme();
  return (
    <AbsoluteFill
      aria-hidden
      style={{
        backgroundImage: `repeating-linear-gradient(180deg, transparent 0 87px, ${withAlpha(
          color.accentAlt,
          0.28,
        )} 87px 89px)`,
      }}
    />
  );
};

/**
 * A count drawn as tally marks that stroke on one at a time.
 *
 * Capped, because 233 tally marks is not a slide. Past the cap the marks read
 * as a texture standing in for the number rather than a countable set, which is
 * the honest way to show it — the exact figure is always beside them.
 */
/** Frames one mark takes to stroke on. */
export const TALLY_STROKE_FRAMES = 3;

/**
 * Frames between the start of one mark and the next.
 *
 * Marks share a fixed window rather than each taking a fixed slot. With a flat
 * 3-frame stagger, 25 marks ran 84 frames and the last strokes were still being
 * drawn as the slide cut away.
 */
export const tallyStep = (shown: number, windowFrames: number): number =>
  shown > 1 ? Math.min(TALLY_STROKE_FRAMES, (windowFrames - TALLY_STROKE_FRAMES) / (shown - 1)) : 0;

/** The frame, relative to the tally's start, at which the last mark is complete. */
export const tallyFinishFrame = (shown: number, windowFrames: number): number =>
  shown <= 0 ? 0 : (shown - 1) * tallyStep(shown, windowFrames) + TALLY_STROKE_FRAMES;

export const TallyMarks: React.FC<{
  count: number;
  delay?: number;
  max?: number;
  /** Frames the whole set has to finish in, so it never outlives its slide. */
  windowFrames?: number;
}> = ({ count, delay = 0, max = 25, windowFrames = 46 }) => {
  const frame = useCurrentFrame();
  const { color } = useTheme();
  const shown = Math.min(count, max);
  const groups = Math.ceil(shown / 5);

  const step = tallyStep(shown, windowFrames);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22, alignItems: 'flex-end' }}>
      {Array.from({ length: groups }, (_, groupIndex) => {
        const inGroup = Math.min(5, shown - groupIndex * 5);
        return (
          <svg key={groupIndex} width={68} height={72} viewBox="0 0 68 72" aria-hidden>
            {Array.from({ length: inGroup }, (_, markIndex) => {
              const index = groupIndex * 5 + markIndex;
              const drawn = interpolate(frame - delay - index * step, [0, TALLY_STROKE_FRAMES], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              });
              // A zero-length line with a round cap draws a dot, so an
              // un-started mark has to be left out entirely rather than sized 0.
              if (drawn <= 0) return null;
              const isFifth = markIndex === 4;
              // The fifth mark crosses the other four, as a real tally does.
              const x1 = isFifth ? 4 : 8 + markIndex * 13;
              const y1 = isFifth ? 58 : 6;
              const x2 = isFifth ? 60 : 8 + markIndex * 13;
              const y2 = isFifth ? 14 : 66;
              return (
                <line
                  key={markIndex}
                  x1={x1}
                  y1={y1}
                  x2={x1 + (x2 - x1) * drawn}
                  y2={y1 + (y2 - y1) * drawn}
                  stroke={color.accent}
                  strokeWidth={5}
                  strokeLinecap="round"
                />
              );
            })}
          </svg>
        );
      })}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Table Light: the lamp pool                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A soft radial pool of warm light behind the subject, everything outside it
 * falling to near-black. The pool drifts a few pixels over the slide, so the
 * light never looks like a static gradient.
 */
const LampPool: React.FC = () => {
  const frame = useCurrentFrame();
  const { color } = useTheme();

  // A slow, unsynchronised drift — the two axes use different periods so the
  // motion never repeats visibly inside one slide.
  const x = 50 + Math.sin(frame / 96) * 2.2;
  const y = 38 + Math.cos(frame / 71) * 1.8;

  return (
    <AbsoluteFill
      aria-hidden
      style={{
        backgroundImage: `radial-gradient(58% 38% at ${x}% ${y}%, ${withAlpha(
          color.accent,
          0.24,
        )} 0%, ${withAlpha(color.accent, 0.08)} 45%, transparent 72%)`,
      }}
    />
  );
};

/* -------------------------------------------------------------------------- */
/* Dispatch                                                                    */
/* -------------------------------------------------------------------------- */

/** The full-frame part of a signature, drawn behind slide content. */
export const SignatureBackdrop: React.FC = () => {
  const { signature } = useTheme();
  if (signature === 'tally') return <RuledLines />;
  if (signature === 'lamp') return <LampPool />;
  return null;
};

/**
 * Wraps a stat so it carries the theme's signature treatment.
 *
 * Only Punchboard changes the box a stat sits in; the other two signatures act
 * on the ground or on the number itself, so this is a pass-through for them.
 */
export const SignaturePlate: React.FC<{ children: React.ReactNode; delay?: number }> = ({
  children,
  delay = 0,
}) => {
  const { signature } = useTheme();
  if (signature === 'diecut') return <DieCut delay={delay}>{children}</DieCut>;
  return <>{children}</>;
};

/** True when the theme wants counts shown as tally marks alongside the figure. */
export const useTally = (): boolean => useTheme().signature === 'tally';
