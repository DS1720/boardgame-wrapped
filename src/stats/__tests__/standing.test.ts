import { describe, expect, it } from 'vitest';
import { buildDataset } from '@/ingest/parse';
import { yearRange } from '@/ingest/select';
import type { RawExport } from '@/shared/types';
import { buildContext } from '../context';
import { MIN_STANDING_POOL, standingIn, topGame } from '../modules/core';
import { MAX_STANDING_SHARE, quipFor, rangePhrase, topGameShare } from '../quips';
import { buildWrappedStats } from '../index';
import { game, play, score } from './fixtures';

/**
 * "Top N% of everyone who played it" is a claim about other people, so the two
 * things worth pinning down are who is in the pool and which way it rounds.
 * Overstating a rank is the one failure that would be invisible on screen.
 */

/**
 * `players` people on one game, where player `i` has `i` plays of it: player 1
 * plays it once, player 8 eight times. That makes every rank predictable —
 * the highest id is first — without depending on any tie-breaking rule.
 */
const ladder = (players: number): RawExport => {
  const plays = [];
  for (let id = 1; id <= players; id += 1) {
    for (let n = 0; n < id; n += 1) {
      // A second participant on every play, so these are real games rather
      // than solo entries — and always the same one, so the pool is the ladder.
      plays.push(
        play(`2026-03-${String((n % 27) + 1).padStart(2, '0')} 20:00:00`, 10, [
          score(id, { winner: true }),
          score(players + 1),
        ]),
      );
    }
  }
  return {
    players: [
      ...Array.from({ length: players }, (_, i) => ({
        id: i + 1,
        uuid: `p${i + 1}`,
        name: `Player ${i + 1}`,
        isAnonymous: false,
      })),
      { id: players + 1, uuid: 'host', name: 'Host', isAnonymous: false },
    ],
    games: [game(10, 'Azul')],
    locations: [{ id: 1, uuid: 'loc', name: 'Kitchen table' }],
    plays,
    userInfo: { meRefId: 1, exportDate: '2026-12-31 12:00:00' },
  };
};

const standingFor = (players: number, playerId: number) => {
  const ds = buildDataset(ladder(players));
  return standingIn(buildContext(ds, playerId, yearRange(2026)), 10);
};

describe('standingIn', () => {
  it('ranks a player among everyone who played the game', () => {
    // Eight on the ladder plus the host, who played it most of all.
    expect(standingFor(8, 8)).toEqual({ rank: 2, players: 9 });
    expect(standingFor(8, 5)).toEqual({ rank: 5, players: 9 });
    expect(standingFor(8, 1)).toEqual({ rank: 9, players: 9 });
  });

  it('counts people, not plays', () => {
    // 36 plays across the ladder, but the pool is the nine who played them.
    expect(standingFor(8, 4)?.players).toBe(9);
  });

  it('gives tied players the same rank', () => {
    // Two people on the same count are both second if one person has more;
    // deciding between them would make a percentile depend on a name.
    const ds = buildDataset({
      ...ladder(3),
      plays: [
        ...ladder(3).plays,
        // Lift player 1 to two plays, level with player 2.
        play('2026-06-01 20:00:00', 10, [score(1), score(4)]),
        play('2026-06-02 20:00:00', 10, [score(5), score(4)]),
      ],
      players: [
        ...ladder(3).players,
        { id: 5, uuid: 'p5', name: 'Player 5', isAnonymous: false },
      ],
    });
    const ctx = (id: number) => buildContext(ds, id, yearRange(2026));
    expect(standingIn(ctx(1), 10)).toEqual(standingIn(ctx(2), 10));
  });

  it('is null when too few people played it for a percentage to mean anything', () => {
    // Four on the ladder plus the host is four short of nothing — one step is a
    // fifth of the field, and first place would read as "top 20%".
    expect(standingFor(MIN_STANDING_POOL - 2, 1)).toBeNull();
    expect(standingFor(MIN_STANDING_POOL - 1, 1)).not.toBeNull();
  });

  it('is null for a player who never played that game', () => {
    const ds = buildDataset(ladder(8));
    // The host is in the pool; a player with no plays of it is not.
    expect(standingIn(buildContext(ds, 99, yearRange(2026)), 10)).toBeNull();
  });

  it('travels on the top game stat', () => {
    const ds = buildDataset(ladder(8));
    const stat = topGame(buildContext(ds, 8, yearRange(2026)));
    expect(stat).toMatchObject({ id: 'topGame', standing: { rank: 2, players: 9 } });
  });
});

describe('topGameShare', () => {
  it('rounds up, so the line never claims a better place than the player holds', () => {
    // 2 of 12 is 16.7%: "top 16%" would be a rank nobody reached.
    expect(topGameShare({ rank: 2, players: 12 })).toBe(17);
    expect(topGameShare({ rank: 1, players: 20 })).toBe(5);
  });

  it('says nothing about the bottom half', () => {
    expect(topGameShare({ rank: 1, players: 2 })).toBe(50);
    expect(topGameShare({ rank: 2, players: 3 })).toBeNull();
    expect(topGameShare({ rank: 9, players: 10 })).toBeNull();
  });

  it('is null without a standing', () => {
    expect(topGameShare(null)).toBeNull();
    expect(topGameShare({ rank: 1, players: 0 })).toBeNull();
  });

  it('never returns a share above the cap', () => {
    for (let players = 1; players <= 40; players += 1) {
      for (let rank = 1; rank <= players; rank += 1) {
        const share = topGameShare({ rank, players });
        if (share === null) continue;
        expect(share).toBeGreaterThan(0);
        expect(share).toBeLessThanOrEqual(MAX_STANDING_SHARE);
      }
    }
  });
});

describe('the top game quip', () => {
  const quip = (players: number, playerId: number) => {
    const ds = buildDataset(ladder(players));
    return quipFor('topGame', buildWrappedStats(ds, playerId, yearRange(2026), ['topGame']));
  };

  it('states the share of everyone who played it, over the period covered', () => {
    // Player 8 is second of nine: 22.2%, rounded up. The fixture's range is a
    // calendar year, so the sentence ends "this year".
    expect(quip(8, 8)).toBe('You were in the top 23% of everyone who played it this year.');
  });

  it('falls back to the rate when the pool is too small to rank against', () => {
    // Three on the ladder plus the host: no percentage, but player 3 still has
    // three plays, so there is still something true to say.
    expect(quip(3, 3)).toMatch(/Once every \d+ days/);
  });

  it('says nothing at all when the top game was barely played', () => {
    expect(quip(8, 2)).toBeNull();
  });
});

describe('rangePhrase', () => {
  const over = (from: string, to: string) =>
    rangePhrase({
      playerId: 1,
      playerName: 'Ana',
      rangeLabel: 'x',
      rangeFrom: from,
      rangeTo: to,
      stats: [],
      thin: false,
    });

  it('says "this year" only for a calendar year', () => {
    expect(over('2026-01-01', '2026-12-31')).toBe('this year');
    // A leap year is still the year whoever picked it had in mind.
    expect(over('2024-01-01', '2024-12-31')).toBe('this year');
  });

  it('calls twelve months that are not a calendar year the last twelve months', () => {
    // September to September is a year long and is not "this year".
    expect(over('2025-09-01', '2026-08-31')).toBe('in the last 12 months');
    expect(over('2025-06-15', '2026-06-14')).toBe('in the last 12 months');
  });

  it('counts months rather than reaching for the year', () => {
    // Anything short of a calendar year is said in months, however close it is.
    expect(over('2026-01-01', '2026-11-30')).toBe('in the last 11 months');
    expect(over('2026-01-01', '2026-06-30')).toBe('in the last 6 months');
    expect(over('2026-02-01', '2026-04-30')).toBe('in the last 3 months');
  });

  it('says "this month" only for a whole calendar month', () => {
    expect(over('2026-03-01', '2026-03-31')).toBe('this month');
    // February, and February in a leap year.
    expect(over('2026-02-01', '2026-02-28')).toBe('this month');
    expect(over('2024-02-01', '2024-02-29')).toBe('this month');
    // A month-long span that is not one month gets counted instead.
    expect(over('2026-03-15', '2026-04-14')).toBe('in the last 4 weeks');
  });

  it('drops to weeks and days on short ranges', () => {
    expect(over('2026-03-01', '2026-03-05')).toBe('in the last 5 days');
    expect(over('2026-03-01', '2026-03-21')).toBe('in the last 3 weeks');
    expect(over('2026-03-01', '2026-03-01')).toBe('today');
  });

  it('switches to years past twelve months, rounded to the nearest', () => {
    // Twelve months is still months — that is the September-to-September case.
    expect(over('2025-09-01', '2026-08-31')).toBe('in the last 12 months');
    // Past it, nobody counts in months: 19 months is arithmetic, not a period.
    expect(over('2025-06-01', '2026-12-31')).toBe('in the last 2 years');
    expect(over('2025-01-01', '2026-12-31')).toBe('in the last 2 years');
    expect(over('2024-01-01', '2026-12-31')).toBe('in the last 3 years');
  });

  it('rounds a year and a half up and a year and a bit down', () => {
    // 18 months rounds to two; 13 months rounds to one, and one year is said
    // without the numeral.
    expect(over('2025-07-01', '2026-12-31')).toBe('in the last 2 years');
    expect(over('2025-12-01', '2026-12-31')).toBe('in the last year');
  });

  it('never says a unit in the singular', () => {
    // "in the last 1 months" is the failure this phrasing invites.
    const from = new Date('2026-01-01T00:00:00');
    for (let span = 0; span < 1200; span += 1) {
      const to = new Date(from.getTime() + span * 86_400_000);
      const key = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
          d.getDate(),
        ).padStart(2, '0')}`;
      // Neither "in the last 1 months" nor "in the last 1 year".
      expect(over('2026-01-01', key(to))).not.toMatch(/1 (day|week|month|year)s?/);
    }
  });

  it('never says "year" for something that is not one', () => {
    // The failure worth guarding: a six-week wrapped claiming a year.
    expect(over('2026-05-01', '2026-06-15')).not.toMatch(/year/);
  });
});
