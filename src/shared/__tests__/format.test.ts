import { describe, expect, it } from 'vitest';
import { daysBetween, parseDayKey, parseLocalDate, toDayKey } from '../format';

/**
 * Two date formats live in this codebase and they are not interchangeable: a
 * play carries a timestamp, and a stat carries a day key wherever the time of
 * day is not part of the fact. Mixing them fails silently — `parseLocalDate`
 * answers an invalid Date rather than throwing — which is exactly how the
 * first-and-last slide lost its span line to a quiet NaN.
 */

describe('parseDayKey', () => {
  it('reads a day key as local midnight', () => {
    const d = parseDayKey('2026-03-09');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(9);
    expect(d.getHours()).toBe(0);
  });

  it('round-trips through toDayKey', () => {
    for (const key of ['2026-01-01', '2026-08-25', '2025-12-31']) {
      expect(toDayKey(parseDayKey(key))).toBe(key);
    }
  });

  it('refuses a timestamp, which is the other parser’s job', () => {
    expect(Number.isNaN(parseDayKey('2026-03-09 21:30:00').getTime())).toBe(true);
  });

  // The trap, stated as a test so nobody re-discovers it in a rendered frame.
  it('is needed because parseLocalDate refuses a day key', () => {
    expect(Number.isNaN(parseLocalDate('2026-03-09').getTime())).toBe(true);
    expect(Number.isNaN(parseDayKey('2026-03-09').getTime())).toBe(false);
  });
});

describe('daysBetween', () => {
  it('counts the real span', () => {
    // Tina's 2026: 1 January to 25 August.
    expect(daysBetween('2026-01-01', '2026-08-25')).toBe(236);
  });

  it('is zero for one day', () => {
    expect(daysBetween('2026-05-04', '2026-05-04')).toBe(0);
  });

  it('counts forwards across New Year', () => {
    expect(daysBetween('2025-12-30', '2026-01-02')).toBe(3);
  });

  // Central European clocks move on the last Sunday in March and October, so a
  // span that crosses one is 23 or 25 hours short of a whole number of days.
  it('is whole days across a daylight saving change', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
  });

  it('answers null rather than NaN when handed something else', () => {
    expect(daysBetween('2026-01-01 20:00:00', '2026-08-25')).toBeNull();
    expect(daysBetween('', '2026-08-25')).toBeNull();
  });
});
