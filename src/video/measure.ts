/**
 * How wide a string actually is, rather than how wide its character count
 * suggests it might be.
 *
 * Everything that fits type in this project used to size against one constant:
 * 0.56em per character, calibrated on the display faces that existed at the
 * time. That held while every face was roughly one width. It stopped holding
 * the moment a theme took the far end of Archivo's width axis, and it broke
 * outright once Syne and Outfit arrived — a headline set in Syne Extrabold is
 * half again as wide as the guess, so it ran off the right edge of the frame.
 * The random generator picks a display face at random, so *any* face being
 * wrong made random themes unreliable rather than just two of them.
 *
 * Rather than keep adding per-face constants and hoping the next one is
 * measured, this measures. `measureText` on a 2D canvas is synchronous — no
 * layout pass, no second render — which is what makes it usable somewhere that
 * renders each frame exactly once.
 *
 * Both the Player and the CLI render are Chrome reading the same mirrored font
 * files, and `FontLoader` holds the first frame until those files have loaded,
 * so the two measure the same thing. The estimate survives as the fallback for
 * anywhere there is no canvas at all — a unit test, mostly.
 */
import { FONTS, fontStack } from '@/theme/fonts';
import type { FontId } from '@/theme/types';

/** The width of a string in ems of its own font size. */
export type Measure = (text: string) => number;

/**
 * Rough advance per character, for when nothing can be measured.
 *
 * The old constant, kept honest about what it is: a guess that is right for
 * about half the faces here and 40% out on the widest of them.
 */
export const ESTIMATED_ADVANCE = 0.56;

/** Big enough that rounding in `measureText` is noise, small enough to be exact. */
const REFERENCE_PX = 100;

/**
 * Plausible range for the average advance of a real face.
 *
 * A measurement taken before the font loaded is a measurement of whatever
 * Chrome fell back to, which is a different width and would silently mis-size
 * everything. Anything outside this range is treated as not-yet-loaded and the
 * estimate is used instead. Condensed faces sit near 0.42 and the widest
 * uppercase tracked ones near 1.0, so the bounds are wide enough never to
 * reject a real answer.
 */
const PLAUSIBLE = { min: 0.25, max: 1.8 } as const;

let cached: CanvasRenderingContext2D | null | undefined;

const context = (): CanvasRenderingContext2D | null => {
  if (cached !== undefined) return cached;
  try {
    cached =
      typeof document === 'undefined'
        ? null
        : document.createElement('canvas').getContext('2d');
  } catch {
    // A context can be refused outright — a headless environment with no 2D
    // backend. Losing the measurement is survivable; throwing here is not.
    cached = null;
  }
  return cached;
};

/** "0.16em" → 0.16. Anything else is no tracking at all. */
const trackingEm = (tracking: string | undefined): number => {
  const match = tracking?.match(/^(-?[\d.]+)em$/);
  return match ? Number(match[1]) : 0;
};

/** "75%" → 0.75. The width axis scales advances very nearly proportionally. */
const stretchFactor = (stretch: string | undefined): number => {
  const match = stretch?.match(/^([\d.]+)%$/);
  return match ? Number(match[1]) / 100 : 1;
};

/**
 * A measurer for one font choice, tracking, width and uppercase included.
 *
 * The three are part of the choice, not decoration on top of it: `inter-tracked`
 * is Inter set uppercase at 0.16em, and measuring plain lowercase Inter would
 * understate it by a fifth.
 *
 * Letter-spacing is added rather than set on the context. `ctx.letterSpacing`
 * exists in current Chrome and not everywhere else, and a fit that depended on
 * which of the two browsers was measuring is exactly the kind of difference
 * between the Player and a render that this project does not accept.
 */
/**
 * The widest digit in a face, which under `tabular-nums` is every digit.
 *
 * `measureText` has no idea about `font-variant-numeric`, so it measures the
 * proportional figures — and in a face whose 1 is narrow, that understates a
 * number set in tabular figures by enough to run it off the frame. Every number
 * in this video is tabular, because a figure that changes width while it counts
 * up is worse than one that is slightly too big.
 */
const widestDigitWidth = (ctx: CanvasRenderingContext2D): number => {
  let widest = 0;
  for (const digit of '0123456789') {
    widest = Math.max(widest, ctx.measureText(digit).width);
  }
  return widest;
};

/**
 * Whether the face is actually available to measure against.
 *
 * `FontLoader` holds the first frame until the theme's faces have loaded, so in
 * practice this is always true by the time anything is fitted. It is checked
 * anyway, because the failure it guards against is silent: Chrome measures
 * whatever it fell back to, the number comes back looking perfectly reasonable,
 * and everything is mis-sized by however much the fallback differs.
 */
const isLoaded = (font: string): boolean => {
  try {
    return typeof document === 'undefined' || !document.fonts ? false : document.fonts.check(font);
  } catch {
    return false;
  }
};

/**
 * When there is nothing to measure, guess wide.
 *
 * The old estimate is right for about half the faces here and understates the
 * widest by 40%, and understating is the direction that runs type off the
 * frame. A fit that comes out slightly small is a slide nobody notices.
 */
const CAUTIOUS_ADVANCE = 0.78;

export const measureFor = (id: FontId, fallbackAdvance = ESTIMATED_ADVANCE): Measure => {
  const spec = FONTS[id];
  const perChar = spec.advance ?? fallbackAdvance;
  const estimate: Measure = (text) => text.length * perChar;
  const cautious: Measure = (text) => text.length * Math.max(perChar, CAUTIOUS_ADVANCE);

  const ctx = context();
  if (!ctx) return estimate;

  const tracking = trackingEm(spec.tracking);
  const stretch = stretchFactor(spec.stretch);
  const font = `${spec.weight} ${REFERENCE_PX}px ${fontStack(id)}`;

  return (text) => {
    if (text.length === 0) return 0;
    const shown = spec.uppercase ? text.toUpperCase() : text;

    ctx.font = font;
    if (!isLoaded(font)) return cautious(text);

    // Digits are measured as the widest digit, because that is what they will
    // be set as. Everything else is measured as itself.
    const digits = shown.replace(/\D/g, '').length;
    const rest = shown.replace(/\d/g, '');
    const raw = ctx.measureText(rest).width + digits * widestDigitWidth(ctx);

    const width = (raw / REFERENCE_PX) * stretch + shown.length * tracking;

    const average = width / shown.length;
    if (!Number.isFinite(width) || average < PLAUSIBLE.min || average > PLAUSIBLE.max) {
      return cautious(text);
    }
    return width;
  };
};

/** The fallback measurer, for tests and for anything without a canvas. */
export const estimatedMeasure =
  (advance = ESTIMATED_ADVANCE): Measure =>
  (text) =>
    text.length * advance;
