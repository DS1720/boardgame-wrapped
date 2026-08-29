import { describe, expect, it } from 'vitest';
import { formatNumber, formatPercent } from '@/shared/format';
import { STARTERS } from '@/theme/starters';
import { VIDEO } from '../config';
import {
  fitBlock,
  fitDisplay,
  fitLabel,
  fitText,
  HEADLINE_LINE_HEIGHT,
  LABEL_SCALE,
  MIN_DISPLAY_NUMBER_PX,
  MIN_HEADLINE_PX,
} from '../slides/layout';

/** The width a headline actually has to live in. */
const SAFE_WIDTH = VIDEO.width - VIDEO.safeMargin * 2;

describe('fitDisplay', () => {
  // The largest of the three starters, and so the one that overflows first.
  const DISPLAY = 310;

  it('leaves a short number at the full display size', () => {
    for (const value of [7, 61, 233]) {
      expect(fitDisplay(formatNumber(value), DISPLAY)).toBe(DISPLAY);
    }
  });

  it('shrinks a six-figure score until it fits the frame', () => {
    // The real case: 66 000 in La Cosa Nostra ran off the right edge, and a
    // score over 100 000 ran further.
    const text = formatNumber(123456);
    const size = fitDisplay(text, DISPLAY);
    expect(size).toBeLessThan(DISPLAY);
    expect(text.length * 0.56 * size).toBeLessThanOrEqual(SAFE_WIDTH + 0.001);
  });

  it('keeps every plausible score inside the safe width', () => {
    for (const value of [9, 99, 999, 9999, 99999, 999999, 9999999]) {
      const text = formatNumber(value);
      const size = fitDisplay(text, DISPLAY);
      expect(text.length * 0.56 * size).toBeLessThanOrEqual(SAFE_WIDTH + 0.001);
    }
  });

  it('never shrinks below the floor that keeps it a display number', () => {
    expect(fitDisplay('9'.repeat(60), DISPLAY)).toBe(MIN_DISPLAY_NUMBER_PX);
  });

  it('never grows a number past the theme’s own step', () => {
    expect(fitDisplay('1', 200)).toBe(200);
  });
});

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

/* -------------------------------------------------------------------------- */

/** Same estimate the label fitter uses, tracking and uppercase included. */
const LABEL_CHAR_WIDTH = 0.78;

/** Every label a slide sets, longest first. */
const LABELS = [
  'You share the record in',
  'You hold the record in',
  'Where you played most',
  'Most games start at',
  'Longest win streak',
  'Learned this year',
  'The year in five',
  'Played most with',
  'Best winning score',
  'Most played',
  'Busiest day',
  'Played with',
  'Win rate',
  'Co-op record',
  'Most of it on',
  'Nemesis',
  'Then',
];

describe('fitLabel', () => {
  // The point of the change: a heading that says what the number is has to be
  // read before the number, and at the caption step it was not.
  it('sets a label well above the caption step', () => {
    for (const theme of STARTERS) {
      const caption = theme.type.scale[0];
      expect(fitLabel('Win rate', caption)).toBeGreaterThan(caption * 1.4);
    }
  });

  it('gives a short label the full label size', () => {
    for (const theme of STARTERS) {
      const caption = theme.type.scale[0];
      expect(fitLabel('Most played', caption)).toBe(caption * LABEL_SCALE);
    }
  });

  // Nothing in the video is long enough to be forced down to the floor, so
  // every real label fits on one line — which is what keeps the number under it
  // in the same place from slide to slide.
  it('keeps every label the video sets on one line inside the safe width', () => {
    for (const theme of STARTERS) {
      const caption = theme.type.scale[0];
      for (const label of LABELS) {
        const size = fitLabel(label, caption);
        expect(size).toBeGreaterThan(caption * 1.4);
        expect(label.length * LABEL_CHAR_WIDTH * size).toBeLessThanOrEqual(SAFE_WIDTH + 0.001);
      }
    }
  });

  it('shrinks a label that would overrun rather than wrapping it', () => {
    // Longer than anything the video sets, and short enough to be solved by
    // shrinking rather than by hitting the floor.
    const long = 'You hold the record in six games';
    const size = fitLabel(long, 30);
    expect(size).toBeLessThan(30 * LABEL_SCALE);
    expect(size).toBeGreaterThan(30);
    expect(long.length * LABEL_CHAR_WIDTH * size).toBeLessThanOrEqual(SAFE_WIDTH + 0.001);
  });

  // The floor is the old size, so making labels bigger cannot make one smaller.
  it('never goes below the caption step', () => {
    expect(fitLabel('x'.repeat(400), 30)).toBe(30);
  });
});

/* -------------------------------------------------------------------------- */

describe('fitBlock', () => {
  /** The advance of the widest display face, which is where this bit first. */
  const WIDE = 0.72;

  it('is what fitText is, when nothing constrains the height', () => {
    for (const text of ['Tina', 'Flip 7', LONGEST_GAME, 'Sarah Schelmbauer']) {
      expect(fitBlock({ text, ceiling: 300, maxLines: 2 })).toBe(fitText(text, 300, 2));
    }
  });

  /*
    The case that broke the most-played slide.

    "Flip 7" is six characters over two words, so a width fitter is delighted to
    set it at nearly 300px across two lines — and two lines at 300px is 600px of
    frame, on a slide that has already spent 740 of it on a cover. Given a
    height budget it takes one line at a smaller size instead.
  */
  it('prefers one smaller line to two that do not fit the height', () => {
    const budget = 300;
    const size = fitBlock({
      text: 'Flip 7',
      ceiling: 340,
      maxLines: 2,
      charWidth: WIDE,
      maxHeight: budget,
    });
    expect(size * HEADLINE_LINE_HEIGHT).toBeLessThanOrEqual(budget);
    // On one line, which is only possible below the two-line size.
    expect('Flip 7'.length * WIDE * size).toBeLessThanOrEqual(SAFE_WIDTH + 0.001);
  });

  it('never returns a block taller than its budget, for any real title', () => {
    const titles = ['Tina', 'Flip 7', 'Codenames', 'Terraforming Mars', LONGEST_GAME];
    for (const budget of [200, 300, 420, 700]) {
      for (const text of titles) {
        const size = fitBlock({ text, ceiling: 340, maxLines: 2, charWidth: WIDE, maxHeight: budget });
        const lines = Math.min(2, Math.ceil((text.length * WIDE * size) / SAFE_WIDTH));
        // The floor can win on an impossible budget; nothing else may.
        if (size > MIN_HEADLINE_PX) {
          expect(size * HEADLINE_LINE_HEIGHT * lines).toBeLessThanOrEqual(budget + 0.001);
        }
      }
    }
  });

  it('fits a narrower measure when it is given one', () => {
    const wide = fitBlock({ text: 'Terraforming Mars', ceiling: 300, width: SAFE_WIDTH });
    const narrow = fitBlock({ text: 'Terraforming Mars', ceiling: 300, width: SAFE_WIDTH / 2 });
    expect(narrow).toBeLessThan(wide);
  });

  it('never grows past its ceiling however much room there is', () => {
    expect(fitBlock({ text: 'X', ceiling: 120, maxHeight: 5000 })).toBe(120);
  });
});
