import { describe, expect, it } from 'vitest';
import { buildDataset } from '@/ingest/parse';
import { yearRange } from '@/ingest/select';
import { buildWrappedStats, MODULES } from '../index';
import { quipFor } from '../quips';
import type { CreditStatId, SlideId, Stat, WrappedStats } from '../types';
import { bggFixture, smallExport } from './fixtures';

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

describe('the co-player count always has a line', () => {
  /*
    The exception to "a slide with no line is better than a slide with a limp
    one". This slide's layout depends on having an aside: without one the
    content drops to the bottom of the frame, so the slide would sit in a
    different place for different players depending on a number they have no
    control over.
  */
  const withCount = (count: number): WrappedStats => ({
    ...stats,
    stats: stats.stats.map((s) =>
      s.id === 'coPlayerCount' ? { ...s, count } : s,
    ) as WrappedStats['stats'],
  });

  it.each([1, 2, 3, 4, 5, 9, 10, 40])('says something for %i co-players', (count) => {
    expect(quipFor('coPlayerCount', withCount(count))).toBeTruthy();
  });

  it('keeps the line it always had from ten upwards', () => {
    expect(quipFor('coPlayerCount', withCount(10))).toBe(
      'That is a lot of people to explain rules to.',
    );
    expect(quipFor('coPlayerCount', withCount(93))).toBe(
      'That is a lot of people to explain rules to.',
    );
  });

  it('says a table between five and nine', () => {
    expect(quipFor('coPlayerCount', withCount(5))).toBe('More than one table between you.');
    expect(quipFor('coPlayerCount', withCount(9))).toBe('More than one table between you.');
  });

  it('fits two to four around one table', () => {
    expect(quipFor('coPlayerCount', withCount(2))).toBe('Everybody fits around one table.');
    expect(quipFor('coPlayerCount', withCount(4))).toBe('Everybody fits around one table.');
  });

  it('calls one co-player a pair', () => {
    expect(quipFor('coPlayerCount', withCount(1))).toBe('Just the two of you, all year.');
  });

  // The stat is null for a solo-only year, so the slide is never shown at 0 -
  // but the quip layer must not invent a line for stats it was not given.
  it('still says nothing when the stat is absent', () => {
    const without: WrappedStats = {
      ...stats,
      stats: stats.stats.filter((s) => s.id !== 'coPlayerCount'),
    };
    expect(quipFor('coPlayerCount', without)).toBeNull();
  });
});

describe('the credit quips', () => {
  const withBgg = buildWrappedStats(ds, 1, yearRange(2026), ALL, null, bggFixture());

  it('says nothing when the module produced no stat', () => {
    // The fixture's publishers never clear the two-entry floor.
    expect(quipFor('topPublishers', withBgg)).toBeNull();
  });

  it('never restates the games count the rows already carry', () => {
    /*
      Every credit row prints "N games" under the name. A line under the list
      repeating row one's number is the same fact twice, and the second telling
      is what reads as filler.
    */
    for (const id of [
      'topDesigners',
      'topArtists',
      'topPublishers',
      'topThemes',
      'topMechanics',
    ] as const) {
      // `find` over the union cannot narrow on a variable id, and every member
      // carries `entries` — so the cast asserts what the loop already
      // guarantees.
      const stat = withBgg.stats.find((s) => s.id === id) as
        | Extract<Stat, { id: CreditStatId }>
        | undefined;
      const line = quipFor(id, withBgg);
      if (!stat || !line) continue;
      expect(line).not.toContain(`${stat.entries[0].games} game`);
    }
  });

  it('holds back on a list too flat to remark on', () => {
    // Two mechanics on one game each says nothing about a year.
    const thin = buildWrappedStats(ds, 3, yearRange(2026), ALL, null, bggFixture());
    expect(quipFor('topMechanics', thin)).toBeNull();
  });

  it('is derived from the leader, not from a template', () => {
    const line = quipFor('topMechanics', withBgg);
    if (line) {
      const stat = withBgg.stats.find((s) => s.id === 'topMechanics') as Extract<
        Stat,
        { id: 'topMechanics' }
      >;
      expect(line).toContain(stat.entries[0].name);
    }
  });
});

describe('the record slide', () => {
  const recordStats = (over: Partial<Extract<Stat, { id: 'gameRecord' }>>): WrappedStats => ({
    ...stats,
    stats: [
      {
        id: 'gameRecord',
        core: false,
        game: { gameId: 1, name: 'Cabo', boxArt: null, bggId: 1 },
        score: 12,
        plays: 4,
        otherRecords: 0,
        contenders: 3,
        highestWins: true,
        shared: false,
        ...over,
      },
    ],
  });

  it('never counts the other records, because the caption already does', () => {
    /*
      "and the best score in 3 other games" is the line directly under the
      number now. A quip repeating that figure is the same fact twice.
    */
    for (const otherRecords of [1, 2, 3, 5, 9]) {
      const line = quipFor('gameRecord', recordStats({ otherRecords }))!;
      expect(line).not.toContain(String(otherRecords));
      expect(line).not.toContain(String(otherRecords + 1));
    }
  });

  it('says which way the scoring runs when lower is better', () => {
    // Eight of the real library's games are lowest-wins. With the "the lowest
    // of N players" caption gone, this is the only thing left on the slide
    // that stops a low number reading as a bad one.
    expect(quipFor('gameRecord', recordStats({ highestWins: false }))).toContain('Lower is better');
  });

  it('still says the contenders count, which is nowhere else on the slide', () => {
    expect(quipFor('gameRecord', recordStats({ contenders: 12 }))).toContain('12');
  });

  it('always has something to say', () => {
    expect(quipFor('gameRecord', recordStats({}))).toBe('The number to beat.');
  });
});

describe('the publishers slide always has a line', () => {
  const pubStats = (entries: Array<{ name: string; plays: number; games: number }>): WrappedStats => ({
    ...stats,
    stats: [
      {
        id: 'topPublishers',
        core: false,
        coverage: 1,
        entries: entries.map((e) => ({
          ...e,
          topGame: { gameId: 1, name: 'Faraway', boxArt: null, bggId: 1 },
        })),
      },
    ],
  });

  it('speaks for a two-name list, which used to be silent', () => {
    /*
      The old guard needed three entries and a leader twice the runner-up: one
      player in nine on the real export. One was losing the line on a 12-to-2
      lead purely for having a short list.
    */
    const line = quipFor('topPublishers', pubStats([
      { name: 'KOSMOS', plays: 12, games: 3 },
      { name: 'AMIGO', plays: 2, games: 2 },
    ]))!;
    expect(line).toContain('KOSMOS');
  });

  it('names the runner-up when the lead is narrow', () => {
    const line = quipFor('topPublishers', pubStats([
      { name: 'Catch Up Games', plays: 32, games: 2 },
      { name: 'The Op Games', plays: 27, games: 3 },
      { name: 'AMIGO', plays: 20, games: 2 },
    ]))!;
    expect(line).toBe('Catch Up Games, just ahead of The Op Games.');
  });

  it('only says "just ahead" when that is true', () => {
    // Below 2x, and never above it — a 12-to-2 lead is not a nose.
    const runaway = quipFor('topPublishers', pubStats([
      { name: 'KOSMOS', plays: 20, games: 4 },
      { name: 'AMIGO', plays: 5, games: 2 },
    ]))!;
    expect(runaway).not.toContain('just ahead');
  });

  it('states no number the rows already carry', () => {
    const entries = [
      { name: 'Catch Up Games', plays: 32, games: 2 },
      { name: 'The Op Games', plays: 27, games: 3 },
    ];
    const line = quipFor('topPublishers', pubStats(entries))!;
    for (const e of entries) {
      expect(line).not.toContain(String(e.plays));
      expect(line).not.toContain(`${e.games} game`);
    }
  });

  it('still says nothing without a list', () => {
    expect(quipFor('topPublishers', { ...stats, stats: [] })).toBeNull();
  });
});
