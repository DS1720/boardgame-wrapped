import { AbsoluteFill } from 'remotion';
import { useFont, useTheme, useTypeScale } from '@/theme/ThemeContext';
import { VIDEO } from '../config';

/**
 * Slide layout primitives.
 *
 * These exist to make the plan's non-negotiables structural rather than a thing
 * each slide has to remember: content only ever goes inside `<SafeArea>`, and
 * type only ever comes from the four named scale steps.
 */

/** Rough advance width per character as a fraction of font size, for a bold display face. */
const DISPLAY_CHAR_WIDTH = 0.56;

/**
 * The only container slide content is allowed in.
 *
 * Story UI covers roughly the outer 10% of a phone screen, so nothing that
 * matters may sit outside this box. Test case 4 checks that every slide puts
 * its content here.
 */
export const SafeArea: React.FC<{
  children: React.ReactNode;
  justify?: React.CSSProperties['justifyContent'];
  align?: React.CSSProperties['alignItems'];
}> = ({ children, justify = 'center', align = 'flex-start' }) => (
  <AbsoluteFill
    data-safe-area
    style={{
      padding: VIDEO.safeMargin,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: justify,
      alignItems: align,
      textAlign: align === 'center' ? 'center' : 'left',
    }}
  >
    {children}
  </AbsoluteFill>
);

/* -------------------------------------------------------------------------- */
/* Type                                                                        */
/* -------------------------------------------------------------------------- */

/** Small tracked label above a stat. */
export const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const font = useFont('utility');
  const { caption } = useTypeScale();
  const { color } = useTheme();
  return (
    <p style={{ ...font, fontSize: caption, color: color.inkMuted, margin: 0, lineHeight: 1.2 }}>
      {children}
    </p>
  );
};

/** Sentence-level text below a stat. */
export const Caption: React.FC<{ children: React.ReactNode; accent?: boolean }> = ({
  children,
  accent = false,
}) => {
  const font = useFont('body');
  const { body } = useTypeScale();
  const { color } = useTheme();
  return (
    <p
      style={{
        ...font,
        fontSize: body,
        color: accent ? color.accent : color.inkMuted,
        margin: 0,
        lineHeight: 1.3,
      }}
    >
      {children}
    </p>
  );
};

/**
 * The headline step: a name, a title, anything that is words rather than a
 * number. Shrinks to fit rather than wrapping into an unreadable block.
 */
export const Headline: React.FC<{ children: string; maxLines?: number }> = ({
  children,
  maxLines = 2,
}) => {
  const font = useFont('display');
  const { headline } = useTypeScale();
  const { color } = useTheme();
  const size = fitText(children, headline, maxLines);

  return (
    <h2
      style={{
        ...font,
        fontSize: size,
        color: color.ink,
        margin: 0,
        lineHeight: 1.05,
        overflowWrap: 'break-word',
        maxWidth: '100%',
      }}
    >
      {children}
    </h2>
  );
};

/** The display step: the giant number. Never used for prose. */
export const DisplayNumber: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const font = useFont('display');
  const { display } = useTypeScale();
  const { color } = useTheme();
  return (
    <p
      style={{
        ...font,
        fontSize: display,
        color: color.accent,
        margin: 0,
        lineHeight: 0.94,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {children}
    </p>
  );
};

/**
 * Shrink a string until it fits the safe width in `maxLines` lines.
 *
 * The real export has a 24-character player name and a 56-character game title;
 * at the theme's headline size either would run off the frame. Pure and
 * exported so the fit can be tested without a browser.
 */
export const fitText = (text: string, baseSize: number, maxLines = 2): number => {
  const available = (VIDEO.width - VIDEO.safeMargin * 2) * maxLines;
  const longestWord = text.split(/\s+/).reduce((max, word) => Math.max(max, word.length), 0);

  const byTotal = available / Math.max(1, text.length * DISPLAY_CHAR_WIDTH);
  // A single long word cannot be solved by wrapping, so it gets its own budget.
  const byWord = (VIDEO.width - VIDEO.safeMargin * 2) / Math.max(1, longestWord * DISPLAY_CHAR_WIDTH);

  return Math.max(MIN_HEADLINE_PX, Math.min(baseSize, byTotal, byWord));
};

/** Below this a headline stops reading at arm's length on a phone. */
export const MIN_HEADLINE_PX = 44;

/* -------------------------------------------------------------------------- */
/* The single-number shape                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Eyebrow, giant number, caption.
 *
 * Deliberately not the shape of every slide — the plan warns against forcing
 * it. Slides whose content is a name, a face-off or a grid lay themselves out.
 */
export const StatBlock: React.FC<{
  eyebrow: string;
  value: React.ReactNode;
  caption?: React.ReactNode;
}> = ({ eyebrow, value, caption }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: '100%' }}>
    <Eyebrow>{eyebrow}</Eyebrow>
    <DisplayNumber>{value}</DisplayNumber>
    {caption ? <Caption>{caption}</Caption> : null}
  </div>
);

/** Vertical rhythm between blocks on a slide. */
export const Stack: React.FC<{ children: React.ReactNode; gap?: number }> = ({
  children,
  gap = 24,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap, maxWidth: '100%', width: '100%' }}>
    {children}
  </div>
);
