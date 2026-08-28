import { describe, expect, it } from 'vitest';
import { outroFactFor } from '../outroFact';
import type { Stat, WrappedStats } from '../types';

/**
 * The outro already says plays, games and nights. The fourth line exists to add
 * an axis those three do not have, so the tests are mostly about what it
 * refuses to say.
 */

const statsWith = (stats: Stat[]): WrappedStats => ({
  playerId: 4,
  playerName: 'Tina',
  rangeLabel: '2026',
  rangeFrom: '2026-01-01',
  rangeTo: '2026-12-31',
  stats,
  thin: false,
});

const TOTALS: Stat = { id: 'totalPlays', core: true, plays: 233, nights: 73, distinctGames: 71 };

const TIME: Stat = {
  id: 'timePlayed',
  core: true,
  minutes: 6852,
  playsCounted: 229,
  playsMissing: 4,
  topGame: null,
};

const PEOPLE: Stat = { id: 'coPlayerCount', core: false, count: 60 };
const RATE: Stat = { id: 'winRate', core: true, wins: 61, losses: 161, ratio: 61 / 222, coopOnly: false };
const WHERE: Stat = { id: 'topLocation', core: true, name: 'Home', nights: 40 };

describe('outroFactFor', () => {
  it('prefers hours, the one unit the three numbers do not use', () => {
    expect(outroFactFor(statsWith([TOTALS, TIME, PEOPLE, RATE, WHERE]))).toBe('114 h at the table');
  });

  it('falls back to people when there are no hours', () => {
    expect(outroFactFor(statsWith([TOTALS, PEOPLE, RATE, WHERE]))).toBe('with 60 people');
  });

  it('falls back to how the year went, then to where it happened', () => {
    expect(outroFactFor(statsWith([TOTALS, RATE, WHERE]))).toBe('27% of them won');
    expect(outroFactFor(statsWith([TOTALS, WHERE]))).toBe('mostly at Home');
  });

  it('never repeats plays, games or nights', () => {
    // The whole point. Whatever it says, it must not be one of the three
    // numbers printed directly above it.
    for (const extra of [TIME, PEOPLE, RATE, WHERE]) {
      const line = outroFactFor(statsWith([TOTALS, extra]))!;
      expect(line).not.toMatch(/\bplays\b/);
      expect(line).not.toMatch(/\bgames\b/);
      expect(line).not.toMatch(/\bnights\b/);
      expect(line).not.toContain('233');
      expect(line).not.toContain('71');
      expect(line).not.toContain('73');
    }
  });

  it('does not offer new games learned, which is the same axis twice', () => {
    // "34 new games" beside "71 games" invites arithmetic the card cannot
    // support, so gamesLearned is not a candidate at all.
    const learned: Stat = {
      id: 'gamesLearned',
      core: true,
      count: 34,
      games: [],
    };
    expect(outroFactFor(statsWith([TOTALS, learned]))).toBeNull();
  });

  it('calls a co-op year something other than a win rate', () => {
    const coop: Stat = { id: 'winRate', core: true, wins: 8, losses: 2, ratio: 0.8, coopOnly: true };
    expect(outroFactFor(statsWith([TOTALS, coop]))).toBe('80% of them beaten');
  });

  it('says nothing rather than something empty', () => {
    expect(outroFactFor(statsWith([TOTALS]))).toBeNull();
    expect(outroFactFor(null)).toBeNull();
  });

  it('skips a win rate with no competitive plays behind it', () => {
    const none: Stat = { id: 'winRate', core: true, wins: 0, losses: 0, ratio: 0, coopOnly: false };
    expect(outroFactFor(statsWith([TOTALS, none, WHERE]))).toBe('mostly at Home');
  });

  it('reads naturally for a year with exactly one other person', () => {
    const one: Stat = { id: 'coPlayerCount', core: false, count: 1 };
    expect(outroFactFor(statsWith([TOTALS, one]))).toBe('with one other person');
  });
});
