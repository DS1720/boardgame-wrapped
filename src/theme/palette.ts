/**
 * One palette per slide, so the ground changes at every cut.
 *
 * The video used to paint `theme.color.bg` once, above the `<Series>`, and hold
 * it for the whole minute — deliberately, so the cuts disappeared. That is the
 * opposite of what a Wrapped deck does: there, every card is its own colour and
 * the snap between them is the thing you recognise. This module is what makes
 * the ground a property of the slide rather than of the video.
 *
 * Everything here is pure. A slide still reads `useTheme()` and never learns
 * that its colours came from anywhere new — `Wrapped` wraps each sequence in a
 * provider carrying that slide's palette, so no slide component changes at all,
 * and the rule that a slide never names a colour survives untouched.
 */
import { contrast, ensureContrast, hsl, isDark, mix, parseHex, rgbToHsl } from './color';
import { CONTRAST, type Theme, type ThemeColor } from './types';

/**
 * The grounds a theme cycles through, in order.
 *
 * A theme may hand-specify them — the loud starter does, because its whole
 * point is six colours nobody would derive. Everything else derives its cycle
 * from the six tokens it already has, so a starter still looks like itself:
 * these are its own colours reused as grounds, not new ones invented for it.
 *
 * The first entry is always the theme's own `bg`, so the video opens as the
 * theme people picked and moves afterwards.
 */
export const groundCycle = (theme: Theme): string[] => {
  if (theme.grounds && theme.grounds.length > 0) return theme.grounds;

  const c = theme.color;
  return [
    c.bg,
    mix(c.bg, c.accent, 0.45),
    c.surface,
    mix(c.bg, c.accentAlt, 0.5),
    c.accent,
    mix(c.bg, c.ink, 0.14),
  ];
};

/**
 * Push a ground away from the middle until `ink` can be legible on it.
 *
 * A mid-tone ground has no legible text colour at any lightness — at L=50 both
 * white and black land near 4.5:1, under this project's 7:1 floor for ink — so
 * `ensureContrast` on the *text* cannot rescue one. The ground has to move.
 *
 * Direction is the ground's own polarity: a light ground gets lighter, a dark
 * one darker. Walking to either end of the scale reaches maximum contrast with
 * the opposite ink, so this always terminates on a ground that works.
 */
const legibleGround = (ground: string, ink: string, target: number): string => {
  const rgb = parseHex(ground);
  if (!rgb) return ground;
  if (contrast(ink, ground) >= target) return ground;

  const { h, s, l } = rgbToHsl(rgb);
  const direction = isDark(ground) ? -1 : 1;

  let best = ground;
  let bestRatio = contrast(ink, ground);
  for (let i = 1; i <= 50; i += 1) {
    const next = hsl(h, s, Math.min(100, Math.max(0, l + direction * 2 * i)));
    const ratio = contrast(ink, next);
    if (ratio > bestRatio) {
      best = next;
      bestRatio = ratio;
    }
    if (ratio >= target) return next;
  }
  return best;
};

/** Whichever of the theme's two poles reads better on this ground. */
const inkFor = (theme: Theme, ground: string): string =>
  contrast(theme.color.ink, ground) >= contrast(theme.color.bg, ground)
    ? theme.color.ink
    : theme.color.bg;

/**
 * A full six-token palette for one ground.
 *
 * Every token is re-derived rather than carried over, because a colour's job is
 * relative to what it sits on: the theme's ink is the right ink on the theme's
 * own ground and nowhere else. `ensureContrast` holds each one to the same bar
 * the generated themes are held to, so a per-slide ground can never produce a
 * card that fails what a whole theme would have to pass.
 */
export const paletteForGround = (theme: Theme, candidate: string): ThemeColor => {
  const firstInk = inkFor(theme, candidate);
  const bg = legibleGround(candidate, firstInk, CONTRAST.inkOnBg);
  const ink = ensureContrast(inkFor(theme, bg), bg, CONTRAST.inkOnBg);

  // Muted is ink walked back toward the ground, then held to a floor: secondary
  // text is meant to recede, not to become unreadable at caption size.
  const inkMuted = ensureContrast(mix(ink, bg, 0.42), bg, 3);

  // The accent is whichever of the theme's two highlights survives this ground
  // best. Large-text is the right bar: an accent is only ever set at the
  // display step.
  const [strong, weak] =
    contrast(theme.color.accent, bg) >= contrast(theme.color.accentAlt, bg)
      ? [theme.color.accent, theme.color.accentAlt]
      : [theme.color.accentAlt, theme.color.accent];

  /*
    When neither highlight clears the bar, the ground *is* the loud colour — and
    a card whose ground is already shouting cannot also shout in its numbers.

    Walking the highlight's own lightness until it clears keeps the hue and
    loses the colour: a neon lime dragged down far enough to sit on hot pink is
    olive, which is nobody's idea of neon. So the number takes the ink instead,
    with a trace of the highlight mixed back in so the theme still leaves a
    fingerprint on the card. Ink already clears 7:1 here, so this always has
    room to spare against a 3:1 bar.
  */
  const accent =
    contrast(strong, bg) >= CONTRAST.accentOnBgLarge ? strong : mix(ink, strong, 0.12);

  return {
    bg,
    // A plate is the ground moved a little toward its ink, which is the right
    // direction in both modes — lighter on a dark card, darker on a light one.
    surface: mix(bg, ink, 0.09),
    ink,
    inkMuted,
    accent: ensureContrast(accent, bg, CONTRAST.accentOnBgLarge),
    // Decorative only, exactly as in the starters: rules, marks and fills. It
    // still has to be *visible*, which is all this floor asks.
    accentAlt: ensureContrast(weak, bg, 1.8),
  };
};

/**
 * `count` palettes, one per slide, cycling through the theme's grounds.
 *
 * Deterministic and index-based: the same cut always produces the same colours,
 * which is the same promise the rest of the video makes.
 */
export const slidePalettes = (theme: Theme, count: number): ThemeColor[] => {
  const grounds = groundCycle(theme);
  return Array.from({ length: Math.max(0, count) }, (_, i) =>
    paletteForGround(theme, grounds[i % grounds.length]),
  );
};

/**
 * One palette part way to another, token by token.
 *
 * The cut used to be a hard snap, on the argument that the snap *is* the
 * effect. It read as harsh rather than as punchy, so the ground now travels
 * between two cards over a few frames instead.
 *
 * Every token moves together, not just the ground. Fading a ground under text
 * that had already jumped to its new colour would put the text at whatever
 * contrast the halfway mix happened to give; moving the pair keeps them in the
 * relationship they were derived in. It is still an interpolation between two
 * legible palettes rather than a guarantee about the middle, which is why the
 * slide's own content fades in across the same handful of frames — the ground
 * is settled before there is anything on it to read.
 */
export const blendPalettes = (from: ThemeColor, to: ThemeColor, t: number): ThemeColor => {
  if (t <= 0) return from;
  if (t >= 1) return to;
  return {
    bg: mix(from.bg, to.bg, t),
    surface: mix(from.surface, to.surface, t),
    ink: mix(from.ink, to.ink, t),
    inkMuted: mix(from.inkMuted, to.inkMuted, t),
    accent: mix(from.accent, to.accent, t),
    accentAlt: mix(from.accentAlt, to.accentAlt, t),
  };
};
