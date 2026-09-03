import type {
  Dataset,
  NormalizedPlay,
  Participant,
  RawExport,
  RawGame,
  RawLocation,
  RawPlayer,
} from '@/shared/types';
import { parseLocalDate, toDayKey } from '@/shared/format';
import { parseDesignerField } from '@/shared/bgg';

export class IngestError extends Error {}

const REQUIRED_KEYS = ['plays', 'players', 'games', 'locations'] as const;

/**
 * The expected length of one play of a game, in minutes.
 *
 * The midpoint of BGG's stated range. Deliberately not weighted by player
 * count: plenty of games do not get longer with more people, and inventing a
 * scaling rule would make the number look more precise than it is.
 *
 * Returns null rather than a guess when the game has no stated time, so the
 * stat can say how much of the year it actually measured.
 */
export const estimatedPlayMinutes = (game: RawGame | undefined): number | null => {
  if (!game) return null;
  const min = typeof game.minPlayTime === 'number' && game.minPlayTime > 0 ? game.minPlayTime : null;
  const max = typeof game.maxPlayTime === 'number' && game.maxPlayTime > 0 ? game.maxPlayTime : null;

  if (min !== null && max !== null) return (min + max) / 2;
  return min ?? max;
};

const toScore = (raw: unknown): number | null => {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
};

/**
 * Validates and normalizes a parsed BG Stats export.
 * Throws IngestError with a message naming the problem, never a generic failure.
 */
export const buildDataset = (input: unknown): Dataset => {
  if (typeof input !== 'object' || input === null) {
    throw new IngestError('That file is not a JSON object.');
  }
  const raw = input as Partial<RawExport>;

  const missing = REQUIRED_KEYS.filter((k) => !Array.isArray(raw[k]));
  if (missing.length > 0) {
    throw new IngestError(
      `This does not look like a BG Stats export — missing: ${missing.join(', ')}. ` +
        'Export from BG Stats via Settings → Export, import and backup.',
    );
  }

  const players = raw.players as RawPlayer[];
  const games = raw.games as RawGame[];
  const locations = raw.locations as RawLocation[];

  const playersById = new Map(players.map((p) => [p.id, p]));
  const gamesById = new Map(games.map((g) => [g.id, g]));
  const locationsById = new Map(locations.map((l) => [l.id, l]));

  let ignored = 0;
  const plays: NormalizedPlay[] = [];

  for (const play of raw.plays as RawExport['plays']) {
    if (play.ignored) {
      ignored += 1;
      continue;
    }
    const date = parseLocalDate(play.playDate);
    if (Number.isNaN(date.getTime())) continue;

    const game = gamesById.get(play.gameRefId);
    const location = play.locationRefId ? locationsById.get(play.locationRefId) : undefined;

    const participants: Participant[] = (play.playerScores ?? []).map((ps) => ({
      playerId: ps.playerRefId,
      name: playersById.get(ps.playerRefId)?.name?.trim() || 'Unknown player',
      won: Boolean(ps.winner),
      score: toScore(ps.score),
      isNew: Boolean(ps.newPlayer),
      team: ps.team ?? '',
      teamRole: ps.teamRole ?? '',
    }));

    plays.push({
      uuid: play.uuid,
      date,
      day: toDayKey(date),
      hour: date.getHours(),
      gameId: play.gameRefId,
      // A game can be referenced before it exists in a partial export.
      gameName: game?.name?.trim() || 'Unknown game',
      estimatedMinutes: estimatedPlayMinutes(game),
      cooperative: Boolean(game?.cooperative),
      // Absent means highest wins: that is BG Stats' default, and it is the
      // right answer for 221 of the 229 games in the real export.
      highestWins: game?.highestWins !== false,
      usesTeams: Boolean(game?.usesTeams),
      boxArt: game?.urlImage ? game.urlImage : null,
      bggId: game?.bggId ?? 0,
      designers: parseDesignerField(game?.designers),
      locationId: location?.id ?? null,
      locationName: location?.name ?? null,
      participants,
    });
  }

  if (plays.length === 0) {
    throw new IngestError('The export parsed correctly but contains no usable plays.');
  }

  plays.sort((a, b) => a.date.getTime() - b.date.getTime());

  return {
    plays,
    playersById,
    gamesById,
    locationsById,
    meRefId: raw.userInfo?.meRefId ?? null,
    exportDate: raw.userInfo?.exportDate ?? null,
    counts: {
      plays: plays.length,
      ignored,
      players: players.length,
      games: games.length,
    },
    range: { from: plays[0].date, to: plays[plays.length - 1].date },
  };
};

export const parseExportText = (text: string): Dataset => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new IngestError('That file is not valid JSON. It may be truncated.');
  }
  return buildDataset(parsed);
};
