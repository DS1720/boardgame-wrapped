import { describe, expect, it } from 'vitest';
import { contrast } from '../color';
import { randomTheme, themeForPlayer } from '../generate';
import { blendPalettes, groundCycle, paletteForGround, slidePalettes } from '../palette';
import { neonNight, STARTERS } from '../starters';
import { CONTRAST, type Theme } from '../types';

/**
 * The per-slide ground is the one change that could quietly make the video
 * illegible: it recolours every token on every card, and nothing about a
 * hand-checked starter palette says anything about the five other grounds
 * derived from it. So the bar is the same one a whole theme has to clear, and
 * it is checked on every ground of every theme rather than on a sample.
 */

const everyTheme = (): Theme[] => [
  ...STARTERS,
  randomTheme({ dark: true }),
  randomTheme({ dark: false }),
  // The batch path: a fixed theme per player, so these are real outputs too.
  themeForPlayer(1),
  themeForPlayer(42),
  themeForPlayer(93),
];

describe('a palette derived for a ground', () => {
  it('keeps ink legible on every ground of every theme', () => {
    for (const theme of everyTheme()) {
      for (const ground of groundCycle(theme)) {
        const palette = paletteForGround(theme, ground);
        expect(contrast(palette.ink, palette.bg)).toBeGreaterThanOrEqual(CONTRAST.inkOnBg);
      }
    }
  });

  it('keeps the accent legible at display size on every ground', () => {
    for (const theme of everyTheme()) {
      for (const ground of groundCycle(theme)) {
        const palette = paletteForGround(theme, ground);
        expect(contrast(palette.accent, palette.bg)).toBeGreaterThanOrEqual(
          CONTRAST.accentOnBgLarge,
        );
      }
    }
  });

  it('keeps muted text readable rather than merely present', () => {
    for (const theme of everyTheme()) {
      for (const ground of groundCycle(theme)) {
        const palette = paletteForGround(theme, ground);
        expect(contrast(palette.inkMuted, palette.bg)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('keeps a plate distinguishable from the ground it sits on', () => {
    for (const theme of everyTheme()) {
      for (const ground of groundCycle(theme)) {
        const palette = paletteForGround(theme, ground);
        expect(palette.surface).not.toBe(palette.bg);
      }
    }
  });

  // A mid-tone ground has no legible text colour at any lightness, so the
  // ground itself has to move. This is the case that proves it does.
  it('walks a mid grey off the middle rather than accepting it', () => {
    const palette = paletteForGround(STARTERS[0], '#808080');
    expect(palette.bg).not.toBe('#808080');
    expect(contrast(palette.ink, palette.bg)).toBeGreaterThanOrEqual(CONTRAST.inkOnBg);
  });
});

describe('the ground cycle', () => {
  it('opens on the theme people actually picked', () => {
    for (const theme of everyTheme()) {
      expect(groundCycle(theme)[0]).toBe(theme.color.bg);
      expect(slidePalettes(theme, 1)[0].bg).toBe(theme.color.bg);
    }
  });

  it('uses a theme’s own grounds verbatim when it states them', () => {
    expect(groundCycle(neonNight)).toEqual(neonNight.grounds);
  });

  it('derives a cycle for a theme that states none', () => {
    expect(STARTERS[0].grounds).toBeUndefined();
    expect(groundCycle(STARTERS[0])).toHaveLength(6);
  });

  it('gives neighbouring slides different grounds', () => {
    for (const theme of everyTheme()) {
      const palettes = slidePalettes(theme, 11);
      for (let i = 1; i < palettes.length; i += 1) {
        expect(palettes[i].bg).not.toBe(palettes[i - 1].bg);
      }
    }
  });

  it('cycles rather than running out', () => {
    const palettes = slidePalettes(neonNight, 14);
    expect(palettes).toHaveLength(14);
    expect(palettes[6].bg).toBe(palettes[0].bg);
    expect(palettes[13].bg).toBe(palettes[1].bg);
  });

  // Same promise the rest of the video makes: one input, one output.
  it('is deterministic', () => {
    expect(slidePalettes(neonNight, 11)).toEqual(slidePalettes(neonNight, 11));
    expect(slidePalettes(STARTERS[3], 11)).toEqual(slidePalettes(STARTERS[3], 11));
  });

  it('answers an empty video with no palettes', () => {
    expect(slidePalettes(STARTERS[0], 0)).toEqual([]);
  });
});

describe('blending one card into the next', () => {
  const a = paletteForGround(neonNight, neonNight.grounds![0]);
  const b = paletteForGround(neonNight, neonNight.grounds![1]);

  it('is each end exactly at each end', () => {
    expect(blendPalettes(a, b, 0)).toEqual(a);
    expect(blendPalettes(a, b, 1)).toEqual(b);
    // Clamped, so a frame outside the window cannot invent a colour.
    expect(blendPalettes(a, b, -0.5)).toEqual(a);
    expect(blendPalettes(a, b, 2)).toEqual(b);
  });

  it('moves every token, not just the ground', () => {
    const mid = blendPalettes(a, b, 0.5);
    for (const key of ['bg', 'surface', 'ink', 'inkMuted', 'accent', 'accentAlt'] as const) {
      expect(mid[key]).not.toBe(a[key]);
      expect(mid[key]).not.toBe(b[key]);
    }
  });

  // Ink and ground travel together rather than one jumping ahead of the other.
  // The middle is not held to the contrast floor — it is a sixth of a second
  // and the slide's own content is still fading in over it — but a blend that
  // inverted them would be a different thing entirely.
  it('keeps ink on the same side of the ground throughout', () => {
    const inkIsLighter = (p: { ink: string; bg: string }) =>
      contrast(p.ink, '#ffffff') < contrast(p.bg, '#ffffff');
    const ends = inkIsLighter(a);
    if (ends === inkIsLighter(b)) {
      for (const t of [0.25, 0.5, 0.75]) {
        expect(inkIsLighter(blendPalettes(a, b, t))).toBe(ends);
      }
    }
  });
});
