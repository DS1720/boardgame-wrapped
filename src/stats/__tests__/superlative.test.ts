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
  it('awards no earned claim for an ordinary year', () => {
    const result = superlativeFor(
      statsWith([
        totalPlays(17),
        { id: 'gamesLearned', core: true, count: 9, games: [] },
        { id: 'longestWinStreak', core: false, length: 2 },
      ]),
    );
    // The median player in the real export looks like this. A *claim* here
    // would be a caption. With none of the fallback stats present either, there
    // is nothing truthful left to say.
    expect(result).toBeNull();
  });

  // The bug this guards: without a play-count floor the claim fired for 44 of
  // 93 real players, because three of six plays clears "half the year".
  it('does not call six plays a devotion to one game', () => {
    const result = superlativeFor(
      statsWith([totalPlays(6), { id: 'topGame', core: true, game: game(1, 'Faraway'), plays: 4, standing: null }]),
    );
    // The claim is refused. A plain fact about the same game is not the same
    // sentence: "Faraway more than anything else" is true of four of six plays,
    // where "Half the year was Faraway" is a statement about the year.
    expect(result?.id).not.toBe('loyalist');
    expect(result?.id).toBe('favourite');
    expect(result?.score).toBe(0);
  });

  it('does call it that when the sample is real', () => {
    const result = superlativeFor(
      statsWith([totalPlays(60), { id: 'topGame', core: true, game: game(1, 'Faraway'), plays: 36, standing: null }]),
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
    // "had your number all year" needs the sample the threshold asks for. The
    // fallback still names them, but as a fact rather than a verdict.
    expect(result?.id).not.toBe('haunted');
    expect(result?.id).toBe('rival');
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
      statsWith([totalPlays(0, 0), { id: 'topGame', core: true, game: game(1, 'X'), plays: 0, standing: null }]),
    );
    // No earned claim, no NaN, and whatever comes back is a real sentence.
    expect(result?.id).not.toBe('loyalist');
    expect(Number.isFinite(result?.score ?? 0)).toBe(true);
    expect(result?.line ?? '').not.toContain('NaN');
  });
});

describe('every player gets a sentence', () => {
  const ORDINARY = [totalPlays(17), { id: 'topGame', core: true, game: game(1, 'Azul'), plays: 4, standing: null }] as Stat[];

  it('gives an unremarkable year a fact instead of a blank', () => {
    const result = superlativeFor(statsWith(ORDINARY));
    expect(result?.line).toBe('Azul more than anything else.');
  });

  it('marks a fact as unranked, so it is never compared against a claim', () => {
    expect(superlativeFor(statsWith(ORDINARY))?.score).toBe(0);
  });

  it('prefers what a player was good at over what they played most', () => {
    const result = superlativeFor(
      statsWith([
        ...ORDINARY,
        { id: 'bestGame', core: false, game: game(2, 'Codenames'), ratio: 0.67, plays: 3 },
      ]),
    );
    expect(result?.id).toBe('bestAt');
    expect(result?.line).toContain('Codenames');
  });

  it('still prefers an earned claim over any fact', () => {
    const result = superlativeFor(
      statsWith([
        totalPlays(60),
        { id: 'topGame', core: true, game: game(1, 'Faraway'), plays: 36, standing: null },
        { id: 'bestGame', core: false, game: game(2, 'Codenames'), ratio: 0.9, plays: 10 },
      ]),
    );
    expect(result?.id).toBe('loyalist');
  });

  it('does not echo the fact printed above it', () => {
    // "The regular table was Home." under "mostly at Home" is the same sentence
    // twice, so the place fallback is skipped and the next one is used.
    const withPlace: Stat[] = [
      totalPlays(17),
      { id: 'topLocation', core: true, name: 'Home', nights: 9 },
      { id: 'busiestDay', core: false, day: '2026-08-25', plays: 5 },
    ];
    expect(superlativeFor(statsWith(withPlace))?.id).toBe('venue');
    expect(superlativeFor(statsWith(withPlace), { avoid: ['place'] })?.id).toBe('bigDay');
  });

  it('finds something for a player with only bookends to their name', () => {
    const result = superlativeFor(
      statsWith([
        totalPlays(2),
        {
          id: 'firstAndLastPlay',
          core: false,
          first: { day: '2026-01-01', game: game(1, 'Azul') },
          last: { day: '2026-12-30', game: game(2, 'Hitster') },
        },
      ]),
    );
    expect(result?.line).toBe('Opened with Azul, closed with Hitster.');
  });
});

describe('not saying what the card already says', () => {
  const BUSY: Stat = { id: 'totalPlays', core: true, plays: 504, nights: 180, distinctGames: 106 };
  const LEARNED: Stat = {
    id: 'gamesLearned',
    core: true,
    count: 62,
    games: [],
  };
  const PEOPLE: Stat = { id: 'coPlayerCount', core: false, count: 60 };

  it('offers the plays line when nothing is showing plays', () => {
    expect(superlativeFor(statsWith([BUSY]))?.id).toBe('marathon');
  });

  it('refuses it once the surface says it is already showing plays', () => {
    // The complaint this fixes: "504 plays. Never off the table." printed
    // directly under "504 plays · 106 games · 180 nights".
    const result = superlativeFor(statsWith([BUSY]), { avoid: ['plays'] });
    expect(result).toBeNull();
  });

  it('falls through to a claim on another axis rather than going silent', () => {
    const result = superlativeFor(statsWith([BUSY, LEARNED]), { avoid: ['plays'] });
    expect(result?.id).toBe('explorer');
    // And excluding that one too keeps falling through.
    expect(superlativeFor(statsWith([BUSY, LEARNED]), { avoid: ['plays', 'games'] })).toBeNull();
  });

  it('drops the people line when the fact above already counted them', () => {
    // "Played with 60 different people." under "with 60 people" is the same
    // sentence twice.
    expect(superlativeFor(statsWith([BUSY, PEOPLE]), { avoid: ['plays'] })?.id).toBe('social');
    expect(superlativeFor(statsWith([BUSY, PEOPLE]), { avoid: ['plays', 'people'] })).toBeNull();
  });

  it('leaves claims that name a thing rather than count one', () => {
    // "Half the year was X" and "N% began after dark" are not counts of plays,
    // games or nights, so excluding those quantities must not remove them.
    const loyal: Stat[] = [
      { id: 'totalPlays', core: true, plays: 60, nights: 30, distinctGames: 10 },
      { id: 'topGame', core: true, game: game(1, 'Faraway'), plays: 40, standing: null },
    ];
    expect(superlativeFor(statsWith(loyal), { avoid: ['plays', 'games', 'nights', 'hours'] })?.id).toBe(
      'loyalist',
    );
  });

  it('ignores blanks in the avoid list, so a missing quantity is harmless', () => {
    const withNothingToAvoid = superlativeFor(statsWith([BUSY]), { avoid: [undefined, null] });
    expect(withNothingToAvoid?.id).toBe('marathon');
  });
});
