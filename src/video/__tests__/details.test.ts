import { describe, expect, it } from 'vitest';
import { chipScale, winMarkers } from '../slides/details';

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

describe('winMarkers', () => {
  const wins = (row: boolean[]) => row.filter(Boolean).length;

  it('draws exactly as many ticks as there were wins', () => {
    /*
      The row used to be filled and hollow dots, where a miscount read as a
      slightly wrong texture. It draws ticks and crosses now, so nine ticks
      under "80% in 10 plays" is a contradiction a viewer can read off the
      slide.
    */
    for (let shown = 1; shown <= 18; shown += 1) {
      for (let won = 0; won <= shown; won += 1) {
        expect(wins(winMarkers(shown, won))).toBe(won);
      }
    }
  });

  it('marks the right number in the cases the real export produces', () => {
    // Tina 2026: 67% of 3 at Codenames: Pictures, 0% of 10 at Castle Combo.
    expect(winMarkers(3, 2)).toEqual([true, false, true]);
    expect(winMarkers(10, 0)).toEqual(Array(10).fill(false));
    expect(winMarkers(4, 4)).toEqual([true, true, true, true]);
  });

  it('spreads the wins rather than bunching them at the front', () => {
    /*
      Which plays were won is not in the stat. Putting them all at one end
      would invent a run that may never have happened — and with ticks on the
      markers that invented run is now legible as a streak.
    */
    const row = winMarkers(12, 4);
    const at = row.flatMap((won, i) => (won ? [i] : []));
    expect(at).toHaveLength(4);
    // Evenly spaced: no two wins adjacent, and the last is in the back half.
    for (let i = 1; i < at.length; i += 1) expect(at[i] - at[i - 1]).toBeGreaterThan(1);
    expect(at[at.length - 1]).toBeGreaterThan(6);
  });

  it('draws nothing for a row with no plays', () => {
    expect(winMarkers(0, 0)).toEqual([]);
    expect(winMarkers(-1, 3)).toEqual([]);
  });
});
