import { describe, expect, it } from 'vitest';
import { formatNumber, formatPercent } from '@/shared/format';
import { STARTERS } from '@/theme/starters';
import { VIDEO } from '../config';
import { fitText, MIN_HEADLINE_PX } from '../slides/layout';

/** The width a headline actually has to live in. */
const SAFE_WIDTH = VIDEO.width - VIDEO.safeMargin * 2;

/** Same estimate the fitter uses, so the assertions measure the same thing. */
const CHAR_WIDTH = 0.56;
const widthOf = (text: string, size: number) => text.length * CHAR_WIDTH * size;
const longestWordWidth = (text: string, size: number) =>
  text.split(/\s+/).reduce((max, w) => Math.max(max, w.length), 0) * CHAR_WIDTH * size;

// The real export, not the plan's example — these are worse.
const LONGEST_PLAYER = 'markus Spielewochenende ';
const LONGEST_GAME = 'Humbug: das zweifelhafte Kartenspiel – Original Edition 1';
const LONGEST_LOCATION = 'Lerchenfelder Straße (Lukas Weinsberger)';

describe('fitText', () => {
  // Step 7, test case 1.
  it('keeps the longest names in the dataset inside the safe area', () => {
    for (const name of [LONGEST_PLAYER, LONGEST_GAME, LONGEST_LOCATION, 'Sarah Schelmbauer']) {
      for (const theme of STARTERS) {
        const size = fitText(name, theme.type.scale[2], 2);
        // Two lines of budget for the whole string...
        expect(widthOf(name, size)).toBeLessThanOrEqual(SAFE_WIDTH * 2 + 1);
        // ...and no single word may exceed one line, since wrapping cannot help it.
        expect(longestWordWidth(name, size)).toBeLessThanOrEqual(SAFE_WIDTH + 1);
      }
    }
  });

  it('leaves a one-character name at full size', () => {
    for (const theme of STARTERS) {
      const headline = theme.type.scale[2];
      expect(fitText('X', headline, 2)).toBe(headline);
    }
  });

  it('never returns more than the theme asked for', () => {
    // The fitter shrinks; it must never inflate type past the scale.
    for (const theme of STARTERS) {
      const headline = theme.type.scale[2];
      for (const name of ['A', 'Tina', 'Sarah Schelmbauer', LONGEST_GAME]) {
        expect(fitText(name, headline, 2)).toBeLessThanOrEqual(headline);
      }
    }
  });

  it('shrinks monotonically as names get longer', () => {
    const base = STARTERS[0].type.scale[2];
    const sizes = ['A', 'Tina', 'Sarah Schelmbauer', LONGEST_GAME].map((n) => fitText(n, base, 2));
    for (let i = 1; i < sizes.length; i += 1) {
      expect(sizes[i]).toBeLessThanOrEqual(sizes[i - 1]);
    }
  });

  it('stops at the legibility floor rather than vanishing', () => {
    expect(fitText('x'.repeat(500), 200, 2)).toBe(MIN_HEADLINE_PX);
    expect(fitText(LONGEST_GAME, 200, 2)).toBeGreaterThanOrEqual(MIN_HEADLINE_PX);
  });

  it('gives a single line less room than two', () => {
    expect(fitText(LONGEST_PLAYER, 200, 1)).toBeLessThanOrEqual(fitText(LONGEST_PLAYER, 200, 2));
  });

  it('handles an empty string without producing a nonsense size', () => {
    const size = fitText('', 200, 2);
    expect(Number.isFinite(size)).toBe(true);
    expect(size).toBeGreaterThan(0);
  });
});

describe('number formatting', () => {
  // Step 7, test case 3.
  it('separates thousands', () => {
    expect(formatNumber(1000)).not.toBe('1000');
    expect(formatNumber(1000)).toMatch(/1[.,\s ]000/);
    expect(formatNumber(12345)).toMatch(/12[.,\s ]345/);
  });

  it('leaves numbers under a thousand alone', () => {
    expect(formatNumber(233)).toBe('233');
    expect(formatNumber(0)).toBe('0');
  });

  it('rounds percentages to whole numbers', () => {
    expect(formatPercent(61 / 222)).toBe('27%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(1)).toBe('100%');
  });
});

describe('the type scale', () => {
  it('offers exactly four sizes', () => {
    // "Type scale from the theme, four sizes only" — if a fifth appeared here,
    // slides would start inventing their own.
    for (const theme of STARTERS) {
      expect(theme.type.scale).toHaveLength(4);
    }
  });

  it('keeps the display size inside the frame for a three-digit number', () => {
    for (const theme of STARTERS) {
      const display = theme.type.scale[3];
      // "233" at the display size, with tabular figures roughly 0.6em wide.
      expect(3 * display * 0.6).toBeLessThanOrEqual(SAFE_WIDTH);
    }
  });
});
