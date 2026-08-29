import { describe, expect, it } from 'vitest';
import { estimatedPlayMinutes } from '@/ingest/parse';
import { formatDays, formatDuration } from '@/shared/format';
import type { RawGame } from '@/shared/types';
import { timePlayed, topFiveByTime } from '../modules/optional';
import { buildContext } from '../context';
import type { StatContext } from '../context';
import { CORE_SLIDES, MODULES } from '../index';

const game = (over: Partial<RawGame> = {}): RawGame => ({
  id: 1,
  uuid: 'u1',
  name: 'Game',
  cooperative: false,
  highestWins: true,
  noPoints: false,
  usesTeams: false,
  urlImage: '',
  urlThumb: '',
  bggId: 1,
  ...over,
});

describe('estimatedPlayMinutes', () => {
  it('takes the midpoint of the stated range', () => {
    expect(estimatedPlayMinutes(game({ minPlayTime: 15, maxPlayTime: 30 }))).toBe(22.5);
    expect(estimatedPlayMinutes(game({ minPlayTime: 60, maxPlayTime: 180 }))).toBe(120);
  });

  it('falls back to whichever bound exists', () => {
    expect(estimatedPlayMinutes(game({ minPlayTime: 45 }))).toBe(45);
    expect(estimatedPlayMinutes(game({ maxPlayTime: 90 }))).toBe(90);
  });

  it('returns null rather than guessing when there is no stated time', () => {
    // Roughly 1% of real plays land here; they are counted separately, never
    // filled in with an average.
    expect(estimatedPlayMinutes(game())).toBeNull();
    expect(estimatedPlayMinutes(game({ minPlayTime: 0, maxPlayTime: 0 }))).toBeNull();
    expect(estimatedPlayMinutes(undefined)).toBeNull();
  });

  it('ignores nonsense values', () => {
    expect(estimatedPlayMinutes(game({ minPlayTime: -30 }))).toBeNull();
    expect(estimatedPlayMinutes(game({ minPlayTime: 'x' as never }))).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */

const PLAYER_ID = 1;

/** A context with the given per-play estimates, all for one player. */
const contextWith = (minutes: Array<number | null>, gameIds?: number[]): StatContext => {
  const plays = minutes.map((estimatedMinutes, i) => ({
    uuid: `p${i}`,
    date: new Date(2026, 0, i + 1, 20),
    day: `2026-01-${String(i + 1).padStart(2, '0')}`,
    hour: 20,
    gameId: gameIds?.[i] ?? 1,
    gameName: `Game ${gameIds?.[i] ?? 1}`,
    cooperative: false,
    highestWins: true,
    usesTeams: false,
    boxArt: null,
    bggId: 1,
    locationId: null,
    locationName: null,
    estimatedMinutes,
    participants: [
      { playerId: PLAYER_ID, name: 'Tina', won: false, score: null, isNew: false, team: '', teamRole: '' },
    ],
  }));

  return buildContext(
    {
      plays,
      playersById: new Map(),
      gamesById: new Map(),
      locationsById: new Map(),
      meRefId: null,
      exportDate: null,
      counts: { plays: plays.length, ignored: 0, players: 1, games: 1 },
      range: null,
    },
    PLAYER_ID,
    { from: new Date(2025, 0, 1), to: new Date(2027, 0, 1), label: 'test' },
  );
};

describe('timePlayed', () => {
  it('sums the estimates', () => {
    const stat = timePlayed(contextWith([30, 60, 90]));
    expect(stat?.id).toBe('timePlayed');
    if (stat?.id !== 'timePlayed') return;
    expect(stat.minutes).toBe(180);
    expect(stat.playsCounted).toBe(3);
    expect(stat.playsMissing).toBe(0);
  });

  it('counts plays with no known length instead of guessing at them', () => {
    // Three of four measured — above the coverage floor, so the estimate stands
    // and the fourth play is reported as unmeasured rather than averaged in.
    const stat = timePlayed(contextWith([30, 60, 90, null]));
    if (stat?.id !== 'timePlayed') throw new Error('expected a stat');
    expect(stat.minutes).toBe(180);
    expect(stat.playsCounted).toBe(3);
    expect(stat.playsMissing).toBe(1);
  });

  it('refuses to estimate a year it can barely see', () => {
    // Two of ten plays measured is not an estimate of the year, it is an
    // estimate of a fifth of it presented as the whole.
    const mostlyUnknown = [30, 60, ...Array<number | null>(8).fill(null)];
    expect(timePlayed(contextWith(mostlyUnknown))).toBeNull();
  });

  it('estimates when most of the year is covered', () => {
    const mostlyKnown = [...Array<number | null>(9).fill(30), null];
    expect(timePlayed(contextWith(mostlyKnown))?.id).toBe('timePlayed');
  });

  it('returns null for a player with no plays', () => {
    expect(timePlayed(contextWith([]))).toBeNull();
  });

  it('names the game the most time went into, not the most played', () => {
    // Game 1 played three times at 20 minutes; game 2 once at 180.
    const stat = timePlayed(contextWith([20, 20, 20, 180], [1, 1, 1, 2]));
    if (stat?.id !== 'timePlayed') throw new Error('expected a stat');
    expect(stat.topGame?.gameId).toBe(2);
    expect(stat.topGame?.minutes).toBe(180);
    expect(stat.topGame?.plays).toBe(1);
  });

  it('breaks a tie deterministically', () => {
    const first = timePlayed(contextWith([60, 60], [1, 2]));
    const second = timePlayed(contextWith([60, 60], [1, 2]));
    expect(first).toEqual(second);
  });

  it('rounds to whole minutes', () => {
    const stat = timePlayed(contextWith([22.5, 22.5, 22.5]));
    if (stat?.id !== 'timePlayed') throw new Error('expected a stat');
    expect(Number.isInteger(stat.minutes)).toBe(true);
    expect(stat.minutes).toBe(68);
  });
});

describe('registration', () => {
  it('runs in the default cut, right after the play count', () => {
    const ids = MODULES.map((m) => m.id);
    expect(ids).toContain('timePlayed');
    expect(ids.indexOf('timePlayed')).toBe(ids.indexOf('totalPlays') + 1);
  });

  it('is a core slide, so it is on by default', () => {
    expect(CORE_SLIDES).toContain('timePlayed');
  });
});

describe('formatting', () => {
  it('shows minutes below an hour and hours above', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(90)).toBe('1.5 h');
    expect(formatDuration(6852)).toBe('114 h');
  });

  it('separates thousands in a large hour count', () => {
    expect(formatDuration(60 * 1200)).toMatch(/1[.,\s ]200 h/);
  });

  it('makes a large number of hours imaginable as days', () => {
    expect(formatDays(6852)).toBe('4.8');
  });
});

describe('topFiveByTime', () => {
  /*
    The companion to `timePlayed`, and the reason it is a slide of its own: it
    ranks by minutes, so it is usually a *different list* from the top five by
    play count. Everything here is about that difference and about the rails it
    shares with the stat it sits beside.
  */
  it('ranks by minutes, not by plays', () => {
    // Game 2 is played three times for 30 minutes; game 1 once for 200.
    const stat = topFiveByTime(contextWith([200, 30, 30, 30], [1, 2, 2, 2]));
    expect(stat?.id).toBe('topFiveByTime');
    if (stat?.id !== 'topFiveByTime') return;
    expect(stat.games.map((g) => g.gameId)).toEqual([1, 2]);
    expect(stat.games[0].minutes).toBe(200);
    expect(stat.games[0].plays).toBe(1);
    expect(stat.games[1].minutes).toBe(90);
    expect(stat.games[1].plays).toBe(3);
  });

  it('shows five at most', () => {
    const minutes = [10, 20, 30, 40, 50, 60, 70];
    const stat = topFiveByTime(contextWith(minutes, [1, 2, 3, 4, 5, 6, 7]));
    if (stat?.id !== 'topFiveByTime') return;
    expect(stat.games).toHaveLength(5);
    // The longest first, and the two shortest games left off.
    expect(stat.games.map((g) => g.minutes)).toEqual([70, 60, 50, 40, 30]);
  });

  // A top five of one game is the time slide's own `topGame` again, at greater
  // length. Same reasoning as the play-count top five.
  it('says nothing when only one game has any time in it', () => {
    expect(topFiveByTime(contextWith([60, 60, 60], [1, 1, 1]))).toBeNull();
  });

  /*
    The rail that matters most: below the coverage floor an estimate is of part
    of a year presented as the whole. If this list appeared while `timePlayed`
    was suppressed, the same estimate would be on screen with *less* of a
    caveat rather than more.
  */
  it('is silent on exactly the coverage `timePlayed` is silent on', () => {
    const thin = contextWith([60, null, null, null, null], [1, 2, 3, 4, 5]);
    expect(timePlayed(thin)).toBeNull();
    expect(topFiveByTime(thin)).toBeNull();

    const covered = contextWith([60, 30, 45, 90, null], [1, 2, 3, 4, 5]);
    expect(timePlayed(covered)).not.toBeNull();
    expect(topFiveByTime(covered)).not.toBeNull();
  });

  it('agrees with timePlayed about which game took the most', () => {
    const ctx = contextWith([200, 30, 30, 30], [1, 2, 2, 2]);
    const total = timePlayed(ctx);
    const list = topFiveByTime(ctx);
    if (total?.id !== 'timePlayed' || list?.id !== 'topFiveByTime') return;
    expect(list.games[0].gameId).toBe(total.topGame?.gameId);
    expect(list.games[0].minutes).toBe(total.topGame?.minutes);
  });

  it('says nothing at all when there are no plays', () => {
    expect(topFiveByTime(contextWith([]))).toBeNull();
  });
});
