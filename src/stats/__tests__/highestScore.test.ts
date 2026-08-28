import { describe, expect, it } from 'vitest';
import { buildDataset } from '@/ingest/parse';
import { yearRange } from '@/ingest/select';
import { buildContext } from '../context';
import { highestScore } from '../modules/optional';
import type { RawExport } from '@/shared/types';
import { game, play, score } from './fixtures';

/**
 * A winning score beats a losing one however much smaller it is. That is the
 * whole rule, and most of these tests are about it holding in the cases where
 * it costs something — a 66,000-point loss really does lose to a 466-point win.
 */

const ME = 1;
const RIVAL = 2;

const build = (games: ReturnType<typeof game>[], plays: ReturnType<typeof play>[]): RawExport => ({
  players: [
    { id: ME, uuid: 'me', name: 'Ana', isAnonymous: false },
    { id: RIVAL, uuid: 'rival', name: 'Ben', isAnonymous: false },
  ],
  games,
  locations: [{ id: 1, uuid: 'loc', name: 'Home' }],
  plays,
  userInfo: { meRefId: ME },
});

const run = (raw: RawExport) => {
  const stat = highestScore(buildContext(buildDataset(raw), ME, yearRange(2026)));
  return stat?.id === 'highestScore' ? stat : null;
};

const GAMES = [game(1, 'Azul'), game(2, 'La Cosa Nostra')];

describe('highestScore', () => {
  it('takes a winning score over a much larger losing one', () => {
    // The case from the real export: 66,000 in a game that was lost, against
    // 466 in one that was won.
    const stat = run(
      build(GAMES, [
        play('2026-01-05 20:00:00', 2, [
          score(ME, { score: 66000 }),
          score(RIVAL, { score: 70000, winner: true }),
        ]),
        play('2026-02-05 20:00:00', 1, [
          score(ME, { score: 466, winner: true }),
          score(RIVAL, { score: 400 }),
        ]),
      ]),
    )!;

    expect(stat.score).toBe(466);
    expect(stat.game.name).toBe('Azul');
    expect(stat.won).toBe(true);
  });

  it('takes the best of several winning scores', () => {
    const stat = run(
      build(GAMES, [
        play('2026-01-05 20:00:00', 1, [score(ME, { score: 90, winner: true })]),
        play('2026-02-05 20:00:00', 2, [score(ME, { score: 140, winner: true })]),
        play('2026-03-05 20:00:00', 1, [score(ME, { score: 120, winner: true })]),
      ]),
    )!;

    expect(stat.score).toBe(140);
    expect(stat.won).toBe(true);
  });

  it('falls back to the best losing score when nothing was won', () => {
    const stat = run(
      build(GAMES, [
        play('2026-01-05 20:00:00', 1, [
          score(ME, { score: 40 }),
          score(RIVAL, { score: 95, winner: true }),
        ]),
        play('2026-02-05 20:00:00', 2, [
          score(ME, { score: 88 }),
          score(RIVAL, { score: 99, winner: true }),
        ]),
      ]),
    )!;

    expect(stat.score).toBe(88);
    // And it says so, because this is not the same claim as the one above.
    expect(stat.won).toBe(false);
  });

  it('ignores wins that carry no score at all', () => {
    // A win with no number on it cannot be "your best score", so the losing
    // score with a number stands.
    const stat = run(
      build(GAMES, [
        play('2026-01-05 20:00:00', 1, [score(ME, { winner: true })]),
        play('2026-02-05 20:00:00', 2, [score(ME, { score: 55 })]),
      ]),
    )!;

    expect(stat.score).toBe(55);
    expect(stat.won).toBe(false);
  });

  it('breaks a tie towards the earlier play', () => {
    // The project's rule, and what keeps one export producing one video.
    const stat = run(
      build(GAMES, [
        play('2026-01-05 20:00:00', 1, [score(ME, { score: 100, winner: true })]),
        play('2026-06-05 20:00:00', 2, [score(ME, { score: 100, winner: true })]),
      ]),
    )!;

    expect(stat.game.name).toBe('Azul');
    expect(stat.day).toBe('2026-01-05');
  });

  it('is null when nothing was scored', () => {
    expect(
      run(build(GAMES, [play('2026-01-05 20:00:00', 1, [score(ME, { winner: true })])])),
    ).toBeNull();
  });

  it('counts a co-op win, where everyone won', () => {
    const stat = run(
      build(
        [game(1, 'Pandemic', { cooperative: true })],
        [
          play('2026-01-05 20:00:00', 1, [
            score(ME, { score: 12, winner: true }),
            score(RIVAL, { score: 12, winner: true }),
          ]),
        ],
      ),
    )!;
    expect(stat.won).toBe(true);
    expect(stat.score).toBe(12);
  });

  it('still means the largest number, not the best result', () => {
    // Deliberately does not read `highestWins`. "Highest score" says what it
    // means; `gameRecord` is the stat where best has to mean best.
    const stat = run(
      build(
        [game(1, 'Cabo', { highestWins: false })],
        [
          play('2026-01-05 20:00:00', 1, [score(ME, { score: 4, winner: true })]),
          play('2026-02-05 20:00:00', 1, [score(ME, { score: 31, winner: true })]),
        ],
      ),
    )!;
    expect(stat.score).toBe(31);
  });
});
