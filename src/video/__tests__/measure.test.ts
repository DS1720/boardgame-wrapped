import { describe, expect, it } from 'vitest';
import { ALL_FONTS, DISPLAY_FONTS } from '@/theme/fonts';
import { ESTIMATED_ADVANCE, estimatedMeasure, measureFor } from '../measure';
import { fitBlock, MIN_HEADLINE_PX } from '../slides/layout';
import { VIDEO } from '../config';

/**
 * There is no canvas here, so what these check is the fallback path and the
 * arithmetic the measurement feeds. The measurement itself is verified by
 * rendering: a headline that overruns the frame is visible in a still and
 * invisible to a test, which is exactly how the old constant survived three
 * new display faces.
 */

const SAFE_WIDTH = VIDEO.width - VIDEO.safeMargin * 2;

describe('measureFor without a canvas', () => {
  it('answers for every font in the catalogue', () => {
    for (const spec of ALL_FONTS) {
      const measure = measureFor(spec.id);
      expect(measure('Faraway')).toBeGreaterThan(0);
      expect(Number.isFinite(measure('Faraway'))).toBe(true);
    }
  });

  it('is zero for an empty string, not NaN', () => {
    for (const spec of DISPLAY_FONTS) {
      expect(measureFor(spec.id)('')).toBe(0);
    }
  });

  it('uses a face’s stated advance over the default', () => {
    // Archivo at 125% states 0.72; the default is 0.56.
    expect(measureFor('archivo-expanded')('xxxx')).toBeCloseTo(4 * 0.72, 5);
    expect(measureFor('familjen')('xxxx')).toBeCloseTo(4 * ESTIMATED_ADVANCE, 5);
  });

  it('grows with the string', () => {
    const measure = measureFor('familjen');
    expect(measure('xx')).toBeGreaterThan(measure('x'));
  });
});

describe('fitBlock with a measurer', () => {
  /** A face twice as wide as the estimate — the shape of the bug this fixes. */
  const wide = estimatedMeasure(1.12);
  const narrow = estimatedMeasure(0.42);

  it('sets a wide face smaller than a narrow one, for the same text', () => {
    const text = 'Terraforming Mars';
    expect(fitBlock({ text, ceiling: 300, measure: wide })).toBeLessThan(
      fitBlock({ text, ceiling: 300, measure: narrow }),
    );
  });

  it('keeps a wide face inside the frame', () => {
    for (const text of ['Faraway', 'Flip 7', 'Codenames: Pictures', 'Hütteldorfer Straße 102']) {
      const size = fitBlock({ text, ceiling: 340, maxLines: 2, measure: wide });
      // On two lines at most, so the whole string may be twice the measure.
      expect(wide(text) * size).toBeLessThanOrEqual(SAFE_WIDTH * 2 + 0.001);
      // And the longest single word always fits one line, since wrapping cannot
      // help it.
      const longest = text.split(/\s+/).reduce((a, b) => (wide(a) > wide(b) ? a : b));
      if (size > MIN_HEADLINE_PX) {
        expect(wide(longest) * size).toBeLessThanOrEqual(SAFE_WIDTH + 0.001);
      }
    }
  });

  it('prefers the measurer over the per-character estimate when both are given', () => {
    const byChar = fitBlock({ text: 'xxxx', ceiling: 300, charWidth: 0.5 });
    const byMeasure = fitBlock({ text: 'xxxx', ceiling: 300, charWidth: 0.5, measure: wide });
    expect(byMeasure).toBeLessThan(byChar);
  });
});
