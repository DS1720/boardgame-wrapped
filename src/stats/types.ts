export type SlideId =
  | 'totalPlays'
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
  | 'highestScore';

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
  | (StatBase & { id: 'topGame'; game: GameRef; plays: number })
  | (StatBase & { id: 'topFive'; games: Array<GameRef & { plays: number }> })
  | (StatBase & { id: 'winRate'; wins: number; losses: number; ratio: number; coopOnly: boolean })
  | (StatBase & { id: 'topCoPlayer'; name: string; playerId: number; shared: number })
  | (StatBase & { id: 'nemesis'; name: string; playerId: number; lossesTo: number; headToHead: number })
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
  | (StatBase & { id: 'highestScore'; score: number; game: GameRef; day: string });

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
