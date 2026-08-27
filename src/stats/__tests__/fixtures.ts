import type { RawExport, RawGame, RawPlay, RawPlayerScore } from '@/shared/types';

let uuidCounter = 0;
const uuid = () => `fixture-${(uuidCounter += 1)}`;

export const game = (id: number, name: string, over: Partial<RawGame> = {}): RawGame => ({
  id,
  uuid: uuid(),
  name,
  cooperative: false,
  highestWins: true,
  noPoints: false,
  usesTeams: false,
  urlImage: `https://example.test/${id}.png`,
  urlThumb: `https://example.test/${id}-thumb.png`,
  bggId: 1000 + id,
  ...over,
});

export const score = (
  playerRefId: number,
  over: Partial<RawPlayerScore> = {},
): RawPlayerScore => ({
  score: null,
  winner: false,
  newPlayer: false,
  playerRefId,
  role: '',
  teamRole: '',
  team: '0',
  ...over,
});

export const play = (
  playDate: string,
  gameRefId: number,
  playerScores: RawPlayerScore[],
  over: Partial<RawPlay> = {},
): RawPlay => ({
  uuid: uuid(),
  playDate,
  durationMin: 0,
  ignored: false,
  usesTeams: false,
  locationRefId: 1,
  gameRefId,
  playerScores,
  ...over,
});

/**
 * Five plays, three players, two games, one coop game.
 * Player 1 (Ana): 5 plays, 2 wins in 4 competitive plays.
 * Player 2 (Ben): 4 plays, beats Ana twice.
 * Player 3 (Cid): 2 plays.
 */
export const smallExport = (): RawExport => ({
  players: [
    { id: 1, uuid: uuid(), name: 'Ana', isAnonymous: false },
    { id: 2, uuid: uuid(), name: 'Ben', isAnonymous: false },
    { id: 3, uuid: uuid(), name: 'Cid', isAnonymous: false },
  ],
  games: [
    game(10, 'Azul'),
    game(11, 'Cascadia'),
    game(12, 'Pandemic', { cooperative: true }),
  ],
  locations: [
    { id: 1, uuid: uuid(), name: 'Kitchen table' },
    { id: 2, uuid: uuid(), name: 'Club' },
  ],
  plays: [
    play('2026-01-10 20:00:00', 10, [
      score(1, { winner: true, score: 88, newPlayer: true }),
      score(2, { score: 71 }),
    ]),
    play('2026-01-10 22:30:00', 10, [score(1, { score: 60 }), score(2, { winner: true, score: 75 })]),
    play('2026-02-01 21:00:00', 10, [score(1, { score: 55 }), score(2, { winner: true, score: 90 })]),
    play('2026-03-05 19:00:00', 11, [
      score(1, { winner: true }),
      score(2),
      score(3, { newPlayer: true }),
    ], { locationRefId: 2 }),
    play('2026-04-02 23:15:00', 12, [score(1, { winner: true }), score(3, { winner: true })], {
      locationRefId: 2,
    }),
    play('2026-05-05 20:00:00', 11, [score(2, { winner: true }), score(3)], { ignored: true }),
  ],
  userInfo: { meRefId: 1, exportDate: '2026-08-26 18:16:46' },
});
