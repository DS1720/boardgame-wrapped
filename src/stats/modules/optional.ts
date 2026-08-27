import { selfOf, type StatContext } from '../context';
import type { Stat } from '../types';
import { gameRefOf } from './core';

const MIN_PLAYS_FOR_RATE = 3;
const MIN_PLAYS_FOR_HOURS = 10;

interface GameRate {
  gameId: number;
  plays: number;
  wins: number;
  firstSeen: number;
  name: string;
}

const gameRates = (ctx: StatContext): GameRate[] => {
  const map = new Map<number, GameRate>();
  for (const play of ctx.playerPlays) {
    if (play.cooperative) continue;
    const me = selfOf(play, ctx.playerId);
    if (!me) continue;
    const acc =
      map.get(play.gameId) ??
      { gameId: play.gameId, plays: 0, wins: 0, firstSeen: play.date.getTime(), name: play.gameName };
    acc.plays += 1;
    if (me.won) acc.wins += 1;
    acc.firstSeen = Math.min(acc.firstSeen, play.date.getTime());
    map.set(play.gameId, acc);
  }
  return [...map.values()].filter((g) => g.plays >= MIN_PLAYS_FOR_RATE);
};

export const bestGame = (ctx: StatContext): Stat | null => {
  const rates = gameRates(ctx).filter((g) => g.wins > 0);
  if (rates.length === 0) return null;
  rates.sort(
    (a, b) =>
      b.wins / b.plays - a.wins / a.plays ||
      b.plays - a.plays ||
      a.firstSeen - b.firstSeen ||
      a.name.localeCompare(b.name),
  );
  const top = rates[0];
  const play = ctx.playerPlays.find((p) => p.gameId === top.gameId)!;
  return { id: 'bestGame', core: false, game: gameRefOf(play), ratio: top.wins / top.plays, plays: top.plays };
};

export const worstGame = (ctx: StatContext): Stat | null => {
  const rates = gameRates(ctx).filter((g) => g.wins < g.plays);
  if (rates.length === 0) return null;
  rates.sort(
    (a, b) =>
      a.wins / a.plays - b.wins / b.plays ||
      b.plays - a.plays ||
      a.firstSeen - b.firstSeen ||
      a.name.localeCompare(b.name),
  );
  const top = rates[0];
  const play = ctx.playerPlays.find((p) => p.gameId === top.gameId)!;
  return { id: 'worstGame', core: false, game: gameRefOf(play), ratio: top.wins / top.plays, plays: top.plays };
};

export const longestWinStreak = (ctx: StatContext): Stat | null => {
  const competitive = ctx.playerPlays.filter((p) => !p.cooperative);
  if (competitive.length === 0) return null;
  let best = 0;
  let current = 0;
  for (const play of competitive) {
    if (selfOf(play, ctx.playerId)?.won) {
      current += 1;
      best = Math.max(best, current);
    } else current = 0;
  }
  return best >= 2 ? { id: 'longestWinStreak', core: false, length: best } : null;
};

export const busiestDay = (ctx: StatContext): Stat | null => {
  const byDay = new Map<string, number>();
  for (const play of ctx.playerPlays) byDay.set(play.day, (byDay.get(play.day) ?? 0) + 1);
  const ranked = [...byDay.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (ranked.length === 0 || ranked[0][1] < 2) return null;
  return { id: 'busiestDay', core: false, day: ranked[0][0], plays: ranked[0][1] };
};

export const coPlayerCount = (ctx: StatContext): Stat | null => {
  const others = new Set<number>();
  for (const play of ctx.playerPlays)
    for (const part of play.participants)
      if (part.playerId !== ctx.playerId) others.add(part.playerId);
  return others.size > 0 ? { id: 'coPlayerCount', core: false, count: others.size } : null;
};

export const firstAndLastPlay = (ctx: StatContext): Stat | null => {
  const plays = ctx.playerPlays;
  if (plays.length < 2) return null;
  const first = plays[0];
  const last = plays[plays.length - 1];
  return {
    id: 'firstAndLastPlay',
    core: false,
    first: { day: first.day, game: gameRefOf(first) },
    last: { day: last.day, game: gameRefOf(last) },
  };
};

export const nightOwl = (ctx: StatContext): Stat | null => {
  if (ctx.playerPlays.length < MIN_PLAYS_FOR_HOURS) return null;
  const hours = new Array(24).fill(0) as number[];
  for (const play of ctx.playerPlays) hours[play.hour] += 1;
  let peakHour = 0;
  for (let h = 0; h < 24; h += 1) if (hours[h] > hours[peakHour]) peakHour = h;
  const late = ctx.playerPlays.filter((p) => p.hour >= 22 || p.hour < 4).length;
  return {
    id: 'nightOwl',
    core: false,
    peakHour,
    playsAtPeak: hours[peakHour],
    lateShare: late / ctx.playerPlays.length,
  };
};

export const groupShare = (ctx: StatContext): Stat | null => {
  if (ctx.allPlays.length === 0 || ctx.playerPlays.length === 0) return null;
  return {
    id: 'groupShare',
    core: false,
    ratio: ctx.playerPlays.length / ctx.allPlays.length,
    attended: ctx.playerPlays.length,
    total: ctx.allPlays.length,
  };
};

export const highestScore = (ctx: StatContext): Stat | null => {
  let best: { score: number; play: (typeof ctx.playerPlays)[number] } | null = null;
  for (const play of ctx.playerPlays) {
    const me = selfOf(play, ctx.playerId);
    if (!me || me.score === null) continue;
    if (!best || me.score > best.score) best = { score: me.score, play };
  }
  if (!best) return null;
  return {
    id: 'highestScore',
    core: false,
    score: best.score,
    game: gameRefOf(best.play),
    day: best.play.day,
  };
};
