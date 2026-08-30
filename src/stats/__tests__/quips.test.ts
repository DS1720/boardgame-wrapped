import { describe, expect, it } from 'vitest';
import { buildDataset } from '@/ingest/parse';
import { yearRange } from '@/ingest/select';
import { buildWrappedStats, MODULES } from '../index';
import { quipFor } from '../quips';
import type { SlideId, WrappedStats } from '../types';
import { smallExport } from './fixtures';

/**
 * The quips are the one part of the video that talks rather than reports, so
 * the thing worth testing is that they stay tied to the data: no line that
 * would fit any year, and no line at all where the number is too small to
 * carry a remark.
 */

const ds = buildDataset(smallExport());
const ALL: SlideId[] = MODULES.map((m) => m.id);
const stats = buildWrappedStats(ds, 1, yearRange(2026), ALL);

describe('quipFor', () => {
  it('is silent when there are no stats at all', () => {
    for (const id of ALL) expect(quipFor(id, null)).toBeNull();
  });

  it('never returns an empty or whitespace-only line', () => {
    for (const id of ALL) {
      const line = quipFor(id, stats);
      if (line !== null) expect(line.trim().length).toBeGreaterThan(0);
    }
  });

  it('says nothing on the bookends, which have no number to remark on', () => {
    expect(quipFor('intro' as SlideId, stats)).toBeNull();
    expect(quipFor('outro' as SlideId, stats)).toBeNull();
  });

  it('holds back on totals too small to be a rhythm', () => {
    // Five plays across a year is not "n a week"; it should fall through to the
    // "one every N days" form rather than claiming a weekly habit.
    const line = quipFor('totalPlays', stats)!;
    expect(line).toMatch(/every \d+ days/);
    expect(line).not.toMatch(/a week/);
  });

  it('switches to the weekly form once the year is actually busy', () => {
    const busy: WrappedStats = {
      ...stats,
      stats: stats.stats.map((s) =>
        s.id === 'totalPlays' ? { ...s, plays: 568 } : s,
      ) as WrappedStats['stats'],
    };
    expect(quipFor('totalPlays', busy)).toMatch(/a week\. Every week\./);
  });

  // The fixture's games carry no stated length, so it produces no timePlayed
  // stat at all. The trilogy line is a threshold, so it gets one built by hand.
  const withMinutes = (minutes: number): WrappedStats => ({
    ...stats,
    stats: [
      ...stats.stats,
      { id: 'timePlayed', core: true, minutes, playsCounted: 5, playsMissing: 0, topGame: null },
    ],
  });

  it('counts trilogies only when there is time for more than one', () => {
    expect(quipFor('timePlayed', withMinutes(726 * 9 + 30))).toBe(
      'You could have watched all of Lord of the Rings 9 times.',
    );
    // Under two trilogies the comparison stops being funny and starts being maths.
    expect(quipFor('timePlayed', withMinutes(700))).toBe('And not one minute of it wasted.');
  });

  it('does not claim a top five when the fixture only has three games', () => {
    expect(quipFor('topFive', stats)).toBeNull();
  });

  it('has nothing to say about a win rate in a co-op-only year', () => {
    const coop: WrappedStats = {
      ...stats,
      stats: stats.stats.map((s) =>
        s.id === 'winRate' ? { ...s, coopOnly: true } : s,
      ) as WrappedStats['stats'],
    };
    expect(quipFor('winRate', coop)).toBeNull();
  });

  it('calls a lopsided co-player share a duo', () => {
    const duo: WrappedStats = {
      ...stats,
      stats: stats.stats.map((s) =>
        s.id === 'topCoPlayer' ? { ...s, shared: 5 } : s,
      ) as WrappedStats['stats'],
    };
    expect(quipFor('topCoPlayer', duo)).toBe('100% of your games. At this point it is a duo.');
  });
});

describe('the bookends quip', () => {
  const bookends = (first: string, last: string, sameGame: boolean): WrappedStats => ({
    ...stats,
    stats: [
      ...stats.stats.filter((s) => s.id !== 'firstAndLastPlay'),
      {
        id: 'firstAndLastPlay',
        core: false,
        first: { day: first, game: { gameId: 1, name: 'Faraway', boxArt: null, bggId: 0 } },
        last: {
          day: last,
          game: { gameId: sameGame ? 1 : 2, name: sameGame ? 'Faraway' : 'Strike', boxArt: null, bggId: 0 },
        },
      },
    ],
  });

  // The best line the slide has, and the cheapest to check: opening and closing
  // a year with the same game says more than any number already on screen.
  it('names the game when the year opened and closed with it', () => {
    expect(quipFor('firstAndLastPlay', bookends('2026-01-01', '2026-08-25', true))).toContain(
      'Faraway',
    );
  });

  it('says something else when the two ends differ', () => {
    const line = quipFor('firstAndLastPlay', bookends('2026-01-01', '2026-08-25', false));
    expect(line).not.toBeNull();
    expect(line).not.toContain('Faraway');
  });

  // A single evening in range has no span to remark on, and "0 days" would be
  // a worse line than none.
  it('is silent when both ends are the same week', () => {
    expect(quipFor('firstAndLastPlay', bookends('2026-05-04', '2026-05-06', false))).toBeNull();
  });

  it('is silent when the stat is not there at all', () => {
    const without = { ...stats, stats: stats.stats.filter((s) => s.id !== 'firstAndLastPlay') };
    expect(quipFor('firstAndLastPlay', without)).toBeNull();
  });
});

describe('the time list quip', () => {
  const withTime = (games: number, minutes: number, topMinutes: number): WrappedStats => ({
    ...stats,
    stats: [
      ...stats.stats.filter((s) => s.id !== 'topFiveByTime' && s.id !== 'timePlayed'),
      { id: 'timePlayed', core: true, minutes, playsCounted: 10, playsMissing: 0, topGame: null },
      {
        id: 'topFiveByTime',
        core: true,
        games: Array.from({ length: games }, (_, i) => ({
          gameId: i + 1,
          name: `Game ${i + 1}`,
          boxArt: null,
          bggId: i + 1,
          minutes: topMinutes,
          plays: 1,
        })),
      },
    ],
  });

  // It used to carry the play-count five's remark in this slide's unit —
  // "Five games, and 50% of your time at the table" — which was a third way of
  // saying what the five durations beside the games already say.
  it('has no line, whatever the numbers are', () => {
    expect(quipFor('topFiveByTime', withTime(5, 1000, 100))).toBeNull();
    expect(quipFor('topFiveByTime', withTime(3, 1000, 100))).toBeNull();
    expect(quipFor('topFiveByTime', withTime(5, 1, 100))).toBeNull();
  });
});
