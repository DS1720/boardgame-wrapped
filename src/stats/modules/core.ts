import type { NormalizedPlay } from '@/shared/types';
import { selfOf, tally, type StatContext } from '../context';
import type { GameRef, Stat } from '../types';

export const gameRefOf = (play: NormalizedPlay): GameRef => ({
  gameId: play.gameId,
  name: play.gameName,
  boxArt: play.boxArt,
  bggId: play.bggId,
});

const gameKey = (p: NormalizedPlay) => ({
  key: p.gameId,
  label: p.gameName,
  at: p.date.getTime(),
});

export const totalPlays = (ctx: StatContext): Stat | null => {
  const plays = ctx.playerPlays;
  if (plays.length === 0) return null;
  return {
    id: 'totalPlays',
    core: true,
    plays: plays.length,
    nights: new Set(plays.map((p) => p.day)).size,
    distinctGames: new Set(plays.map((p) => p.gameId)).size,
  };
};

/**
 * Fewest people a game needs before a percentage is said about it.
 *
 * Below this the granularity is the problem rather than the sample: one player
 * in four is "the top 25%", which sounds like a worse result than the first
 * place it actually describes. Six is the median pool on the real export, so
 * five keeps most games in while dropping the ones where every step is a
 * quarter of the field.
 */
export const MIN_STANDING_POOL = 5;

/**
 * Where a player ranks among everyone who played one game, by play count.
 *
 * The pool is **everyone in the export who played it in range** — this group's
 * table, not the world's. BG Stats knows nothing beyond the plays it was given,
 * so the claim built on this has to be about the people they actually play
 * with, and the copy in `quips.ts` says exactly that.
 *
 * Ties share a rank: two people on twenty plays are both second if one person
 * has more, because the alternative is deciding a percentile alphabetically.
 * That also keeps it deterministic without sorting.
 */
export const standingIn = (
  ctx: StatContext,
  gameId: number,
): { rank: number; players: number } | null => {
  const counts = new Map<number, number>();
  for (const play of ctx.allPlays) {
    if (play.gameId !== gameId) continue;
    // A player counted once per play, however the participant list is shaped.
    for (const id of new Set(play.participants.map((x) => x.playerId))) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  const mine = counts.get(ctx.playerId);
  if (mine === undefined || counts.size < MIN_STANDING_POOL) return null;

  let better = 0;
  for (const count of counts.values()) if (count > mine) better += 1;
  return { rank: better + 1, players: counts.size };
};

export const topGame = (ctx: StatContext): Stat | null => {
  const ranked = tally(ctx.playerPlays, gameKey);
  if (ranked.length === 0) return null;
  const top = ranked[0];
  const play = ctx.playerPlays.find((p) => p.gameId === top.key)!;
  return {
    id: 'topGame',
    core: true,
    game: gameRefOf(play),
    plays: top.count,
    standing: standingIn(ctx, play.gameId),
  };
};

/**
 * Despite the name, this collects **six** games.
 *
 * The Top Five slide renders five of them; the outro's 3x2 grid renders all
 * six, so it fills without a gap in the bottom row. Computing them together
 * keeps the two slides agreeing about the ranking.
 */
export const TOP_GAMES_COLLECTED = 6;

export const topFive = (ctx: StatContext): Stat | null => {
  const ranked = tally(ctx.playerPlays, gameKey).slice(0, TOP_GAMES_COLLECTED);
  if (ranked.length < 2) return null; // a "top 5" of one game is just the top game slide
  const games = ranked.map((entry) => {
    const play = ctx.playerPlays.find((p) => p.gameId === entry.key)!;
    return { ...gameRefOf(play), plays: entry.count };
  });
  return { id: 'topFive', core: true, games };
};

export const winRate = (ctx: StatContext): Stat | null => {
  const competitive = ctx.playerPlays.filter((p) => !p.cooperative);
  const coopOnly = competitive.length === 0;
  const pool = coopOnly ? ctx.playerPlays : competitive;
  if (pool.length === 0) return null;

  let wins = 0;
  for (const play of pool) if (selfOf(play, ctx.playerId)?.won) wins += 1;

  return {
    id: 'winRate',
    core: true,
    wins,
    losses: pool.length - wins,
    ratio: wins / pool.length,
    coopOnly,
  };
};

export const topCoPlayer = (ctx: StatContext): Stat | null => {
  const counts = new Map<number, { name: string; count: number; firstSeen: number }>();
  for (const play of ctx.playerPlays) {
    for (const part of play.participants) {
      if (part.playerId === ctx.playerId) continue;
      const acc = counts.get(part.playerId);
      if (acc) {
        acc.count += 1;
        acc.firstSeen = Math.min(acc.firstSeen, play.date.getTime());
      } else {
        counts.set(part.playerId, {
          name: ctx.displayNameOf(part.playerId, part.name),
          count: 1,
          firstSeen: play.date.getTime(),
        });
      }
    }
  }
  const ranked = [...counts.entries()].sort(
    (a, b) =>
      b[1].count - a[1].count ||
      a[1].firstSeen - b[1].firstSeen ||
      a[1].name.localeCompare(b[1].name),
  );
  if (ranked.length === 0) return null;
  const [playerId, top] = ranked[0];
  // The slide names one person and then lists the rest, so the top five travel
  // together rather than the slide having to ask for them separately.
  const others = ranked.slice(0, 5).map(([id, entry]) => ({
    playerId: id,
    name: entry.name,
    shared: entry.count,
  }));
  return { id: 'topCoPlayer', core: true, name: top.name, playerId, shared: top.count, others };
};

/**
 * Head-to-head plays needed before someone can be a nemesis.
 *
 * Higher than it was, because the ranking is now a rate: two losses out of two
 * games is a 100% loss rate and means nothing. Five is enough for the number to
 * carry some weight without excluding people you only play occasionally.
 */
const MIN_HEAD_TO_HEAD = 5;

export const nemesis = (ctx: StatContext): Stat | null => {
  const tallies = new Map<
    number,
    { name: string; lossesTo: number; headToHead: number; firstSeen: number }
  >();

  for (const play of ctx.playerPlays) {
    if (play.cooperative) continue;
    const me = selfOf(play, ctx.playerId);
    if (!me) continue;
    for (const part of play.participants) {
      if (part.playerId === ctx.playerId) continue;
      const acc =
        tallies.get(part.playerId) ??
        {
          name: ctx.displayNameOf(part.playerId, part.name),
          lossesTo: 0,
          headToHead: 0,
          firstSeen: play.date.getTime(),
        };
      acc.headToHead += 1;
      if (part.won && !me.won) acc.lossesTo += 1;
      acc.firstSeen = Math.min(acc.firstSeen, play.date.getTime());
      tallies.set(part.playerId, acc);
    }
  }

  const eligible = [...tallies.entries()].filter(
    ([, v]) => v.headToHead >= MIN_HEAD_TO_HEAD && v.lossesTo > 0,
  );
  if (eligible.length === 0) return null;

  // Ranked by the share of head-to-head games lost, not the raw count. By count
  // the nemesis is always whoever you play most — which is a fact about your
  // calendar, not about who beats you.
  eligible.sort(
    (a, b) =>
      b[1].lossesTo / b[1].headToHead - a[1].lossesTo / a[1].headToHead ||
      b[1].headToHead - a[1].headToHead ||
      a[1].firstSeen - b[1].firstSeen ||
      a[1].name.localeCompare(b[1].name),
  );
  const [playerId, top] = eligible[0];
  return {
    id: 'nemesis',
    core: true,
    playerId,
    name: top.name,
    lossesTo: top.lossesTo,
    headToHead: top.headToHead,
    lossRate: top.lossesTo / top.headToHead,
  };
};

export const gamesLearned = (ctx: StatContext): Stat | null => {
  const seen = new Map<number, GameRef>();
  for (const play of ctx.playerPlays) {
    if (!selfOf(play, ctx.playerId)?.isNew) continue;
    if (!seen.has(play.gameId)) seen.set(play.gameId, gameRefOf(play));
  }
  if (seen.size === 0) return null;

  // How often each new game was played afterwards. The slide shows only the
  // first handful, and sorting alphabetically made that handful six games
  // beginning with "A" — a sample of the alphabet rather than of the year.
  const playsPerGame = new Map<number, number>();
  for (const play of ctx.playerPlays) {
    if (!seen.has(play.gameId)) continue;
    playsPerGame.set(play.gameId, (playsPerGame.get(play.gameId) ?? 0) + 1);
  }

  const games = [...seen.values()].sort(
    (a, b) =>
      (playsPerGame.get(b.gameId) ?? 0) - (playsPerGame.get(a.gameId) ?? 0) ||
      a.name.localeCompare(b.name),
  );
  return { id: 'gamesLearned', core: true, count: games.length, games };
};

export const topLocation = (ctx: StatContext): Stat | null => {
  // Counted in nights, not plays — six games at one table is one evening there.
  const nights = new Map<string, Set<string>>();
  const firstSeen = new Map<string, number>();
  for (const play of ctx.playerPlays) {
    if (!play.locationName) continue;
    const set = nights.get(play.locationName) ?? new Set<string>();
    set.add(play.day);
    nights.set(play.locationName, set);
    firstSeen.set(
      play.locationName,
      Math.min(firstSeen.get(play.locationName) ?? Infinity, play.date.getTime()),
    );
  }
  if (nights.size === 0) return null;

  const ranked = [...nights.entries()].sort(
    (a, b) =>
      b[1].size - a[1].size ||
      (firstSeen.get(a[0]) ?? 0) - (firstSeen.get(b[0]) ?? 0) ||
      a[0].localeCompare(b[0]),
  );
  return { id: 'topLocation', core: true, name: ranked[0][0], nights: ranked[0][1].size };
};
