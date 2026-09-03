export type SlideId =
  | 'totalPlays'
  | 'timePlayed'
  | 'topFiveByTime'
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
  | 'gameRecord'
  | 'topMechanics'
  | 'topThemes'
  | 'topPublishers'
  | 'topDesigners'
  | 'topArtists'
  | 'topTheme'
  | 'topMechanic';

/**
 * The five slides built from BGG credits.
 *
 * One shape, five fields. They are listed separately in `SlideId` because the
 * cut, the picker and the component registry all key on it, but everything
 * downstream of `creditStat` treats them identically.
 */
export type CreditStatId =
  | 'topMechanics'
  | 'topThemes'
  | 'topPublishers'
  | 'topDesigners'
  | 'topArtists';

/**
 * The two hero credit slides: one theme, one mechanic, each with the games that
 * earned it.
 *
 * The list slides say a theme came up 39 times. These answer the question that
 * invites and the list cannot: *which games were those?*
 */
export type LeadCreditStatId = 'topTheme' | 'topMechanic';

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

/** One row of a credit slide: a name, what it is worth, and why it earned a cover. */
export interface CreditEntry {
  /** As BGG spells it. */
  name: string;
  /** Plays in range whose game carries this name. This is the ranking value. */
  plays: number;
  /**
   * Distinct games in range carrying it.
   *
   * Not the ranking — the eligibility filter reads it, and the slide shows it
   * beside the play count on the people-shaped slides, where "31 plays across
   * 2 games" is a different claim from "31 plays across 8".
   */
  games: number;
  /**
   * A game of the player's carrying this name — the most-played one, unless a
   * higher row already took that cover.
   *
   * The slide draws its cover on the row, so it is the reason the name is on
   * the list rather than an illustration chosen to fill the space. See
   * `coverFor` for why the de-duplication is there: four of Tina's five top
   * mechanics are led by the same game, and five copies of one cover reads as
   * a bug rather than as a fact.
   */
  topGame: GameRef;
}

/** The shared shape of the two hero credit stats. */
export type LeadCreditStat<Id extends LeadCreditStatId> = StatBase & {
  id: Id;
  /** The credit itself — "Deduction", "Hand Management". */
  name: string;
  /** Plays in range whose game carried it. */
  plays: number;
  /** Distinct games that carried it. Usually more than `examples` holds. */
  games: number;
  /**
   * The games that earned it, most-played first, capped at six.
   *
   * Six fills a 3x2 grid without a ragged bottom row, the same reason the outro
   * takes six from a top five. `games` is the honest total, so a slide showing
   * six of thirteen can say so.
   */
  examples: Array<GameRef & { plays: number }>;
  coverage: number;
};

/** The shared shape of all five credit stats. */
export type CreditStat<Id extends CreditStatId> = StatBase & {
  id: Id;
  entries: CreditEntry[];
  /**
   * Share of the player's plays that resolved to a BGG entry.
   *
   * Kept on the stat so the inspector can show how much of the year the list
   * actually saw, the way `timePlayed` reports `playsMissing`.
   */
  coverage: number;
};

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
  | (StatBase & {
      id: 'topGame';
      game: GameRef;
      plays: number;
      /**
       * Where the player ranks among everyone who played this game in range.
       *
       * Null when the pool is too small for a percentage to mean anything —
       * one in four is "top 25%", which reads as worse than the first place it
       * actually is. See `MIN_STANDING_POOL`.
       */
      standing: { rank: number; players: number } | null;
    })
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
  | (StatBase & {
      id: 'topFiveByTime';
      /** Ranked by estimated minutes, which is not the same order as by plays. */
      games: Array<GameRef & { minutes: number; plays: number }>;
    })
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
    })
  | CreditStat<'topMechanics'>
  | CreditStat<'topThemes'>
  | CreditStat<'topPublishers'>
  | CreditStat<'topDesigners'>
  | CreditStat<'topArtists'>
  | LeadCreditStat<'topTheme'>
  | LeadCreditStat<'topMechanic'>;

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
