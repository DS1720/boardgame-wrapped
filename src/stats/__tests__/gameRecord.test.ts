import { describe, expect, it } from 'vitest';
import { buildDataset } from '@/ingest/parse';
import { yearRange } from '@/ingest/select';
import { buildContext } from '../context';
import { gameRecord } from '../modules/optional';
import type { RawExport } from '@/shared/types';
import { game, play, score } from './fixtures';

/**
 * "Record" means the best score of anyone who played that game in range — not
 * the player's own best, which is what `highestScore` reports. The tests that
 * matter are the ones that stop it claiming a record that is not one.
 */

const ME = 1;
const RIVAL = 2;
const THIRD = 3;

const build = (games: ReturnType<typeof game>[], plays: ReturnType<typeof play>[]): RawExport => ({
  players: [
    { id: ME, uuid: 'me', name: 'Ana', isAnonymous: false },
    { id: RIVAL, uuid: 'rival', name: 'Ben', isAnonymous: false },
    { id: THIRD, uuid: 'third', name: 'Cid', isAnonymous: false },
  ],
  games,
  locations: [{ id: 1, uuid: 'loc', name: 'Home' }],
  plays,
  userInfo: { meRefId: ME },
});

const run = (raw: RawExport, playerId = ME) => {
  const ds = buildDataset(raw);
  const stat = gameRecord(buildContext(ds, playerId, yearRange(2026)));
  return stat?.id === 'gameRecord' ? stat : null;
};

describe('gameRecord', () => {
  it('names the game whose best score this player holds', () => {
    const stat = run(
      build(
        [game(1, 'Azul')],
        [
          play('2026-01-05 20:00:00', 1, [
            score(ME, { score: 90, winner: true }),
            score(RIVAL, { score: 70 }),
          ]),
        ],
      ),
    )!;

    expect(stat.game.name).toBe('Azul');
    expect(stat.score).toBe(90);
    expect(stat.contenders).toBe(2);
    expect(stat.otherRecords).toBe(0);
    expect(stat.shared).toBe(false);
  });

  it('is null when somebody else holds it', () => {
    expect(
      run(
        build(
          [game(1, 'Azul')],
          [
            play('2026-01-05 20:00:00', 1, [
              score(ME, { score: 40 }),
              score(RIVAL, { score: 95, winner: true }),
            ]),
          ],
        ),
      ),
    ).toBeNull();
  });

  it('takes the lowest score in a game where the lowest wins', () => {
    // Without reading highestWins this names whoever did *worst*. Eight games
    // in the real export are scored this way.
    const raw = build(
      [game(1, 'Cabo', { highestWins: false })],
      [
        play('2026-01-05 20:00:00', 1, [
          score(ME, { score: 4, winner: true }),
          score(RIVAL, { score: 31 }),
        ]),
      ],
    );

    const mine = run(raw)!;
    expect(mine.score).toBe(4);
    expect(mine.highestWins).toBe(false);
    // And the player with the big number holds nothing.
    expect(run(raw, RIVAL)).toBeNull();
  });

  it('refuses a game only one person ever scored in', () => {
    // Not a record, just the only score on the board.
    expect(
      run(
        build(
          [game(1, 'Azul')],
          [play('2026-01-05 20:00:00', 1, [score(ME, { score: 90, winner: true })])],
        ),
      ),
    ).toBeNull();
  });

  it('ignores cooperative games, where the score belongs to the table', () => {
    expect(
      run(
        build(
          [game(1, 'Pandemic', { cooperative: true })],
          [
            play('2026-01-05 20:00:00', 1, [
              score(ME, { score: 90, winner: true }),
              score(RIVAL, { score: 70 }),
            ]),
          ],
        ),
      ),
    ).toBeNull();
  });

  it('ignores team games, where a teammate shares the number', () => {
    // The real case: three players each "held" Poetry for Neanderthals at 27,
    // because all three were on the winning team of the same play.
    expect(
      run(
        build(
          [game(1, 'Poetry for Neanderthals', { usesTeams: true })],
          [
            play('2026-01-05 20:00:00', 1, [
              score(ME, { score: 27, winner: true }),
              score(RIVAL, { score: 27, winner: true }),
              score(THIRD, { score: 12 }),
            ]),
          ],
        ),
      ),
    ).toBeNull();
  });

  it('marks a record somebody matched exactly as shared', () => {
    const stat = run(
      build(
        [game(1, 'Azul')],
        [
          play('2026-01-05 20:00:00', 1, [
            score(ME, { score: 90, winner: true }),
            score(RIVAL, { score: 90, winner: true }),
            score(THIRD, { score: 40 }),
          ]),
        ],
      ),
    )!;

    expect(stat.shared).toBe(true);
    expect(stat.contenders).toBe(3);
  });

  it('shows the record from the game played most, and counts the rest', () => {
    const stat = run(
      build(
        [game(1, 'Azul'), game(2, 'Cascadia')],
        [
          // One record in Cascadia, from a single play.
          play('2026-01-02 20:00:00', 2, [
            score(ME, { score: 120, winner: true }),
            score(RIVAL, { score: 80 }),
          ]),
          // Three plays of Azul, also a record.
          play('2026-01-05 20:00:00', 1, [
            score(ME, { score: 90, winner: true }),
            score(RIVAL, { score: 70 }),
          ]),
          play('2026-01-06 20:00:00', 1, [score(ME, { score: 55 }), score(RIVAL, { score: 60 })]),
          play('2026-01-07 20:00:00', 1, [score(ME, { score: 61 }), score(RIVAL, { score: 60 })]),
        ],
      ),
    )!;

    // A record in a game played three times says more than one played once.
    expect(stat.game.name).toBe('Azul');
    expect(stat.plays).toBe(3);
    expect(stat.otherRecords).toBe(1);
  });

  it('counts only this player’s plays when choosing between records', () => {
    const stat = run(
      build(
        [game(1, 'Azul'), game(2, 'Cascadia')],
        [
          play('2026-01-02 20:00:00', 1, [
            score(ME, { score: 90, winner: true }),
            score(RIVAL, { score: 70 }),
          ]),
          play('2026-01-03 20:00:00', 2, [
            score(ME, { score: 120, winner: true }),
            score(RIVAL, { score: 80 }),
          ]),
          play('2026-01-04 20:00:00', 2, [
            score(ME, { score: 99 }),
            score(RIVAL, { score: 80 }),
          ]),
          // Two more plays of Azul that this player was not at: they must not
          // count towards why Azul would be chosen.
          play('2026-01-05 20:00:00', 1, [score(RIVAL, { score: 30 }), score(THIRD, { score: 20 })]),
          play('2026-01-06 20:00:00', 1, [score(RIVAL, { score: 31 }), score(THIRD, { score: 21 })]),
        ],
      ),
    )!;

    expect(stat.game.name).toBe('Cascadia');
    expect(stat.plays).toBe(2);
  });

  it('is null when nobody wrote a score down', () => {
    expect(
      run(
        build(
          [game(1, 'Azul')],
          [
            play('2026-01-05 20:00:00', 1, [
              score(ME, { winner: true }),
              score(RIVAL),
            ]),
          ],
        ),
      ),
    ).toBeNull();
  });
});
