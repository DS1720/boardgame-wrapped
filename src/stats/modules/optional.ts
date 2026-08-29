import type { NormalizedPlay } from '@/shared/types';
import { rank, selfOf, type StatContext } from '../context';
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

/**
 * A game this player holds the record in.
 *
 * "Record" means the best score of anyone who played that game inside the
 * range — not the player's own personal best, which is what `highestScore`
 * reports. Two guard rails make it a claim worth putting on screen:
 *
 * - **At least two people must have scored in the game.** Otherwise it is not a
 *   record, it is the only score, and a player who once played something alone
 *   would "hold the record" in it.
 * - **Best means best, not biggest.** Eight games in the real export are
 *   lowest-wins; taking the maximum in those names whoever did worst.
 * - **The score has to belong to one player.** Cooperative and team games are
 *   skipped: everyone at the table shares the number, so "you hold the record"
 *   is not true of any of them. Both cases showed up on the real export —
 *   Nekojima is cooperative, and three players each held Poetry for
 *   Neanderthals at 27 because they were on the same winning team.
 *
 * When they hold several, the one they have played most is the one shown —
 * a record in a game played twenty times says more than one in a game played
 * twice — and the rest are counted alongside it. Ties break by `rank`'s rule:
 * more plays, then earlier first appearance, then alphabetical.
 */
const MIN_CONTENDERS = 2;

export const gameRecord = (ctx: StatContext): Stat | null => {
  interface Board {
    play: NormalizedPlay;
    best: number | null;
    holders: Set<number>;
    scorers: Set<number>;
    myPlays: number;
    firstSeen: number;
    highestWins: boolean;
  }

  const boards = new Map<number, Board>();

  // Every play in range, not just this player's: a record is a fact about the
  // whole table, and someone else may hold it.
  for (const play of ctx.allPlays) {
    if (play.cooperative || play.usesTeams) continue;

    let board = boards.get(play.gameId);
    if (!board) {
      board = {
        play,
        best: null,
        holders: new Set(),
        scorers: new Set(),
        myPlays: 0,
        firstSeen: play.date.getTime(),
        highestWins: play.highestWins,
      };
      boards.set(play.gameId, board);
    }
    board.firstSeen = Math.min(board.firstSeen, play.date.getTime());

    for (const part of play.participants) {
      if (part.score === null) continue;
      board.scorers.add(part.playerId);

      const better =
        board.best === null ||
        (board.highestWins ? part.score > board.best : part.score < board.best);

      if (better) {
        board.best = part.score;
        board.holders = new Set([part.playerId]);
      } else if (part.score === board.best) {
        board.holders.add(part.playerId);
      }
    }
  }

  // Plays are counted from this player's own list, so a game the group played
  // without them does not inflate the figure that picks the winner.
  for (const play of ctx.playerPlays) {
    const board = boards.get(play.gameId);
    if (board) board.myPlays += 1;
  }

  const held = [...boards.values()].filter(
    (b) =>
      b.best !== null &&
      b.scorers.size >= MIN_CONTENDERS &&
      b.holders.has(ctx.playerId) &&
      b.myPlays > 0,
  );
  if (held.length === 0) return null;

  const ranked = rank(
    held.map((b) => ({
      key: b.play.gameId,
      label: b.play.gameName,
      count: b.myPlays,
      firstSeen: b.firstSeen,
    })),
  );
  const winner = held.find((b) => b.play.gameId === ranked[0].key)!;

  return {
    id: 'gameRecord',
    core: false,
    game: gameRefOf(winner.play),
    score: winner.best!,
    plays: winner.myPlays,
    otherRecords: held.length - 1,
    contenders: winner.scorers.size,
    highestWins: winner.highestWins,
    shared: winner.holders.size > 1,
  };
};

/**
 * The best score on the board, preferring one from a game that was won.
 *
 * A big number in a game you lost is a fact about the scoring, not about you —
 * plenty of games hand out points to everyone, and in some of them the loser
 * outscores the winner on a subtotal. So a winning score wins outright, however
 * much larger a losing one is, and the losing high score is only the answer when
 * there is no winning one at all.
 *
 * `won` travels with it so the slide can say which of the two it is showing,
 * rather than presenting both under one label.
 *
 * Ties go to the earlier play: `playerPlays` is oldest first and the comparison
 * is strict, which is the project's "earlier first appearance" rule and what
 * keeps the same export producing the same video.
 *
 * Scoring direction is deliberately not consulted. "Highest score" means the
 * largest number, which is what the slide says — see `gameRecord` for the stat
 * that does read `highestWins`, because "best" there has to mean best.
 */
export const highestScore = (ctx: StatContext): Stat | null => {
  type Candidate = { score: number; play: (typeof ctx.playerPlays)[number] };

  let bestWon: Candidate | null = null;
  let bestAny: Candidate | null = null;

  for (const play of ctx.playerPlays) {
    const me = selfOf(play, ctx.playerId);
    if (!me || me.score === null) continue;

    if (!bestAny || me.score > bestAny.score) bestAny = { score: me.score, play };
    if (me.won && (!bestWon || me.score > bestWon.score)) bestWon = { score: me.score, play };
  }

  const best = bestWon ?? bestAny;
  if (!best) return null;

  return {
    id: 'highestScore',
    core: false,
    score: best.score,
    game: gameRefOf(best.play),
    day: best.play.day,
    won: bestWon !== null,
  };
};

/**
 * Estimated time at the table.
 *
 * BG Stats records `durationMin` as 0 on every single play, so how long a game
 * actually took is simply not in the data. What *is* there is BGG's stated play
 * time per game, and multiplying that out across a year gives a figure that is
 * honest as an estimate and useless as a fact — so every surface that shows it
 * says "about".
 *
 * Plays whose game has no stated time are counted separately rather than
 * guessed at, and the slide only appears if most of the year could be measured.
 */
const MIN_COVERAGE = 0.6;

interface GameTime {
  minutes: number;
  plays: number;
  firstSeen: number;
  /**
   * A real play of this game, kept so the game reference (name, box art, bgg
   * id) comes from the data rather than being reassembled by hand.
   */
  sample: NormalizedPlay;
}

/**
 * Estimated minutes, per game and in total, or null when too little of the year
 * can be estimated at all.
 *
 * Shared by the two slides built on it. They must not be able to disagree about
 * where the time went, and — more importantly — they have to answer the
 * coverage question the same way: a "top five by time" appearing while the
 * honest total was suppressed would be the same estimate presented with less
 * of a caveat, not more.
 */
const estimatedTime = (
  ctx: StatContext,
): {
  minutes: number;
  playsCounted: number;
  playsMissing: number;
  byGame: Map<number, GameTime>;
  ranked: ReturnType<typeof rank>;
} | null => {
  if (ctx.playerPlays.length === 0) return null;

  let minutes = 0;
  let playsCounted = 0;
  let playsMissing = 0;
  const byGame = new Map<number, GameTime>();

  for (const play of ctx.playerPlays) {
    if (play.estimatedMinutes === null) {
      playsMissing += 1;
      continue;
    }
    minutes += play.estimatedMinutes;
    playsCounted += 1;

    const acc = byGame.get(play.gameId) ?? {
      minutes: 0,
      plays: 0,
      firstSeen: play.date.getTime(),
      sample: play,
    };
    acc.minutes += play.estimatedMinutes;
    acc.plays += 1;
    acc.firstSeen = Math.min(acc.firstSeen, play.date.getTime());
    byGame.set(play.gameId, acc);
  }

  // An estimate built from a third of someone's plays is not an estimate of
  // their year, it is an estimate of part of it presented as the whole.
  if (playsCounted === 0 || playsCounted / ctx.playerPlays.length < MIN_COVERAGE) return null;

  const ranked = rank(
    [...byGame.entries()].map(([gameId, g]) => ({
      key: gameId,
      label: g.sample.gameName,
      // Ranking is by minutes here, not plays: the point of this stat is where
      // the time went, which is often not the game played most often.
      count: g.minutes,
      firstSeen: g.firstSeen,
    })),
  );

  return { minutes, playsCounted, playsMissing, byGame, ranked };
};

export const timePlayed = (ctx: StatContext): Stat | null => {
  const time = estimatedTime(ctx);
  if (!time) return null;

  const top = time.ranked[0];
  const topEntry = top ? time.byGame.get(top.key as number) : undefined;

  return {
    id: 'timePlayed',
    core: true,
    minutes: Math.round(time.minutes),
    playsCounted: time.playsCounted,
    playsMissing: time.playsMissing,
    topGame:
      top && topEntry
        ? {
            ...gameRefOf(topEntry.sample),
            minutes: Math.round(topEntry.minutes),
            plays: topEntry.plays,
          }
        : null,
  };
};

/** How many games the time countdown shows. */
const TOP_GAMES_BY_TIME = 5;

/**
 * The five games the most time went into.
 *
 * The companion to `timePlayed`, and the reason it earns a slide of its own:
 * the games that took the most *time* are usually not the ones played most
 * often, so this is a different list from the top five even though it looks
 * like the same shape. For Tina in 2026 the time list leads with Terraforming
 * Mars over four plays while the play count leads with Faraway over twenty-one.
 *
 * Two games at minimum. A top five of one game is `timePlayed`'s own
 * `topGame` again, said at greater length.
 */
export const topFiveByTime = (ctx: StatContext): Stat | null => {
  const time = estimatedTime(ctx);
  if (!time) return null;

  const top = time.ranked.slice(0, TOP_GAMES_BY_TIME);
  if (top.length < 2) return null;

  return {
    id: 'topFiveByTime',
    core: true,
    games: top.map((entry) => {
      const game = time.byGame.get(entry.key as number)!;
      return {
        ...gameRefOf(game.sample),
        minutes: Math.round(game.minutes),
        plays: game.plays,
      };
    }),
  };
};
