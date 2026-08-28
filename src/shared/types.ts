/** Raw shapes as they appear in a BG Stats JSON export. Only the fields we use. */
export interface RawPlayer {
  id: number;
  uuid: string;
  name: string;
  isAnonymous: boolean;
}

export interface RawGame {
  id: number;
  uuid: string;
  name: string;
  cooperative: boolean;
  highestWins: boolean;
  noPoints: boolean;
  usesTeams: boolean;
  urlImage: string;
  urlThumb: string;
  bggId: number;
  /**
   * BGG's stated play time in minutes. Absent on games never matched to BGG.
   * These are the only duration figures in the export that mean anything —
   * every play's own `durationMin` is 0.
   */
  minPlayTime?: number;
  maxPlayTime?: number;
}

export interface RawLocation {
  id: number;
  uuid: string;
  name: string;
}

export interface RawPlayerScore {
  score: string | number | null;
  winner: boolean;
  newPlayer: boolean;
  playerRefId: number;
  role: string;
  teamRole: string;
  team: string;
}

export interface RawPlay {
  uuid: string;
  playDate: string; // "YYYY-MM-DD HH:mm:ss"
  durationMin: number;
  ignored: boolean;
  usesTeams: boolean;
  locationRefId: number;
  gameRefId: number;
  playerScores: RawPlayerScore[];
}

export interface RawExport {
  players: RawPlayer[];
  games: RawGame[];
  locations: RawLocation[];
  plays: RawPlay[];
  userInfo?: { meRefId?: number; exportDate?: string };
}

/** Normalized shapes used by everything downstream. */
export interface Participant {
  playerId: number;
  name: string;
  won: boolean;
  /** null when the play has no numeric score for this participant */
  score: number | null;
  isNew: boolean;
  team: string;
  teamRole: string;
}

export interface NormalizedPlay {
  uuid: string;
  date: Date;
  /** local calendar day, "YYYY-MM-DD" — used for "game nights" */
  day: string;
  hour: number;
  gameId: number;
  gameName: string;
  cooperative: boolean;
  /**
   * Whether the best score in this game is the highest one.
   *
   * Eight games in the real export are lowest-wins — Cabo, Cambio, Second
   * Chance and friends — so anything that asks "who did best" has to read this
   * or it names the worst player in those games. Defaults to true, which is
   * what BG Stats means by an absent flag.
   */
  highestWins: boolean;
  /**
   * Whether this game is played in teams.
   *
   * Teammates share a score, so a team game's best number is not any one
   * player's achievement. Poetry for Neanderthals is the case that found this:
   * three different players each "held the record" at 27, because all three
   * were on the winning team of the same play.
   */
  usesTeams: boolean;
  boxArt: string | null;
  bggId: number;
  locationId: number | null;
  locationName: string | null;
  /**
   * Estimated length of this play in minutes, from the game's BGG play time.
   * Null when the game has no stated time — roughly 1% of plays.
   *
   * This is an estimate and is never presented as anything else. BG Stats does
   * not record how long a play actually took.
   */
  estimatedMinutes: number | null;
  participants: Participant[];
}

export interface Dataset {
  plays: NormalizedPlay[];
  playersById: Map<number, RawPlayer>;
  gamesById: Map<number, RawGame>;
  locationsById: Map<number, RawLocation>;
  meRefId: number | null;
  exportDate: string | null;
  counts: { plays: number; ignored: number; players: number; games: number };
  range: { from: Date; to: Date } | null;
}

export interface DateRange {
  from: Date;
  to: Date;
  label: string;
}
