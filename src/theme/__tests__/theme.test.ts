import { describe, expect, it } from 'vitest';
import { contrast, ensureContrast, hsl, hslToRgb, lift, luminance, parseHex, rgbToHsl, toHex, withAlpha } from '../color';
import { avoidMuddy, isMuddy, MUDDY_BAND, paletteFromHue, randomHue, randomTheme, themeFromBoxArt } from '../generate';
import { BODY_FONTS, DISPLAY_FONTS, FONTS, fontStack, fontStyle, UTILITY_FONTS, uniqueFontSpecs } from '../fonts';
import { STARTERS } from '../starters';
import { clearTheme, isValidTheme, loadTheme, saveTheme } from '../persist';
import { COUNT_SIGNATURES, CONTRAST, type Theme } from '../types';

/** A Storage that lives in memory, so persistence can be tested without a DOM. */
const memoryStorage = (): Storage => {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage;
};

/** A deterministic stand-in for Math.random, so a failing theme can be reproduced. */
const seeded = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
};

describe('color math', () => {
  it('round-trips hex and rgb', () => {
    expect(parseHex('#e75f2b')).toEqual({ r: 231, g: 95, b: 43 });
    expect(parseHex('e75f2b')).toEqual({ r: 231, g: 95, b: 43 });
    expect(parseHex('#abc')).toEqual({ r: 170, g: 187, b: 204 });
    expect(toHex({ r: 231, g: 95, b: 43 })).toBe('#e75f2b');
    expect(parseHex('nonsense')).toBeNull();
  });

  it('round-trips hsl and rgb', () => {
    for (const h of [0, 40, 120, 217, 300, 359]) {
      const rgb = hslToRgb({ h, s: 60, l: 50 });
      const back = rgbToHsl(rgb);
      expect(back.h).toBeCloseTo(h, 0);
      expect(back.s).toBeCloseTo(60, 0);
      expect(back.l).toBeCloseTo(50, 0);
    }
  });

  it('computes WCAG contrast against known pairs', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 3);
    // Long-established reference value for mid grey on white.
    expect(contrast('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('orders luminance the way brightness does', () => {
    expect(luminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0);
    expect(luminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1);
    expect(luminance({ r: 0, g: 255, b: 0 })).toBeGreaterThan(luminance({ r: 255, g: 0, b: 0 }));
  });

  it('lifts lightness without changing hue', () => {
    const lifted = lift('#2b4c7e', 20);
    expect(rgbToHsl(parseHex(lifted)!).h).toBeCloseTo(rgbToHsl(parseHex('#2b4c7e')!).h, 0);
    expect(rgbToHsl(parseHex(lifted)!).l).toBeGreaterThan(rgbToHsl(parseHex('#2b4c7e')!).l);
  });

  it('clamps rather than wrapping at the ends of the lightness scale', () => {
    expect(lift('#ffffff', 40)).toBe('#ffffff');
    expect(lift('#000000', -40)).toBe('#000000');
  });

  it('expresses alpha in a form CSS accepts', () => {
    expect(withAlpha('#e75f2b', 0.62)).toBe('rgba(231, 95, 43, 0.62)');
  });
});

describe('ensureContrast', () => {
  it('leaves a color alone when it already passes', () => {
    expect(ensureContrast('#ffffff', '#000000', 7)).toBe('#ffffff');
  });

  it('lightens on a dark ground and darkens on a light one', () => {
    const onDark = ensureContrast('#404040', '#0e1512', 4.5);
    const onLight = ensureContrast('#c0c0c0', '#ffffff', 4.5);
    expect(contrast(onDark, '#0e1512')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(onLight, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the hue it was given', () => {
    const before = rgbToHsl(parseHex('#2b4c7e')!).h;
    const after = rgbToHsl(parseHex(ensureContrast('#2b4c7e', '#0e1512', 7))!).h;
    expect(after).toBeCloseTo(before, 0);
  });

  it('returns its best effort rather than failing on an impossible target', () => {
    // Nothing reaches 21:1 against mid grey; the result must still be a color.
    const result = ensureContrast('#808080', '#808080', 21);
    expect(parseHex(result)).not.toBeNull();
  });
});

describe('the muddy band', () => {
  it('knows which hues are muddy', () => {
    expect(isMuddy(55)).toBe(true);
    expect(isMuddy(MUDDY_BAND.from)).toBe(true);
    expect(isMuddy(MUDDY_BAND.to)).toBe(true);
    expect(isMuddy(44)).toBe(false);
    expect(isMuddy(66)).toBe(false);
  });

  it('pushes a muddy hue to the nearer edge', () => {
    expect(avoidMuddy(46)).toBe(MUDDY_BAND.from - 1);
    expect(avoidMuddy(64)).toBe(MUDDY_BAND.to + 1);
    expect(avoidMuddy(200)).toBe(200);
  });

  it('never draws a muddy hue at random', () => {
    const rand = seeded(7);
    for (let i = 0; i < 2000; i += 1) {
      expect(isMuddy(randomHue(rand))).toBe(false);
    }
  });
});

describe('random themes', () => {
  // Step 6, test case 3.
  it('produces 50 consecutive themes that all clear the contrast floors', () => {
    const rand = seeded(42);
    for (let i = 0; i < 50; i += 1) {
      const theme = randomTheme({ rand });
      const { ink, bg, accent } = theme.color;
      expect(contrast(ink, bg)).toBeGreaterThanOrEqual(CONTRAST.inkOnBg);
      expect(contrast(accent, bg)).toBeGreaterThanOrEqual(CONTRAST.accentOnBg);
    }
  });

  it('clears the floors across the whole hue wheel, in both modes', () => {
    // The formulas alone fail this badly, which is why paletteFromHue guards
    // every derived color. Sweeping every hue is what keeps that honest.
    for (let hue = 0; hue < 360; hue += 1) {
      for (const dark of [true, false]) {
        const { ink, bg, accent, accentAlt } = paletteFromHue(hue, dark);
        expect(contrast(ink, bg)).toBeGreaterThanOrEqual(CONTRAST.inkOnBg);
        expect(contrast(accent, bg)).toBeGreaterThanOrEqual(CONTRAST.accentOnBg);
        expect(contrast(accentAlt, bg)).toBeGreaterThanOrEqual(CONTRAST.accentOnBg);
      }
    }
  });

  it('derives a palette that belongs together', () => {
    const { bg, surface } = paletteFromHue(217, true);
    // Surface is the ground lifted, not an unrelated color.
    expect(rgbToHsl(parseHex(surface)!).h).toBeCloseTo(rgbToHsl(parseHex(bg)!).h, 0);
    expect(rgbToHsl(parseHex(surface)!).l).toBeGreaterThan(rgbToHsl(parseHex(bg)!).l);
  });

  it('puts accentAlt opposite the accent on the wheel', () => {
    const { accent, accentAlt } = paletteFromHue(200, true);
    const gap = Math.abs(rgbToHsl(parseHex(accent)!).h - rgbToHsl(parseHex(accentAlt)!).h);
    expect(Math.min(gap, 360 - gap)).toBeGreaterThan(100);
  });

  it('picks fonts only from the curated lists', () => {
    const rand = seeded(11);
    for (let i = 0; i < 50; i += 1) {
      const { type } = randomTheme({ rand });
      expect(DISPLAY_FONTS.map((f) => f.id)).toContain(type.display);
      expect(BODY_FONTS.map((f) => f.id)).toContain(type.body);
      expect(UTILITY_FONTS.map((f) => f.id)).toContain(type.utility);
    }
  });

  it('is reproducible from a seed', () => {
    expect(randomTheme({ rand: seeded(5) })).toEqual(randomTheme({ rand: seeded(5) }));
  });
});

describe('starter themes', () => {
  it('set body text at a ratio that reads', () => {
    for (const theme of STARTERS) {
      expect(contrast(theme.color.ink, theme.color.bg)).toBeGreaterThanOrEqual(CONTRAST.inkOnBg);
      expect(contrast(theme.color.ink, theme.color.surface)).toBeGreaterThanOrEqual(CONTRAST.inkOnBg);
    }
  });

  it('set accents at the large-text threshold, which is what they are used at', () => {
    // The starters are hand-picked from the plan, not generated. Punchboard's
    // printer's blue is 3.85:1 on chipboard — right for a 220px number, and
    // deliberately not held to the 4.5:1 body-text bar the generators use.
    for (const theme of STARTERS) {
      expect(contrast(theme.color.accent, theme.color.bg)).toBeGreaterThanOrEqual(
        CONTRAST.accentOnBgLarge,
      );
    }
  });

  it('can make a decorative accentAlt legible when a slide needs type in it', () => {
    // accentAlt is for rules and marks; two of the three are under 3:1 as text.
    // The escape hatch has to exist and has to work for all of them.
    for (const theme of STARTERS) {
      const readable = ensureContrast(theme.color.accentAlt, theme.color.bg, CONTRAST.accentOnBg);
      expect(contrast(readable, theme.color.bg)).toBeGreaterThanOrEqual(CONTRAST.accentOnBg);
    }
  });

  it('are genuinely different from one another', () => {
    // The set is done when they look like as many studios' work, so no two may
    // share a ground, a display face or a signature.
    expect(new Set(STARTERS.map((t) => t.color.bg)).size).toBe(STARTERS.length);
    expect(new Set(STARTERS.map((t) => t.type.display)).size).toBe(STARTERS.length);
    expect(new Set(STARTERS.map((t) => t.signature)).size).toBe(STARTERS.length);
  });

  it('never leave a signature declared but unused', () => {
    // The dispatch in src/video/signature falls through to null, so a counting
    // signature nobody uses would be dead code that looks wired up. Every one
    // of them has to belong to a theme.
    const used = new Set(STARTERS.map((t) => t.signature));
    for (const signature of COUNT_SIGNATURES) {
      expect(used.has(signature)).toBe(true);
    }
  });

  it('give every theme a signature, because that is what makes it one', () => {
    for (const theme of STARTERS) {
      expect(theme.signature).not.toBe('none');
    }
  });

  it('name fonts that exist in the registry', () => {
    for (const theme of STARTERS) {
      expect(FONTS[theme.type.display].role).toBe('display');
      expect(FONTS[theme.type.body].role).toBe('body');
      expect(FONTS[theme.type.utility].role).toBe('utility');
    }
  });

  it('use exactly four type sizes, ascending', () => {
    for (const theme of STARTERS) {
      expect(theme.type.scale).toHaveLength(4);
      const sorted = [...theme.type.scale].sort((a, b) => a - b);
      expect(theme.type.scale).toEqual(sorted);
    }
  });
});

describe('box-art mode', () => {
  const base = STARTERS[2]; // Table Light

  // Step 6, test case 5: the real top five for Tina in 2026.
  const TOP_FIVE = ['#e75f2b', '#3f7cac', '#c8b273', '#8e4a68', '#2f9e6b'];

  it('gives each of the top five games its own accent', () => {
    const accents = TOP_FIVE.map((dominant) => themeFromBoxArt(base, dominant).color.accent);
    expect(new Set(accents).size).toBe(TOP_FIVE.length);
  });

  it('keeps every derived theme legible', () => {
    for (const dominant of TOP_FIVE) {
      const theme = themeFromBoxArt(base, dominant);
      expect(contrast(theme.color.accent, theme.color.bg)).toBeGreaterThanOrEqual(CONTRAST.accentOnBg);
      expect(contrast(theme.color.ink, theme.color.bg)).toBeGreaterThanOrEqual(CONTRAST.inkOnBg);
    }
  });

  it('falls back to the base theme when the cover gives nothing to work with', () => {
    expect(themeFromBoxArt(base, null)).toBe(base);
    expect(themeFromBoxArt(base, 'not a color')).toBe(base);
    // A near-greyscale cover has a hue that is essentially noise.
    expect(themeFromBoxArt(base, '#807f81')).toBe(base);
  });

  it('keeps the base theme fonts and motion', () => {
    const derived = themeFromBoxArt(base, '#e75f2b');
    expect(derived.type).toEqual(base.type);
    expect(derived.motion).toEqual(base.motion);
  });
});

describe('fonts', () => {
  it('quotes the family and keeps a fallback stack', () => {
    expect(fontStack('familjen')).toBe('"Familjen Grotesk", ui-sans-serif, system-ui, sans-serif');
  });

  it('carries the parts of a choice a family name cannot express', () => {
    // "Archivo Condensed" is Archivo at 75% width — the width is the choice.
    expect(fontStyle('archivo-condensed').fontStretch).toBe('75%');
    expect(fontStyle('inter-tracked').textTransform).toBe('uppercase');
    expect(fontStyle('inter-tracked').letterSpacing).toBe('0.16em');
    expect(fontStyle('inter').textTransform).toBeUndefined();
  });

  it('offers the curated counts the plan asks for', () => {
    expect(DISPLAY_FONTS).toHaveLength(6);
    expect(BODY_FONTS).toHaveLength(4);
    expect(UTILITY_FONTS).toHaveLength(3);
  });

  it('does not mirror the same family twice', () => {
    const specs = uniqueFontSpecs().map((s) => s.googleSpec);
    expect(new Set(specs).size).toBe(specs.length);
    // Inter serves both a body and a utility choice.
    expect(specs.length).toBeLessThan(Object.keys(FONTS).length);
  });
});

describe('persistence', () => {
  const custom: Theme = {
    ...STARTERS[0],
    id: 'custom-1',
    name: 'Mine',
    color: { ...STARTERS[0].color, accent: '#123456' },
  };

  // Step 6, test case 4.
  it('survives a reload', () => {
    const storage = memoryStorage();
    saveTheme({ mode: 'custom', theme: custom }, storage);

    const loaded = loadTheme(storage);
    expect(loaded?.mode).toBe('custom');
    expect(loaded?.theme.color.accent).toBe('#123456');
    expect(loaded?.theme.name).toBe('Mine');
  });

  it('re-reads a starter from code rather than the stored copy', () => {
    const storage = memoryStorage();
    const stale = { ...STARTERS[0], color: { ...STARTERS[0].color, bg: '#000000' } };
    saveTheme({ mode: 'starter', theme: stale }, storage);
    // A palette fix in code has to reach someone who selected it months ago.
    expect(loadTheme(storage)?.theme.color.bg).toBe(STARTERS[0].color.bg);
  });

  it('returns null rather than a broken theme', () => {
    const storage = memoryStorage();
    expect(loadTheme(storage)).toBeNull();

    storage.setItem('bgw:theme', 'not json');
    expect(loadTheme(storage)).toBeNull();

    storage.setItem('bgw:theme', JSON.stringify({ mode: 'custom', theme: { id: 'x' } }));
    expect(loadTheme(storage)).toBeNull();
  });

  it('rejects a theme missing a token added after it was saved', () => {
    const { accentAlt, ...missing } = custom.color;
    expect(isValidTheme({ ...custom, color: missing })).toBe(false);
    expect(isValidTheme({ ...custom, type: { ...custom.type, scale: [1, 2, 3] } })).toBe(false);
    expect(isValidTheme(custom)).toBe(true);
  });

  it('clears', () => {
    const storage = memoryStorage();
    saveTheme({ mode: 'custom', theme: custom }, storage);
    clearTheme(storage);
    expect(loadTheme(storage)).toBeNull();
  });

  it('survives a storage that throws', () => {
    const hostile = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    } as unknown as Storage;
    // Private browsing must not take the app down with it.
    expect(() => saveTheme({ mode: 'custom', theme: custom }, hostile)).not.toThrow();
    expect(loadTheme(hostile)).toBeNull();
    expect(() => clearTheme(hostile)).not.toThrow();
  });
});

describe('generated hsl strings', () => {
  it('produces valid hex', () => {
    expect(hsl(217, 72, 58)).toMatch(/^#[0-9a-f]{6}$/);
    expect(hsl(-40, 200, -10)).toMatch(/^#[0-9a-f]{6}$/);
  });
});
