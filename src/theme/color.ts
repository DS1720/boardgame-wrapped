/**
 * Color math for themes.
 *
 * Themes are generated, not hand-picked, so contrast has to be something the
 * code can measure rather than something a designer eyeballed once. Everything
 * here is pure and works on plain numbers.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export const hslToRgb = ({ h, s, l }: Hsl): Rgb => {
  const sat = clamp(s, 0, 100) / 100;
  const lig = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
    : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c]
    : hp < 5 ? [x, 0, c]
    : [c, 0, x];
  const m = lig - c / 2;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
};

export const parseHex = (hex: string): Rgb | null => {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const raw = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  const n = parseInt(raw, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

export const toHex = ({ r, g, b }: Rgb): string =>
  `#${[r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')}`;

export const hsl = (h: number, s: number, l: number): string => toHex(hslToRgb({ h, s, l }));

export const rgbToHsl = ({ r, g, b }: Rgb): Hsl => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) return { h: 0, s: 0, l: l * 100 };

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / delta) % 6;
  else if (max === gn) h = (bn - rn) / delta + 2;
  else h = (rn - gn) / delta + 4;
  h *= 60;
  if (h < 0) h += 360;

  return { h, s: s * 100, l: l * 100 };
};

/* -------------------------------------------------------------------------- */
/* Contrast                                                                    */
/* -------------------------------------------------------------------------- */

const channelLuminance = (value: number): number => {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance. */
export const luminance = ({ r, g, b }: Rgb): number =>
  0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);

/** WCAG contrast ratio between two colors, 1:1 to 21:1. Accepts hex or Rgb. */
export const contrast = (a: string | Rgb, b: string | Rgb): number => {
  const rgbA = typeof a === 'string' ? parseHex(a) : a;
  const rgbB = typeof b === 'string' ? parseHex(b) : b;
  if (!rgbA || !rgbB) return 1;
  const lumA = luminance(rgbA);
  const lumB = luminance(rgbB);
  const light = Math.max(lumA, lumB);
  const dark = Math.min(lumA, lumB);
  return (light + 0.05) / (dark + 0.05);
};

/** True when the ground is dark enough that text on it should be light. */
export const isDark = (color: string): boolean => {
  const rgb = parseHex(color);
  return rgb ? luminance(rgb) < 0.18 : true;
};

/* -------------------------------------------------------------------------- */
/* Adjustment                                                                  */
/* -------------------------------------------------------------------------- */

/** Move a color's lightness by `delta` percentage points, keeping hue and saturation. */
export const lift = (color: string, delta: number): string => {
  const rgb = parseHex(color);
  if (!rgb) return color;
  const { h, s, l } = rgbToHsl(rgb);
  return hsl(h, s, clamp(l + delta, 0, 100));
};

export const withAlpha = (color: string, alpha: number): string => {
  const rgb = parseHex(color);
  if (!rgb) return color;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp(alpha, 0, 1)})`;
};

/**
 * Nudge a color's lightness until it clears `target` contrast against `against`,
 * or give up at the ends of the scale.
 *
 * The generated palettes in `random.ts` are derived from one hue by fixed
 * formulas, and a fixed formula cannot hold a contrast ratio across all 360
 * hues: a saturated blue at 58% lightness is far darker than a yellow at the
 * same lightness. Rather than abandon the formula, this walks the result the
 * minimum distance needed to make it legible.
 */
export const ensureContrast = (
  color: string,
  against: string,
  target: number,
  step = 2,
): string => {
  const rgb = parseHex(color);
  if (!rgb) return color;
  if (contrast(color, against) >= target) return color;

  // Move away from the background: lighten on a dark ground, darken on a light one.
  const direction = isDark(against) ? 1 : -1;
  const { h, s, l } = rgbToHsl(rgb);

  let best = color;
  let bestRatio = contrast(color, against);
  for (let i = 1; i <= 50; i += 1) {
    const next = hsl(h, s, clamp(l + direction * step * i, 0, 100));
    const ratio = contrast(next, against);
    if (ratio > bestRatio) {
      best = next;
      bestRatio = ratio;
    }
    if (ratio >= target) return next;
  }
  // Unreachable target (a mid-grey ground has no legible color at any
  // lightness): return the most legible option found rather than the original.
  return best;
};
