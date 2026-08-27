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
  boxArt: string | null;
  bggId: number;
  locationId: number | null;
  locationName: string | null;
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
