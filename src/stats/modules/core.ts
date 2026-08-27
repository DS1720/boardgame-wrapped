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

export const topGame = (ctx: StatContext): Stat | null => {
  const ranked = tally(ctx.playerPlays, gameKey);
  if (ranked.length === 0) return null;
  const top = ranked[0];
  const play = ctx.playerPlays.find((p) => p.gameId === top.key)!;
  return { id: 'topGame', core: true, game: gameRefOf(play), plays: top.count };
};

export const topFive = (ctx: StatContext): Stat | null => {
  const ranked = tally(ctx.playerPlays, gameKey).slice(0, 5);
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
          name: part.name,
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
  return { id: 'topCoPlayer', core: true, name: top.name, playerId, shared: top.count };
};

const MIN_HEAD_TO_HEAD = 3;

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
          name: part.name,
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

  eligible.sort(
    (a, b) =>
      b[1].lossesTo - a[1].lossesTo ||
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
  };
};

export const gamesLearned = (ctx: StatContext): Stat | null => {
  const seen = new Map<number, GameRef>();
  for (const play of ctx.playerPlays) {
    if (!selfOf(play, ctx.playerId)?.isNew) continue;
    if (!seen.has(play.gameId)) seen.set(play.gameId, gameRefOf(play));
  }
  if (seen.size === 0) return null;
  const games = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
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
