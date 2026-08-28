export type SlideId =
  | 'totalPlays'
  | 'timePlayed'
  | 'topGame'
  | 'topFive'
  | 'winRate'
  | 'topCoPlayer'
  | 'nemesis'
  | 'gamesLearned'
  | 'topLocation'
  | 'bestGame'
  | 'worstGame'
  | 'longestWinStreak'
  | 'busiestDay'
  | 'coPlayerCount'
  | 'firstAndLastPlay'
  | 'nightOwl'
  | 'groupShare'
  | 'highestScore'
  | 'gameRecord';

export interface GameRef {
  gameId: number;
  name: string;
  boxArt: string | null;
  bggId: number;
}

export interface StatBase {
  id: SlideId;
  core: boolean;
}

export type Stat =
  | (StatBase & { id: 'totalPlays'; plays: number; nights: number; distinctGames: number })
  | (StatBase & {
      id: 'timePlayed';
      /** Estimated total, in minutes. */
      minutes: number;
      /** Plays that had a stated game length and so contributed to the total. */
      playsCounted: number;
      /** Plays skipped because their game has no stated length. */
      playsMissing: number;
      /** The game the most estimated time went into — not always the most played. */
      topGame: (GameRef & { minutes: number; plays: number }) | null;
    })
  | (StatBase & { id: 'topGame'; game: GameRef; plays: number })
  | (StatBase & {
      id: 'gameRecord';
      game: GameRef;
      /** The record score itself. */
      score: number;
      /** Plays of this game in range — why this game was the one chosen. */
      plays: number;
      /** How many *other* games they also hold the record in. */
      otherRecords: number;
      /** Players who put a score on the board in this game. The "best of N". */
      contenders: number;
      /** False when the game is scored lowest-wins, so the slide can say so. */
      highestWins: boolean;
      /** True when someone else matched the score exactly. */
      shared: boolean;
    })
  | (StatBase & {
      id: 'topFive';
      /**
       * Up to **six** games, despite the name. The Top Five slide shows five;
       * the outro grid shows six so it fills a 3x2 without a hole in it.
       */
      games: Array<GameRef & { plays: number }>;
    })
  | (StatBase & { id: 'winRate'; wins: number; losses: number; ratio: number; coopOnly: boolean })
  | (StatBase & {
      id: 'topCoPlayer';
      name: string;
      playerId: number;
      shared: number;
      /** The top five, including the one named above, for the slide's list. */
      others: Array<{ playerId: number; name: string; shared: number }>;
    })
  | (StatBase & {
      id: 'nemesis';
      name: string;
      playerId: number;
      lossesTo: number;
      headToHead: number;
      /** `lossesTo / headToHead`. This is what the nemesis is ranked by. */
      lossRate: number;
    })
  | (StatBase & { id: 'gamesLearned'; count: number; games: GameRef[] })
  | (StatBase & { id: 'topLocation'; name: string; nights: number })
  | (StatBase & { id: 'bestGame'; game: GameRef; ratio: number; plays: number })
  | (StatBase & { id: 'worstGame'; game: GameRef; ratio: number; plays: number })
  | (StatBase & { id: 'longestWinStreak'; length: number })
  | (StatBase & { id: 'busiestDay'; day: string; plays: number })
  | (StatBase & { id: 'coPlayerCount'; count: number })
  | (StatBase & { id: 'firstAndLastPlay'; first: { day: string; game: GameRef }; last: { day: string; game: GameRef } })
  | (StatBase & { id: 'nightOwl'; peakHour: number; playsAtPeak: number; lateShare: number })
  | (StatBase & { id: 'groupShare'; ratio: number; attended: number; total: number })
  | (StatBase & {
      id: 'highestScore';
      score: number;
      game: GameRef;
      day: string;
      /**
       * True when this score came from a game the player won.
       *
       * The slide says so, because "your best score" and "your best score in a
       * game you actually won" are different claims and only one of them is
       * worth boasting about.
       */
      won: boolean;
    });

export interface WrappedStats {
  playerId: number;
  playerName: string;
  rangeLabel: string;
  rangeFrom: string;
  rangeTo: string;
  /** Only non-null modules, in slide order. */
  stats: Stat[];
  thin: boolean;
}
