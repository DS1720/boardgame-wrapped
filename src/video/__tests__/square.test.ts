import { describe, expect, it } from 'vitest';
import { SQUARE, squareLayout } from '../Square';

/**
 * The square is a fixed canvas with no scrollbar and no second frame to correct
 * itself on, so anything that does not fit is simply gone. It shipped that way:
 * on the theme with the largest type scale the card ran 240px past its own
 * frame, cutting the year off the top and the bottom row of titles off the
 * bottom. Nothing in a unit test caught it because the sizes were read from the
 * theme and the height was never computed at all.
 *
 * This is that computation, checked against every combination of the optional
 * lines a player may or may not earn.
 */

const AVAILABLE = SQUARE.height - SQUARE.margin * 2;

/** Every shape of card: totals, fourth fact and superlative are each optional. */
const combinations = () => {
  const out = [];
  for (const hasTotals of [true, false]) {
    for (const hasFact of [true, false]) {
      for (const hasSuperlative of [true, false]) {
        for (const hasGames of [true, false]) {
          out.push({ hasTotals, hasFact, hasSuperlative, hasGames });
        }
      }
    }
  }
  return out;
};

describe('the square layout', () => {
  it('fits inside the frame in every combination', () => {
    for (const lines of combinations()) {
      expect(squareLayout(lines).height).toBeLessThanOrEqual(AVAILABLE);
    }
  });

  it('never lets a cover outgrow its column', () => {
    for (const lines of combinations()) {
      const layout = squareLayout(lines);
      expect(layout.cover).toBeLessThanOrEqual(layout.column);
    }
  });

  it('keeps the covers big enough to be the point of the card', () => {
    for (const lines of combinations().filter((l) => l.hasGames)) {
      expect(squareLayout(lines).cover).toBeGreaterThanOrEqual(150);
    }
  });

  // The reason it is derived rather than tuned: a card with three header lines
  // has room a card with five does not, and one fixed size cannot serve both.
  it('spends the space a shorter header leaves on bigger covers', () => {
    const full = squareLayout({
      hasTotals: true,
      hasFact: true,
      hasSuperlative: true,
      hasGames: true,
    });
    const spare = squareLayout({
      hasTotals: true,
      hasFact: false,
      hasSuperlative: false,
      hasGames: true,
    });
    expect(spare.cover).toBeGreaterThan(full.cover);
  });

  it('is just a header when there are no games to show', () => {
    const layout = squareLayout({
      hasTotals: true,
      hasFact: true,
      hasSuperlative: true,
      hasGames: false,
    });
    expect(layout.cover).toBe(0);
    expect(layout.height).toBeLessThanOrEqual(AVAILABLE);
  });
});
