import { describe, expect, it } from 'vitest';
import { chipScale } from '../slides/details';

/**
 * The chip stacks are the one detail animation that turns a number into a
 * different number, so the arithmetic is worth pinning down. Everything else in
 * `details.tsx` draws the figure it was handed.
 */
describe('chipScale', () => {
  it('scales both columns by the same unit', () => {
    // The point of the drawing. Scaling each column to its own height would
    // make 61 wins and 161 losses look like the same pile.
    const { winChips, lossChips, unit } = chipScale(61, 161);
    expect(unit).toBe(18);
    expect(winChips).toBe(3);
    expect(lossChips).toBe(9);
  });

  it('keeps the taller stack inside the frame, however lopsided the year', () => {
    for (const [w, l] of [
      [1, 1],
      [61, 161],
      [500, 3],
      [3, 500],
      [1, 5000],
    ]) {
      const { winChips, lossChips } = chipScale(w, l);
      expect(Math.max(winChips, lossChips)).toBeLessThanOrEqual(9);
    }
  });

  it('keeps the proportion the number states', () => {
    const { winChips, lossChips } = chipScale(61, 161);
    const drawn = winChips / (winChips + lossChips);
    // Within a chip's worth of the real 27%.
    expect(drawn).toBeGreaterThan(0.2);
    expect(drawn).toBeLessThan(0.34);
  });

  it('never rounds a column that has plays in it away to nothing', () => {
    // "You won some" and "you won none" have to look different, even at 1-in-500.
    const { winChips } = chipScale(1, 500);
    expect(winChips).toBe(1);
  });

  it('draws nothing for a column with no plays', () => {
    expect(chipScale(0, 12).winChips).toBe(0);
    expect(chipScale(12, 0).lossChips).toBe(0);
  });

  it('handles a year with no competitive plays at all', () => {
    const { unit, winChips, lossChips } = chipScale(0, 0);
    expect(unit).toBe(1);
    expect(winChips).toBe(0);
    expect(lossChips).toBe(0);
  });

  it('gives one chip per play when there are few enough to count', () => {
    const { unit, winChips, lossChips } = chipScale(4, 5);
    expect(unit).toBe(1);
    expect(winChips).toBe(4);
    expect(lossChips).toBe(5);
  });
});
