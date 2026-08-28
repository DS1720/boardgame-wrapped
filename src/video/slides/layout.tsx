import { AbsoluteFill } from 'remotion';
import { useFont, useTheme, useTypeScale } from '@/theme/ThemeContext';
import { VIDEO } from '../config';
import { KineticWords } from '../motion';
import { useQuipSpace } from './Quip';

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
}> = ({ children, justify = 'center', align = 'flex-start' }) => {
  // Content is centred in what is left after the aside's band is taken out, so
  // a slide with a long name or a two-line title rides up instead of running
  // into the line at the bottom.
  const reserved = useQuipSpace();
  return (
    <AbsoluteFill
      data-safe-area
      style={{
        padding: VIDEO.safeMargin,
        paddingBottom: VIDEO.safeMargin + reserved,
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
};

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
export const Headline: React.FC<{
  children: string;
  maxLines?: number;
  /** Assemble a word at a time. Off for headlines that are already in motion. */
  kinetic?: boolean;
  delay?: number;
}> = ({ children, maxLines = 2, kinetic = true, delay = 0 }) => {
  const font = useFont('display');
  const { headline } = useTypeScale();
  const { color } = useTheme();
  const size = fitText(children, headline, maxLines);

  const style: React.CSSProperties = {
    ...font,
    fontSize: size,
    color: color.ink,
    margin: 0,
    // Just over 1. At 0.98 the line box was shorter than the glyphs and the
    // baseline of a 136px name came out shaved off at the bottom.
    lineHeight: 1.04,
    // Tight tracking at display sizes: loose letterspacing on a 130px headline
    // is what makes big type look like a document rather than a title card.
    letterSpacing: '-0.025em',
    overflowWrap: 'break-word',
    maxWidth: '100%',
    // Descenders on a display face reach past the line box even at 1.04.
    paddingBottom: '0.06em',
  };

  if (!kinetic) return <h2 style={style}>{children}</h2>;

  return (
    <h2 style={style}>
      <KineticWords text={children} delay={delay} />
    </h2>
  );
};

/**
 * Shrink a display number until it fits the safe width on one line.
 *
 * The scale sets 280–310px, which at this face is about five characters of
 * budget — so a six-figure score ran off the right edge of the frame. A number
 * never wraps, so it can only be made smaller.
 *
 * Pure and exported so the sizing can be tested without a browser.
 */
export const fitDisplay = (text: string, baseSize: number): number => {
  const available = VIDEO.width - VIDEO.safeMargin * 2;
  const width = Math.max(1, text.length * DISPLAY_CHAR_WIDTH);
  return Math.max(MIN_DISPLAY_NUMBER_PX, Math.min(baseSize, available / width));
};

/**
 * Below this the number stops being the biggest thing on the slide, which is
 * the whole point of it. Nothing in the data reaches this — it is a floor, not
 * a target.
 */
export const MIN_DISPLAY_NUMBER_PX = 120;

/** The display step: the giant number. Never used for prose. */
export const DisplayNumber: React.FC<{
  children: React.ReactNode;
  /**
   * The widest string this number will ever show.
   *
   * `children` is usually a `<CountUp>`, whose text is not knowable here, so
   * the caller passes the final value to size against. Sizing against the
   * count's *current* value would make the type shrink as the number grew.
   */
  fit?: string;
}> = ({ children, fit }) => {
  const font = useFont('display');
  const { display } = useTypeScale();
  const { color } = useTheme();
  const size = fit === undefined ? display : fitDisplay(fit, display);
  return (
    // No drift. The number counts up and then holds perfectly still: a figure
    // that keeps sliding is harder to read, and this is the one thing on the
    // slide the viewer is meant to read. Movement belongs to the background.
    <p
      style={{
        ...font,
        fontSize: size,
        color: color.accent,
        margin: 0,
        // Just under 1: tight enough to look set rather than typed, loose
        // enough that the caption below is not touching the digits.
        lineHeight: 0.95,
        letterSpacing: '-0.035em',
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
  /** Passed straight to `DisplayNumber`: the widest string the value reaches. */
  fit?: string;
}> = ({ eyebrow, value, caption, fit }) => (
  // The three parts arrive and then stop. They used to drift on offset phases
  // so the block "breathed"; at this size that is not texture, it is the text
  // failing to settle, and it made a stat slide tiring to read.
  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: '100%' }}>
    <Eyebrow>{eyebrow}</Eyebrow>
    <DisplayNumber fit={fit}>{value}</DisplayNumber>
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
