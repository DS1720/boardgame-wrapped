import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { withAlpha } from '@/theme/color';
import { useFont, useTheme, useTypeScale } from '@/theme/ThemeContext';
import { VIDEO } from '../config';
import { Float } from '../motion';

/**
 * The aside that arrives after the number.
 *
 * It lands about a second and a half in — long enough that the stat has been
 * read first, soon enough that it is still on screen for a while. It sits at
 * the foot of the frame, out of the content's way, and drifts the whole time it
 * is up.
 *
 * Rendered by `Wrapped` for every slide rather than by each slide, so a stat
 * component never has to think about it and one change covers all twenty.
 */

/** Frames after the slide's content starts before the line appears. */
export const QUIP_DELAY = 46;

export const Quip: React.FC<{ text: string | null }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = useTheme();
  const bodyFont = useFont('body');
  const { body } = useTypeScale();

  if (!text) return null;

  const enter = spring({
    frame: frame - QUIP_DELAY,
    fps,
    config: { stiffness: theme.motion.stiffness, damping: theme.motion.damping },
  });
  const opacity = interpolate(frame - QUIP_DELAY, [0, 9], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Nothing to paint before its cue.
  if (opacity <= 0) return null;

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'flex-start',
        padding: VIDEO.safeMargin,
        pointerEvents: 'none',
      }}
    >
      <Float amount={6} period={7} phase={0.8}>
        <p
          style={{
            ...bodyFont,
            fontSize: body * 0.78,
            color: theme.color.inkMuted,
            margin: 0,
            lineHeight: 1.3,
            maxWidth: VIDEO.width - VIDEO.safeMargin * 2,
            opacity,
            transform: `translateY(${(1 - enter) * 22}px)`,
            // A rule to its left, so it reads as an aside rather than as another
            // caption that got separated from its number.
            borderLeft: `3px solid ${withAlpha(theme.color.accent, 0.7)}`,
            paddingLeft: 18,
          }}
        >
          {text}
        </p>
      </Float>
    </AbsoluteFill>
  );
};
