import { createContext, useContext } from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { withAlpha } from '@/theme/color';
import { useFont, useTheme, useTypeScale } from '@/theme/ThemeContext';
import { VIDEO } from '../config';

/**
 * The aside that arrives after the number.
 *
 * It lands about a second and a half in — long enough that the stat has been
 * read first, soon enough that it is still on screen for a while. It slides up
 * into place once and then holds: it is a line to be read, not another thing
 * moving in the frame.
 *
 * Rendered by `Wrapped` for every slide rather than by each slide, so a stat
 * component never has to think about it and one change covers all twenty.
 */

/** Frames after the slide's content starts before the line appears. */
export const QUIP_DELAY = 46;

/**
 * How far above the safe margin the line sits.
 *
 * Hard against the bottom margin it was being missed entirely — a phone's own
 * story UI crowds that edge, and the eye does not travel that far down after
 * reading a number in the middle of the frame. This lifts it to about the lower
 * third, close enough to the content to be read as part of the same slide.
 */
export const QUIP_LIFT = 190;

/**
 * Vertical space a slide gives up when it has an aside under it.
 *
 * The lift (190), plus two lines of body text at the largest starter scale
 * (44px at 1.35 = 119), plus 40px of air. Without this the
 * aside is absolutely positioned over content that is centred in the full
 * frame, and on the most-played slide it landed on top of the play count — the
 * taller the title, the worse the collision.
 *
 * Reserved rather than measured: a layout that depends on measuring text needs
 * two passes, and Remotion renders each frame once.
 */
export const QUIP_BAND = 350;

/**
 * How much bottom space the current slide owes its aside. Zero when it has none.
 *
 * A context rather than a prop because `SafeArea` is what has to act on it, and
 * every one of the twenty slides would otherwise have to pass it through.
 */
const QuipSpaceContext = createContext(0);

export const useQuipSpace = (): number => useContext(QuipSpaceContext);

export const QuipSpace: React.FC<{ has: boolean; children: React.ReactNode }> = ({
  has,
  children,
}) => (
  <QuipSpaceContext.Provider value={has ? QUIP_BAND : 0}>{children}</QuipSpaceContext.Provider>
);

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
        paddingBottom: VIDEO.safeMargin + QUIP_LIFT,
        pointerEvents: 'none',
      }}
    >
      <p
        style={{
          ...bodyFont,
          // Full body size, in ink rather than muted: at 78% and half-faded it
          // was decoration. It is the line most likely to be worth reading
          // twice, so it is set to be read the first time.
          fontSize: body,
          color: theme.color.ink,
          margin: 0,
          lineHeight: 1.35,
          maxWidth: VIDEO.width - VIDEO.safeMargin * 2,
          opacity,
          // Rises into place once, then holds. No drift: a line of text that
          // never settles is a line that is harder to read.
          transform: `translateY(${(1 - enter) * 22}px)`,
          // A rule to its left, so it reads as an aside rather than as another
          // caption that got separated from its number.
          borderLeft: `4px solid ${withAlpha(theme.color.accent, 0.85)}`,
          paddingLeft: 22,
        }}
      >
        {text}
      </p>
    </AbsoluteFill>
  );
};
