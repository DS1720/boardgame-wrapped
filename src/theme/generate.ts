/**
 * Generated themes: constrained random, and box-art derived.
 *
 * "Constrained randomness looks designed; free randomness never does." Both
 * generators here derive a whole palette from a single hue by fixed rules, so
 * the result is always a coherent scheme rather than six unrelated colors.
 */
import { contrast, ensureContrast, hsl, lift, rgbToHsl, parseHex, withAlpha } from './color';
import { BODY_FONTS, DISPLAY_FONTS, UTILITY_FONTS } from './fonts';
import { CONTRAST, type Theme, type ThemeColor, type ThemeMotion, type TextureId } from './types';

/**
 * Hues in this band are the muddy yellow-olives that read as a mistake rather
 * than a choice. The plan excludes them from random themes; box-art mode has to
 * respect them too, since a beige box would otherwise produce a beige theme.
 */
export const MUDDY_BAND = { from: 45, to: 65 } as const;

export const isMuddy = (hue: number): boolean => {
  const h = ((hue % 360) + 360) % 360;
  return h >= MUDDY_BAND.from && h <= MUDDY_BAND.to;
};

/** Push a hue out of the muddy band to whichever edge is nearer. */
export const avoidMuddy = (hue: number): number => {
  const h = ((hue % 360) + 360) % 360;
  if (!isMuddy(h)) return h;
  const mid = (MUDDY_BAND.from + MUDDY_BAND.to) / 2;
  return h < mid ? MUDDY_BAND.from - 1 : MUDDY_BAND.to + 1;
};

/** Pick a hue uniformly from the wheel minus the muddy band. */
export const randomHue = (rand: () => number = Math.random): number => {
  const span = 360 - (MUDDY_BAND.to - MUDDY_BAND.from + 1);
  const picked = Math.floor(rand() * span);
  return picked < MUDDY_BAND.from ? picked : picked + (MUDDY_BAND.to - MUDDY_BAND.from + 1);
};

/* -------------------------------------------------------------------------- */
/* Palette                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Derive the six color tokens from one hue, per the plan's formulas.
 *
 * The formulas alone do not hold the contrast floors: a saturated blue accent
 * at 58% lightness sits at 1.26:1 on a light ground, far under the 4.5:1 the
 * step's own test case demands. So each derived color is passed through
 * `ensureContrast`, which walks its lightness the minimum distance needed. The
 * hue and saturation — the part that makes the scheme feel designed — survive.
 */
export const paletteFromHue = (hue: number, dark: boolean): ThemeColor => {
  const h = avoidMuddy(hue);

  const bg = dark ? hsl(h, 10, 11) : hsl(h, 14, 95);
  const surface = lift(bg, dark ? 6 : -6);
  const ink = ensureContrast(dark ? hsl(h, 8, 96) : hsl(h, 20, 14), bg, CONTRAST.inkOnBg);
  const accent = ensureContrast(hsl(h, 72, 58), bg, CONTRAST.accentOnBg);
  const accentAlt = ensureContrast(hsl((h + 150) % 360, 62, 55), bg, CONTRAST.accentOnBg);

  return {
    bg,
    surface,
    ink,
    // Muted ink is the primary ink at 62% alpha, so it always belongs to the
    // same family as the text it sits beside.
    inkMuted: withAlpha(ink, 0.62),
    accent,
    accentAlt,
  };
};

/* -------------------------------------------------------------------------- */
/* Random themes                                                               */
/* -------------------------------------------------------------------------- */

const MOTION_PROFILES: ThemeMotion[] = [
  { stiffness: 180, damping: 22, stagger: 4 }, // snappy
  { stiffness: 120, damping: 18, stagger: 5 }, // balanced
  { stiffness: 90, damping: 20, stagger: 7 }, // heavy
  { stiffness: 200, damping: 26, stagger: 3 }, // mechanical
];

const TEXTURES: TextureId[] = ['none', 'grain', 'paper', 'lamp'];

const pick = <T,>(items: T[], rand: () => number): T => items[Math.floor(rand() * items.length)] ?? items[0];

export interface RandomThemeOptions {
  dark?: boolean;
  /** Injected in tests for reproducibility. */
  rand?: () => number;
}

/**
 * A random theme that still looks deliberate: one hue, derived palette,
 * a font trio drawn from the curated lists, and one of four motion profiles.
 */
export const randomTheme = ({ dark, rand = Math.random }: RandomThemeOptions = {}): Theme => {
  const hue = randomHue(rand);
  const isDarkMode = dark ?? rand() < 0.5;
  const color = paletteFromHue(hue, isDarkMode);

  return {
    id: `random-${Math.round(hue)}-${isDarkMode ? 'd' : 'l'}-${Math.floor(rand() * 1e6)}`,
    name: 'Random',
    color,
    type: {
      display: pick(DISPLAY_FONTS, rand).id,
      body: pick(BODY_FONTS, rand).id,
      utility: pick(UTILITY_FONTS, rand).id,
      scale: [28, 40, 92, 220],
    },
    motion: pick(MOTION_PROFILES, rand),
    texture: pick(TEXTURES, rand),
    signature: 'none',
  };
};

/* -------------------------------------------------------------------------- */
/* Box-art mode                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Recolor a theme around one box's dominant color.
 *
 * Step 6's fourth mode: every top-game slide becomes color-matched to its own
 * artwork. The accent comes from the box; the rest of the palette is derived by
 * the same rules as a random theme, so a cover cannot produce an illegible
 * slide however garish it is.
 *
 * Returns the base theme unchanged when the cover yielded no usable color —
 * a greyscale box has no hue to build on, and the theme's own accent is a
 * better answer than an invented one.
 */
export const themeFromBoxArt = (base: Theme, dominant: string | null | undefined): Theme => {
  if (!dominant) return base;
  const rgb = parseHex(dominant);
  if (!rgb) return base;

  const { h, s } = rgbToHsl(rgb);
  // A near-greyscale cover gives a hue that is essentially noise.
  if (s < 12) return base;

  const dark = contrast('#ffffff', base.color.bg) > contrast('#000000', base.color.bg);
  const color = paletteFromHue(h, dark);

  return {
    ...base,
    id: `${base.id}-boxart-${Math.round(h)}`,
    color: {
      ...color,
      // The box's own color is the point of this mode, so it wins the accent
      // slot — but only after being made legible on the derived ground.
      accent: ensureContrast(dominant, color.bg, CONTRAST.accentOnBg),
    },
  };
};

/* -------------------------------------------------------------------------- */
/* Per-player themes                                                           */
/* -------------------------------------------------------------------------- */

/**
 * A deterministic pseudo-random source.
 *
 * The batch renderer gives each player their own random theme, and "random"
 * there has to mean *fixed for that player* — re-running a batch must produce
 * the same videos, or a re-render after one failure would come back looking
 * like a different set.
 */
export const seededRandom = (seed: number): (() => number) => {
  // Mixed so that adjacent player ids do not produce adjacent hues; a plain
  // linear congruential generator seeded with 1, 2, 3 gives three near-identical
  // first draws, and the whole group would come out the same colour.
  let state = (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0) || 0x6d2b79f5;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    // xorshift the output so the low bits are not simply counting.
    let x = state;
    x ^= x >>> 15;
    x = Math.imul(x, 0x2545f491);
    x ^= x >>> 13;
    return (x >>> 0) / 2 ** 32;
  };
};

/**
 * The theme for one player in a batch.
 *
 * Seeded by player id, so the same person gets the same theme every time and
 * two people in the same batch get different ones.
 */
export const themeForPlayer = (playerId: number, options: { dark?: boolean } = {}): Theme => {
  const theme = randomTheme({ dark: options.dark, rand: seededRandom(playerId) });
  // The generated id carries a random tail, which would make the theme name in
  // a filename differ between runs. Pin it to the player instead.
  return { ...theme, id: `player-${playerId}`, name: `Random ${playerId}` };
};
