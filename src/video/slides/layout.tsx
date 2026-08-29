import { AbsoluteFill } from 'remotion';
import { useMemo } from 'react';
import { useFont, useTheme, useTypeScale } from '@/theme/ThemeContext';
import { ESTIMATED_ADVANCE, measureFor, type Measure } from '../measure';
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

/** Rough advance width per character, for when nothing can be measured. */
export const DISPLAY_CHAR_WIDTH = ESTIMATED_ADVANCE;

/**
 * How wide this theme's display face really sets a given string.
 *
 * Measured rather than estimated — see [measure.ts](src/video/measure.ts). One
 * constant covered every face while every face was roughly one width; it broke
 * on Archivo at 125%, and again on Syne, and the random generator picks a
 * display face at random, so any face being wrong made random themes
 * unreliable rather than just the two.
 */
const useMeasure = (role: 'display' | 'utility', fallback?: number): Measure => {
  const id = useTheme().type[role];
  return useMemo(() => measureFor(id, fallback), [id, fallback]);
};

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
}> = ({ children, justify = 'flex-end', align = 'flex-start' }) => {
  /*
    Content sits at the *bottom* of what is left once the aside's band is taken
    out, not in the middle of it.

    Centred, a short stat block floated in the middle of the frame with a third
    of the card empty under it and a third empty above — which is what makes a
    slide look like a slide rather than a card. Anchored low, every slide starts
    from the same line whatever its height, and a tall one grows upward into the
    space it needs. The band below is still reserved, so nothing has moved any
    closer to the aside than it was.
  */
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

/**
 * The label above a stat — and the thing that says what the number *is*.
 *
 * It used to be set at the caption step, which lost it the argument with the
 * figure underneath: "Longest win streak" at 30px below a 300px number reads as
 * a footnote to the number rather than as its subject, and a viewer who missed
 * it is left with a large 7 and no idea what it counts. At `LABEL_SCALE` it
 * sits just above the body step, in `ink` rather than `inkMuted`, so the
 * heading is read before the number it introduces.
 *
 * It is still unmistakably a label and not a headline: the utility face is
 * uppercase and tracked, and the display step above it is six times its size.
 */
export const Eyebrow: React.FC<{
  children: React.ReactNode;
  /** Measure to fit into. Narrower than the frame when the label sits in a column. */
  width?: number;
}> = ({ children, width }) => {
  const font = useFont('utility');
  const { caption } = useTypeScale();
  const { color } = useTheme();
  const measure = useMeasure('utility', LABEL_CHAR_WIDTH);
  // Only a string can be measured. A label built from an expression keeps the
  // base size, which is what every one of them resolves to anyway.
  const size =
    typeof children === 'string'
      ? fitLabel(children, caption, width, measure)
      : caption * LABEL_SCALE;
  return (
    <p style={{ ...font, fontSize: size, color: color.ink, margin: 0, lineHeight: 1.2 }}>
      {children}
    </p>
  );
};

/**
 * How much bigger than the caption step a label is set.
 *
 * Just above the body step, which is the point: the heading and the sentence
 * under the number are different things and should not be the same size.
 */
export const LABEL_SCALE = 1.6;

/**
 * Rough advance width per character for the utility face, tracking included.
 *
 * Wider than the display figure because every utility face is set uppercase —
 * and Inter's 0.16em tracking is part of the width, not a decoration on top of
 * it. This is the widest of the three, so the fit holds for all of them.
 */
const LABEL_CHAR_WIDTH = 0.78;

/**
 * Shrink a label until it fits the safe width on one line.
 *
 * A heading that wrapped would push the number down the frame by an amount that
 * depended on how long its title happened to be, so the same slide would sit in
 * two different places for two different players. It never goes below the
 * caption step: nothing is smaller than it was before labels were made bigger.
 *
 * Pure and exported so the fit can be tested without a browser.
 */
export const fitLabel = (
  text: string,
  captionSize: number,
  width: number = VIDEO.width - VIDEO.safeMargin * 2,
  measure: Measure = (t) => t.length * LABEL_CHAR_WIDTH,
): number => {
  const ems = Math.max(0.001, measure(text));
  return Math.max(captionSize, Math.min(captionSize * LABEL_SCALE, width / ems));
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
 * Air a slide keeps above its content, whatever the type does.
 *
 * Content is anchored to the bottom of its box, so anything that does not fit
 * spills off the *top* — and on a slide that leads with a cover, the top is the
 * cover. This is what guarantees it stays on screen.
 */
export const SLIDE_TOP_AIR = 56;

/**
 * The height left over for the one element that is allowed to grow.
 *
 * Everything else on these slides is a known quantity: a cover, a label, a
 * caption, the gaps between them, and the band the aside has already taken.
 * Pass their total; what comes back is the budget for the headline.
 *
 * Needed wherever a headline shares a frame with something tall. A headline
 * fills the measure it is given, so on a wide display face — Syne Extrabold,
 * Archivo at 125% — it grows until the frame runs out, and what runs out first
 * is the cover above it.
 */
export const useSpareHeight = (fixed: number, topAir: number = SLIDE_TOP_AIR): number =>
  VIDEO.height - VIDEO.safeMargin * 2 - useQuipSpace() - topAir - fixed;

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
  /**
   * Vertical budget, for a headline that shares its frame with something tall.
   * Unset means the only limit is the measure.
   */
  maxHeight?: number;
}> = ({ children, maxLines = 2, kinetic = true, delay = 0, maxHeight }) => {
  const font = useFont('display');
  const { display } = useTypeScale();
  const { color } = useTheme();
  const measure = useMeasure('display');
  /*
    A headline fills the width it is given, rather than being set at one size
    and shrunk only when it overruns.

    `fitText` is unchanged — it still returns the largest size that fits — but
    the ceiling handed to it is the display step rather than the headline step.
    A short name was the case that showed why: "Tina" at the headline step is
    four characters in the middle of a 1080px frame with two thirds of the line
    empty, which reads as a caption that lost its paragraph. At the display
    ceiling it fills the measure, which is what a title card does.

    The ceiling is the display step and not more, because the number is still
    meant to be the largest thing in the video. A long game title is unaffected:
    the measure, not the ceiling, is what decides its size, and that has not
    moved.
  */
  const size = fitBlock({
    text: children,
    ceiling: display,
    maxLines,
    measure,
    ...(maxHeight === undefined ? {} : { maxHeight }),
  });

  const style: React.CSSProperties = {
    ...font,
    fontSize: size,
    color: color.ink,
    margin: 0,
    // Just over 1. At 0.98 the line box was shorter than the glyphs and the
    // baseline of a 136px name came out shaved off at the bottom.
    lineHeight: HEADLINE_LINE_HEIGHT,
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
export const fitDisplay = (
  text: string,
  baseSize: number,
  measure: Measure | number = DISPLAY_CHAR_WIDTH,
): number => {
  const available = VIDEO.width - VIDEO.safeMargin * 2;
  // A number for the old call sites, which pass an advance per character.
  const ems =
    typeof measure === 'number'
      ? Math.max(0.001, text.length * measure)
      : Math.max(0.001, measure(text));
  return Math.max(MIN_DISPLAY_NUMBER_PX, Math.min(baseSize, available / ems));
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
  const measure = useMeasure('display');
  const size = fit === undefined ? display : fitDisplay(fit, display, measure);
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
        // A number is one thing and never two lines. Without this, "114 h"
        // broke at its own space and put the unit under the figure — the
        // formatted value is wider than its digits, and only the caller knows
        // by how much, which is what `fit` is for.
        whiteSpace: 'nowrap',
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
export const fitText = (
  text: string,
  baseSize: number,
  maxLines = 2,
  charWidth: number = DISPLAY_CHAR_WIDTH,
): number => fitBlock({ text, ceiling: baseSize, maxLines, charWidth });

/** The line height a headline is set at, and so what a line of one costs. */
export const HEADLINE_LINE_HEIGHT = 1.04;

export interface FitBlockOptions {
  text: string;
  /** The largest size this text may reach. */
  ceiling: number;
  maxLines?: number;
  /** Per-character estimate, used when no measurer is given. */
  charWidth?: number;
  /**
   * How wide this text really is, in ems, in the face it will be set in.
   *
   * Supersedes `charWidth` where it is given, which is everywhere a real font
   * is on screen. The estimate stays for tests, where there is no canvas and no
   * loaded font to measure against.
   */
  measure?: Measure;
  /** Measure to fit into. Defaults to the frame's safe width. */
  width?: number;
  /**
   * Vertical budget for the whole block, lines included.
   *
   * Unlimited by default, because most headlines are the only thing on their
   * slide. It matters where a headline shares the frame with something tall: on
   * the most-played slide a short two-word title like "Flip 7" wrapped to two
   * lines at nearly 300px each, which pushed the cover off the top of the frame
   * and the play count down into the aside. Width alone cannot catch that —
   * wrapping is what a width fitter does to *succeed*.
   */
  maxHeight?: number;
  lineHeight?: number;
  /** Never smaller than this, whatever the budget says. */
  floor?: number;
}

/**
 * The largest size at which `text` fits a box, in width *and* height.
 *
 * Tries each line count it is allowed and keeps the best: more lines buy width
 * but cost height, and which way that trade falls depends on the string. A
 * single long word cannot be solved by wrapping at all, so it gets its own
 * budget — that is the 56-character game title in this dataset.
 *
 * Pure and exported, because every interesting case here is arithmetic that a
 * test can check and a rendered frame cannot.
 */
export const fitBlock = ({
  text,
  ceiling,
  maxLines = 2,
  charWidth = DISPLAY_CHAR_WIDTH,
  measure,
  width = VIDEO.width - VIDEO.safeMargin * 2,
  maxHeight = Number.POSITIVE_INFINITY,
  lineHeight = HEADLINE_LINE_HEIGHT,
  floor = MIN_HEADLINE_PX,
}: FitBlockOptions): number => {
  const ems: Measure = measure ?? ((t) => t.length * charWidth);

  const whole = Math.max(0.001, ems(text));
  // A single long word cannot be solved by wrapping, so it gets its own budget.
  const longestWord = Math.max(
    0.001,
    ...text.split(/\s+/).map((word) => ems(word)),
  );
  const byWord = width / longestWord;

  let best = 0;
  for (let lines = 1; lines <= Math.max(1, maxLines); lines += 1) {
    const byMeasure = (width * lines) / whole;
    const byHeight = maxHeight / (lineHeight * lines);
    best = Math.max(best, Math.min(ceiling, byMeasure, byWord, byHeight));
  }

  return Math.max(floor, Math.min(ceiling, best));
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
