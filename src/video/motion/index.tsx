import { Children, isValidElement } from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { formatNumber } from '@/shared/format';
import { useTheme } from '@/theme/ThemeContext';

/**
 * The motion layer.
 *
 * Everything on a slide moves through one of these three, and all three read
 * their spring from `theme.motion`. That is what makes Punchboard feel like
 * stamped cardboard and Table Light feel like something settling under a lamp,
 * without a single slide knowing which theme it is in.
 */

/** How far, in px, an element travels on entry. Large enough to read at 1080 wide. */
const DEFAULT_DISTANCE = 48;

/** Opacity resolves faster than position — a long fade reads as sluggish. */
const FADE_FRAMES = 8;

export const useMotionSpring = (delay = 0) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { motion } = useTheme();
  return spring({
    frame: frame - delay,
    fps,
    config: { stiffness: motion.stiffness, damping: motion.damping },
  });
};

export interface RevealProps {
  delay?: number;
  /** Travel distance in px. Pass 0 for something that should only fade. */
  distance?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  /**
   * Make the wrapper fill its parent.
   *
   * Reveal's wrapper is a plain block, so a child asking for `height: 100%`
   * resolves against `auto` and collapses to nothing. Anything that needs to
   * fill — a full-bleed hero, for one — has to say so here.
   */
  fill?: boolean;
  children: React.ReactNode;
}

/**
 * Spring entry using the theme's motion profile.
 *
 * The spring drives position only. Opacity runs on its own short linear ramp,
 * because a spring that overshoots would push opacity past 1 and then pull it
 * back — a visible flicker on the stiffer profiles.
 */
export const Reveal: React.FC<RevealProps> = ({
  delay = 0,
  distance = DEFAULT_DISTANCE,
  direction = 'up',
  fill = false,
  children,
}) => {
  const frame = useCurrentFrame();
  const progress = useMotionSpring(delay);

  const offset = (1 - progress) * distance;
  const axis = direction === 'up' || direction === 'down' ? 'Y' : 'X';
  const sign = direction === 'up' || direction === 'left' ? 1 : -1;

  const opacity = interpolate(frame - delay, [0, FADE_FRAMES], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        opacity,
        transform: `translate${axis}(${offset * sign}px)`,
        ...(fill ? { width: '100%', height: '100%' } : {}),
      }}
    >
      {children}
    </div>
  );
};

export interface CountUpProps {
  to: number;
  delay?: number;
  /** Frames the count takes. Longer than the entry, so the number is the last thing to settle. */
  durationInFrames?: number;
  format?: (value: number) => string;
}

/**
 * A number that counts to its value rather than appearing at it.
 *
 * The plan is explicit that this is never a fade-in: the count is the moment on
 * a stat slide, and a number that simply appears has no moment. The value is
 * clamped so an overshooting spring never shows a figure larger than the real
 * one — briefly displaying "247 plays" when the truth is 233 would be a lie,
 * however short-lived.
 */
export const CountUp: React.FC<CountUpProps> = ({
  to,
  delay = 0,
  durationInFrames = 34,
  format = formatNumber,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { motion } = useTheme();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { stiffness: motion.stiffness, damping: motion.damping },
    durationInFrames,
  });

  const value = interpolate(progress, [0, 1], [0, to], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return <>{format(Math.round(value))}</>;
};

export interface StaggerProps {
  delay?: number;
  distance?: number;
  direction?: RevealProps['direction'];
  /** Overrides the theme's stagger. Use only when a slide genuinely needs a different rhythm. */
  step?: number;
  children: React.ReactNode;
}

/**
 * Reveals children one after another, `theme.motion.stagger` frames apart.
 *
 * Nulls are dropped before numbering, so a list whose second item is missing
 * does not leave a hole in the rhythm.
 */
export const Stagger: React.FC<StaggerProps> = ({
  delay = 0,
  distance,
  direction,
  step,
  children,
}) => {
  const { motion } = useTheme();
  const gap = step ?? motion.stagger;
  const items = Children.toArray(children).filter((child) => isValidElement(child) || child !== null);

  return (
    <>
      {items.map((child, index) => (
        <Reveal
          // eslint-disable-next-line react/no-array-index-key -- position is the identity here
          key={index}
          delay={delay + index * gap}
          distance={distance}
          direction={direction}
        >
          {child}
        </Reveal>
      ))}
    </>
  );
};

/**
 * Keeps something moving for as long as it is on screen.
 *
 * `Reveal` animates an element in and then leaves it perfectly still, which is
 * what made finished slides read as paused. This adds a slow drift that never
 * stops — small enough that you do not watch it, large enough that the frame is
 * never frozen.
 *
 * Each element gets its own `phase`, so a stack of them breathes out of step
 * rather than sliding as one block.
 */
export const Float: React.FC<{
  children: React.ReactNode;
  /** Pixels of travel. Keep it small; this is texture, not animation. */
  amount?: number;
  /** Seconds per cycle. Long, so it never visibly repeats within a slide. */
  period?: number;
  phase?: number;
}> = ({ children, amount = 7, period = 8, phase = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (frame / fps / period) * Math.PI * 2 + phase;

  return (
    <div
      style={{
        // 2D `translate`, deliberately not `translate3d`. The 3D form promotes
        // the element to its own compositor layer sized to its border box, and
        // anything the glyphs overhang — which a 136px display face at a tight
        // line-height certainly does — is clipped when that layer is rasterised.
        // It cost the intro the bottom of the player's name.
        transform: `translate(${Math.cos(t * 0.77) * amount * 0.45}px, ${Math.sin(t) * amount}px)`,
      }}
    >
      {children}
    </div>
  );
};

/**
 * A headline that arrives a word at a time.
 *
 * The single most recognisable move in this kind of video: the line does not
 * fade in, it assembles. Words are separate spans on one baseline grid, each on
 * its own spring, so a long title still wraps naturally.
 */
export const KineticWords: React.FC<{
  text: string;
  delay?: number;
  /** Frames between one word and the next. */
  step?: number;
  style?: React.CSSProperties;
}> = ({ text, delay = 0, step = 3, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { motion } = useTheme();
  const words = text.split(/\s+/).filter(Boolean);

  return (
    <span style={{ display: 'inline', ...style }}>
      {words.map((word, index) => {
        const at = delay + index * step;
        const progress = spring({
          frame: frame - at,
          fps,
          config: { stiffness: motion.stiffness, damping: motion.damping },
        });
        const opacity = interpolate(frame - at, [0, 6], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });

        return (
          <span
            // eslint-disable-next-line react/no-array-index-key -- position is the identity
            key={index}
            style={{
              display: 'inline-block',
              opacity,
              // Rises and settles, rather than simply appearing.
              transform: `translateY(${(1 - progress) * 0.34}em)`,
              // A space of its own, so `inline-block` words do not run together.
              marginRight: '0.26em',
            }}
          >
            {word}
          </span>
        );
      })}
    </span>
  );
};
