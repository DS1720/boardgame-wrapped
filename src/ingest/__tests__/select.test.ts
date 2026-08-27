import { describe, expect, it } from 'vitest';
import { buildDataset } from '../parse';
import { makeRange, playersInPlays, playsInRange, yearRange, RangeError_ } from '../select';
import { smallExport } from '@/stats/__tests__/fixtures';

const ds = buildDataset(smallExport());

describe('date range selection', () => {
  it('selects a whole year', () => {
    expect(playsInRange(ds.plays, yearRange(2026))).toHaveLength(5);
    expect(playsInRange(ds.plays, yearRange(2025))).toHaveLength(0);
  });

  it('is inclusive on both boundary dates', () => {
    const range = makeRange(new Date(2026, 0, 10), new Date(2026, 2, 5), 'Jan-Mar');
    const selected = playsInRange(ds.plays, range);
    expect(selected).toHaveLength(4);
    expect(selected[0].day).toBe('2026-01-10');
    expect(selected[selected.length - 1].day).toBe('2026-03-05');
  });

  it('rejects an inverted range', () => {
    expect(() => makeRange(new Date(2026, 5, 1), new Date(2026, 1, 1), 'bad')).toThrow(RangeError_);
  });

  it('ranks players by play count', () => {
    const ranked = playersInPlays(ds.plays);
    expect(ranked.map((p) => [p.name, p.playCount])).toEqual([
      ['Ana', 5],
      ['Ben', 4],
      ['Cid', 2],
    ]);
  });
});
