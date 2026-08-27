import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { useFont, useTheme, useTypeScale } from '@/theme/ThemeContext';
import { LEAD_IN_FRAMES } from '../timeline';
import { VIDEO } from '../config';
import { SafeArea } from './layout';

/**
 * A line that sets up the slide behind it.
 *
 * Some numbers land better with a beat of anticipation first — "you were
 * particularly good at one game", then the game. Only some slides get one: a
 * lead-in before every slide would be a narrator, and the video would stop
 * being about the numbers.
 *
 * The line and the slide share the slide's time rather than the lead-in being a
 * slide of its own. That keeps the beat grid intact — everything is still a
 * whole number of bars — and means turning a slide off cannot leave its
 * introduction stranded.
 */

/** Frames the line takes to leave. Overlaps the slide's own entry. */
const LEAD_OUT_FRAMES = 12;

export const LeadIn: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const bodyFont = useFont('body');
  const { headline } = useTypeScale();

  const enter = interpolate(frame, [0, 10], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const leave = interpolate(
    frame,
    [LEAD_IN_FRAMES - LEAD_OUT_FRAMES, LEAD_IN_FRAMES],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const opacity = Math.min(enter, leave);

  // Nothing to draw once it has gone; leaving a transparent layer over the
  // slide would still cost a paint on every frame behind it.
  if (opacity <= 0) return null;

  return (
    <AbsoluteFill style={{ opacity }}>
      <SafeArea justify="center">
        <p
          style={{
            ...bodyFont,
            // Below the headline step: this is a voice, not a title, and it
            // must not compete with the number it is introducing.
            fontSize: headline * 0.52,
            color: theme.color.ink,
            margin: 0,
            lineHeight: 1.24,
            maxWidth: VIDEO.width - VIDEO.safeMargin * 2,
            // Drifts up as it fades, so it hands over rather than blinking out.
            transform: `translateY(${(1 - enter) * 26 - (1 - leave) * 14}px)`,
          }}
        >
          {text}
        </p>
      </SafeArea>
    </AbsoluteFill>
  );
};
