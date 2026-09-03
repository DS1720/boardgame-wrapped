import type { RawExport, RawGame, RawPlay, RawPlayerScore } from '@/shared/types';
import type { BggEntry, BggIndex } from '@/shared/bgg';

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

/**
 * A BGG index for the small export's three games.
 *
 * Keyed by `bggId`, which `game()` sets to `1000 + id` — so Azul is 1010,
 * Cascadia 1011 and Pandemic 1012.
 *
 * The credits are chosen to exercise the rules rather than to be accurate:
 * "Azul Only" and "Solo Only" appear on one game each so the distinct-games
 * filter has something to drop, the two "Shared"/"Second" names span two games
 * each so it has something to keep — and two of them, so the list clears
 * `MIN_CREDIT_ENTRIES` — and `(Uncredited)` is there so the placeholder filter
 * has something to remove. Publishers deliberately have only one eligible name,
 * so the "fewer than two entries" path is covered too.
 */
export const bggFixture = (over: Partial<Record<number, Partial<BggEntry>>> = {}): BggIndex => {
  const entry = (bggId: number, name: string, fields: Partial<BggEntry>): BggEntry => ({
    bggId,
    name,
    mechanics: [],
    categories: [],
    designers: [],
    artists: [],
    publisher: null,
    fetchedAt: '2026-01-01T00:00:00.000Z',
    ...fields,
    ...(over[bggId] ?? {}),
  });

  return new Map([
    [
      1010,
      entry(1010, 'Azul', {
        mechanics: ['Tile Placement', 'Set Collection'],
        categories: ['Abstract Strategy', 'Fantasy'],
        designers: ['Shared Designer', 'Azul Only'],
        artists: ['Shared Artist', 'Second Artist'],
        publisher: 'Shared Publisher',
      }),
    ],
    [
      1011,
      entry(1011, 'Cascadia', {
        mechanics: ['Tile Placement', 'Solo Only'],
        categories: ['Animals', 'Card Game'],
        designers: ['Shared Designer', 'Second Designer'],
        artists: ['Shared Artist', '(Uncredited)'],
        publisher: 'Shared Publisher',
      }),
    ],
    [
      1012,
      entry(1012, 'Pandemic', {
        mechanics: ['Cooperative Game'],
        categories: ['Medical'],
        designers: ['Second Designer', 'Pandemic Only'],
        artists: ['Second Artist', '(Uncredited)'],
        publisher: 'Lonely Publisher',
      }),
    ],
  ]);
};
