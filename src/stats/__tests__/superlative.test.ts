import { describe, expect, it } from 'vitest';
import type { Stat, WrappedStats } from '../types';
import { superlativeFor } from '../superlative';

const game = (gameId: number, name: string) => ({ gameId, name, boxArt: null, bggId: gameId });

const statsWith = (stats: Stat[]): WrappedStats => ({
  playerId: 1,
  playerName: 'Tina',
  rangeLabel: '2026',
  rangeFrom: '2026-01-01',
  rangeTo: '2026-12-31',
  stats,
  thin: false,
});

const totalPlays = (plays: number, nights = 40): Stat => ({
  id: 'totalPlays',
  core: true,
  plays,
  nights,
  distinctGames: 30,
});

describe('earning a superlative', () => {
  it('names a marathon year', () => {
    const result = superlativeFor(statsWith([totalPlays(504)]));
    expect(result?.id).toBe('marathon');
    expect(result?.line).toContain('504 plays');
  });

  it('names an explorer', () => {
    const result = superlativeFor(
      statsWith([totalPlays(120), { id: 'gamesLearned', core: true, count: 52, games: [] }]),
    );
    expect(result?.id).toBe('explorer');
    expect(result?.line).toContain('52 games learned');
  });

  it('names a nemesis that really had their number', () => {
    const result = superlativeFor(
      statsWith([
        totalPlays(60),
        {
          id: 'nemesis',
          core: true,
          name: 'Albin',
          playerId: 2,
          lossesTo: 8,
          headToHead: 10,
          lossRate: 0.8,
        },
      ]),
    );
    expect(result?.id).toBe('haunted');
    expect(result?.line).toBe('Albin had your number all year.');
  });
});

describe('claims that have to be earned', () => {
  it('says nothing for an ordinary year', () => {
    const result = superlativeFor(
      statsWith([
        totalPlays(17),
        { id: 'gamesLearned', core: true, count: 9, games: [] },
        { id: 'longestWinStreak', core: false, length: 2 },
      ]),
    );
    // The median player in the real export looks like this. A line here would
    // be a caption, not a superlative.
    expect(result).toBeNull();
  });

  // The bug this guards: without a play-count floor the claim fired for 44 of
  // 93 real players, because three of six plays clears "half the year".
  it('does not call six plays a devotion to one game', () => {
    const result = superlativeFor(
      statsWith([totalPlays(6), { id: 'topGame', core: true, game: game(1, 'Faraway'), plays: 4 }]),
    );
    expect(result).toBeNull();
  });

  it('does call it that when the sample is real', () => {
    const result = superlativeFor(
      statsWith([totalPlays(60), { id: 'topGame', core: true, game: game(1, 'Faraway'), plays: 36 }]),
    );
    expect(result?.id).toBe('loyalist');
    expect(result?.line).toContain('Faraway');
  });

  it('does not call four late nights out of five a habit', () => {
    const result = superlativeFor(
      statsWith([
        totalPlays(5),
        { id: 'nightOwl', core: false, peakHour: 23, playsAtPeak: 3, lateShare: 0.8 },
      ]),
    );
    expect(result).toBeNull();
  });

  it('does not call a perfect record over three games a record', () => {
    const result = superlativeFor(
      statsWith([totalPlays(3), { id: 'winRate', core: true, wins: 3, losses: 0, ratio: 1, coopOnly: false }]),
    );
    expect(result).toBeNull();
  });

  it('needs enough head-to-heads before naming a nemesis', () => {
    const result = superlativeFor(
      statsWith([
        totalPlays(40),
        { id: 'nemesis', core: true, name: 'X', playerId: 2, lossesTo: 3, headToHead: 3, lossRate: 1 },
      ]),
    );
    expect(result).toBeNull();
  });
});

describe('choosing between several', () => {
  it('picks the trait furthest into its own tail', () => {
    // 504 plays is the very top of the range; 33 learned games only just clears
    // its bar. Raw values are not comparable, so the normalised score decides.
    const result = superlativeFor(
      statsWith([totalPlays(504), { id: 'gamesLearned', core: true, count: 33, games: [] }]),
    );
    expect(result?.id).toBe('marathon');
  });

  it('picks the other way round when the shares reverse', () => {
    const result = superlativeFor(
      statsWith([totalPlays(101), { id: 'gamesLearned', core: true, count: 89, games: [] }]),
    );
    expect(result?.id).toBe('explorer');
  });

  it('is deterministic', () => {
    const stats = statsWith([
      totalPlays(300),
      { id: 'gamesLearned', core: true, count: 60, games: [] },
      { id: 'coPlayerCount', core: false, count: 50 },
    ]);
    expect(superlativeFor(stats)).toEqual(superlativeFor(stats));
  });

  it('scores within 0 and 1', () => {
    const result = superlativeFor(statsWith([totalPlays(9999)]));
    expect(result?.score).toBeLessThanOrEqual(1);
    expect(result?.score).toBeGreaterThanOrEqual(0);
  });
});

describe('degenerate input', () => {
  it('handles no stats and no player', () => {
    expect(superlativeFor(null)).toBeNull();
    expect(superlativeFor(statsWith([]))).toBeNull();
  });

  it('does not divide by zero for a player with no plays', () => {
    const result = superlativeFor(
      statsWith([totalPlays(0, 0), { id: 'topGame', core: true, game: game(1, 'X'), plays: 0 }]),
    );
    expect(result).toBeNull();
  });
});
