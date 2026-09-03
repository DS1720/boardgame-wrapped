import { describe, expect, it } from 'vitest';
import { ETA_WARMUP_FETCHES, estimateRemainingSeconds, formatEta } from '../bgg';

/**
 * The estimate under the credit prefetch's progress bar.
 *
 * The thing worth testing is that it stays honest while the run is uneven: a
 * cached game costs nothing and a fetched one costs most of a second, so a rate
 * measured over both is wrong by whatever the mix happens to be.
 */

describe('estimateRemainingSeconds', () => {
  it('says nothing before enough fetches have landed', () => {
    /*
      The four workers start together, so `done` jumps to four in whatever the
      first request took — and that one pays for DNS and the handshake. Offered
      at four fetches, a real 21.5s run read "about 50 seconds left".
    */
    expect(
      estimateRemainingSeconds({ done: 4, total: 227, fetched: 4, elapsedMs: 900 }),
    ).toBeNull();
    expect(ETA_WARMUP_FETCHES).toBeGreaterThan(4);
  });

  it('projects a fresh run from the rate so far', () => {
    // 20 of 227 done in 2s, all fetched: ~0.1s each, 207 left.
    const seconds = estimateRemainingSeconds({
      done: 20,
      total: 227,
      fetched: 20,
      elapsedMs: 2000,
    })!;
    expect(seconds).toBeCloseTo(20.7, 1);
  });

  it('is not fooled by a run that is mostly cache', () => {
    /*
      This is the case a naive `elapsed / done` gets badly wrong. 200 cached
      games fly past in a second while 10 are actually fetched; the overall rate
      says "half a second left" and the run then spends half a minute on the
      remaining fetches, with the estimate climbing the whole way.

      Measuring per *fetch* and projecting the mix forward gets it right: of the
      17 left, about 1 in 21 will need fetching.
    */
    const naive = ((227 - 210) * 1000) / 210 / 1000;
    const seconds = estimateRemainingSeconds({
      done: 210,
      total: 227,
      fetched: 10,
      elapsedMs: 5000,
    })!;
    expect(naive).toBeLessThan(0.1);
    expect(seconds).toBeGreaterThan(naive);
    // 17 remaining × (10/210 fetch rate) × 0.5s per fetch.
    expect(seconds).toBeCloseTo(0.4, 1);
  });

  it('answers zero when nothing left has to be fetched', () => {
    // A fully cached re-run: there is no wait to describe.
    expect(estimateRemainingSeconds({ done: 50, total: 227, fetched: 0, elapsedMs: 400 })).toBe(0);
  });

  it('answers zero once the run is complete', () => {
    expect(estimateRemainingSeconds({ done: 227, total: 227, fetched: 227, elapsedMs: 24800 })).toBe(0);
  });

  it('says nothing before the clock has started', () => {
    expect(estimateRemainingSeconds({ done: 0, total: 227, fetched: 0, elapsedMs: 0 })).toBeNull();
  });

  it('falls as a run progresses', () => {
    // A rising estimate is what the fetch-rate projection exists to avoid.
    const at = (done: number) =>
      estimateRemainingSeconds({ done, total: 227, fetched: done, elapsedMs: done * 100 })!;
    expect(at(40)).toBeLessThan(at(20));
    expect(at(200)).toBeLessThan(at(100));
  });
});

describe('formatEta', () => {
  it('says nothing when there is no estimate', () => {
    expect(formatEta(null)).toBeNull();
  });

  it('rounds coarsely rather than counting seconds down', () => {
    // A figure ticking second by second invites checking against a clock, and
    // this is a projection from an average rate, not a measurement.
    expect(formatEta(23)).toBe('about 25 seconds left');
    expect(formatEta(41)).toBe('about 40 seconds left');
  });

  it('never rounds a real wait down to nothing', () => {
    expect(formatEta(6)).toBe('about 5 seconds left');
    expect(formatEta(4)).toBe('almost done');
    expect(formatEta(0)).toBe('almost done');
  });

  it('switches to minutes rather than saying "about 95 seconds"', () => {
    expect(formatEta(62)).toBe('about a minute left');
    expect(formatEta(95)).toBe('about a minute and a half left');
    expect(formatEta(140)).toBe('about 2 minutes left');
    expect(formatEta(600)).toBe('about 10 minutes left');
  });

  it('produces a readable line at every second of a real run', () => {
    // 24.8s measured on the real library; sweep well past it.
    for (let s = 0; s <= 900; s += 1) {
      const line = formatEta(s)!;
      expect(line).toMatch(/^(almost done|about .+ left)$/);
      expect(line).not.toContain('NaN');
      expect(line).not.toContain('undefined');
      // "about 1 minutes left" and "about 0 seconds left" are the two ways
      // this kind of formatter usually goes wrong.
      expect(line).not.toMatch(/\b1 minutes\b/);
      expect(line).not.toMatch(/\b0 seconds\b/);
    }
  });
});
