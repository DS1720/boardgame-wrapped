/**
 * The five BGG credit stats: mechanics, themes, publishers, designers, artists.
 *
 * They are one shape with one ranking rule, so the rule is written once. Five
 * copies of it would be five places for the guard rails below to drift apart.
 *
 * ## Ranked by plays, filtered by games
 *
 * The ranking is **raw play-weighted** — how many of your plays carried this
 * name. Ranking by distinct games instead was measured and is worse: across the
 * 26 players with 20+ plays in the real export, the top designer reaches three
 * distinct games for only 2 of them, and on average **19 names share fifth
 * place**. A "top five" picked from nineteen identical scores is ranked by the
 * alphabetical tie-break, not by anything the player did.
 *
 * But play-weighting alone has its own failure: with 1.5 designers per game, a
 * designer list is very nearly a list of your most-played games' credits. Tina's
 * top two designers were Faraway's, tied at 21 — and her most-played slide had
 * already shown Faraway.
 *
 * So distinct games is an **eligibility filter, not the ranking**: a name has to
 * appear in `minGames` different games to be listed at all, and the ones that
 * qualify are then ordered by plays. That removes the echo and keeps the large,
 * differentiated numbers the slide puts on screen. Tina's designers become
 * Chvátil 11, Flynn 6, Vogelmann 5 — none of them a Faraway name.
 *
 * The filter costs coverage, and that is the accepted trade: a full five exists
 * for 4 of 26 players on designers, 5 on publishers, 6 on artists. Below two
 * entries the module returns `null` and the slide does not appear, which is the
 * house rule for a stat that cannot be computed honestly.
 *
 * Mechanics and themes take no games filter: at 5.2 and 3.0 tags per game they
 * already aggregate across the whole year rather than echoing one game.
 */
import type { NormalizedPlay } from '@/shared/types';
import { creditsOf, type CreditField } from '@/shared/bgg';
import type { StatContext } from '../context';
import { rank, type Tallied } from '../context';
import type { CreditEntry, CreditStatId, LeadCreditStatId, GameRef, Stat } from '../types';

/**
 * The share of a player's plays that must resolve to a BGG entry.
 *
 * Same floor and same reasoning as `timePlayed`: a list built from a third of
 * someone's plays is a list about a third of their year, presented as the whole
 * of it. It is also what makes every one of these slides vanish cleanly when no
 * manifest has been fetched — coverage is then 0.
 *
 * Measured with a manifest present: mechanics 97.4%, themes 99.1%,
 * publishers 99.1%, designers 97.0%, artists 87.6%. All clear it comfortably.
 */
export const MIN_CREDIT_COVERAGE = 0.6;

/**
 * Distinct games a credit must appear in before it can be listed.
 *
 * Two for the people-shaped slides, one (i.e. no filter) for mechanics and
 * themes. See the note above for why the two differ.
 */
export const MIN_CREDIT_GAMES = 2;

/**
 * Entries below which there is no list.
 *
 * The same floor `topFiveByTime` uses, for the same reason: a top five of one
 * is not a countdown, it is a single fact told at greater length.
 */
export const MIN_CREDIT_ENTRIES = 2;

/** The most a credit slide ever shows. */
export const MAX_CREDIT_ENTRIES = 5;

/**
 * Games named on a hero credit slide.
 *
 * Six, so the grid fills 3x2 without a ragged bottom row — the same reason the
 * outro takes six from a top five.
 */
export const MAX_CREDIT_EXAMPLES = 6;

/**
 * Games the leading credit must span before it gets a slide of its own.
 *
 * The hero slide's whole job is "and here are the games", so a theme carried by
 * a single game has nothing to show and is really just that game again.
 */
export const MIN_LEAD_CREDIT_GAMES = 2;

/** What one credit accumulates as the plays are walked. */
interface Accumulator {
  name: string;
  plays: number;
  /** gameId → plays of that game carrying this credit. */
  games: Map<number, number>;
  /** Index of the earliest play carrying it, for the deterministic tie-break. */
  firstSeen: number;
}

const gameRefOf = (play: NormalizedPlay): GameRef => ({
  gameId: play.gameId,
  name: play.gameName,
  boxArt: play.boxArt,
  bggId: play.bggId,
});

/**
 * A game of the player's that carries this credit — its most-played one, unless
 * a row above has already taken that cover.
 *
 * The slide draws five covers, and without the `taken` check four of them are
 * the same picture. On Tina's mechanics list, Hand Management, Set Collection,
 * Open Drafting and End Game Bonuses are all led by Faraway, because her
 * most-played game is on every one of those tags — which is true, and which
 * renders as a slide that looks broken.
 *
 * So each row takes the highest-ranked game not already shown, falling back to
 * its own top game when every candidate is spoken for. That keeps every row's
 * cover a game that genuinely carries the credit while letting five rows look
 * like five rows.
 *
 * Ties break the house way: more plays, then the earlier game, then by name.
 */
const coverFor = (acc: Accumulator, plays: NormalizedPlay[], taken: Set<number>): GameRef => {
  const ranked = rank(
    [...acc.games].map(([gameId, count]) => {
      const index = plays.findIndex((p) => p.gameId === gameId);
      return {
        key: gameId,
        label: plays[index]?.gameName ?? '',
        count,
        firstSeen: index,
      } satisfies Tallied;
    }),
  );
  const choice = ranked.find((item) => !taken.has(item.key as number)) ?? ranked[0];
  const play = plays.find((p) => p.gameId === choice.key)!;
  return gameRefOf(play);
};

export interface CreditStatOptions {
  id: CreditStatId;
  field: CreditField;
  /** 1 means no filter. See `MIN_CREDIT_GAMES`. */
  minGames: number;
}

/** What one pass over the player's plays produces, before any slide shapes it. */
interface CreditTally {
  plays: NormalizedPlay[];
  accumulators: Map<string, Accumulator>;
  coverage: number;
}

/**
 * Walk the plays once and tally one field.
 *
 * Shared by the list slides and the hero slides so the two can never disagree
 * about who leads: the hero names the credit at the top of the list the other
 * slide draws, and computing that twice is two places for the guard rails to
 * drift apart.
 */
const tallyCredits = (ctx: StatContext, field: CreditField): CreditTally | null => {
  const plays = ctx.playerPlays;
  if (plays.length === 0) return null;

  const accumulators = new Map<string, Accumulator>();
  let resolved = 0;

  for (let index = 0; index < plays.length; index += 1) {
    const play = plays[index];
    const entry = ctx.bgg.get(play.bggId);

    /*
      The export's own designer field is the fallback for that one slide, and
      only when the manifest has nothing for this game. Both lists come from
      BGG, so they agree; this is what keeps the designer slide working with no
      prefetch and no network.
    */
    const names =
      entry || field !== 'designers' ? creditsOf(entry, field) : play.designers;

    // Coverage counts plays we could say *something* about. A game legitimately
    // carrying no artist is covered; a game we never fetched is not.
    if (entry || (field === 'designers' && play.designers.length > 0)) resolved += 1;

    for (const name of names) {
      let acc = accumulators.get(name);
      if (!acc) {
        acc = { name, plays: 0, games: new Map(), firstSeen: index };
        accumulators.set(name, acc);
      }
      acc.plays += 1;
      acc.games.set(play.gameId, (acc.games.get(play.gameId) ?? 0) + 1);
      acc.firstSeen = Math.min(acc.firstSeen, index);
    }
  }

  const coverage = resolved / plays.length;
  if (coverage < MIN_CREDIT_COVERAGE) return null;

  return { plays, accumulators, coverage };
};

/** The eligible credits, in the order they will be shown. */
const rankEligible = (tally: CreditTally, minGames: number): Tallied[] => {
  const eligible = [...tally.accumulators.values()].filter((acc) => acc.games.size >= minGames);

  // `rank` is the house tie-break: higher count, then earliest first
  // appearance, then alphabetical. Never left to Map insertion order.
  return rank(
    eligible.map(
      (acc) =>
        ({
          key: acc.name,
          label: acc.name,
          count: acc.plays,
          firstSeen: acc.firstSeen,
        }) satisfies Tallied,
    ),
  );
};

/**
 * Build one credit list, or null when it cannot be computed honestly.
 *
 * Pure: everything it reads is on the context, and the BGG index is data handed
 * in rather than fetched. The stats layer does no I/O.
 */
export const creditStat = (
  ctx: StatContext,
  { id, field, minGames }: CreditStatOptions,
): Stat | null => {
  const tally = tallyCredits(ctx, field);
  if (!tally) return null;

  const ranked = rankEligible(tally, minGames);
  if (ranked.length < MIN_CREDIT_ENTRIES) return null;

  // Walked in rank order so the higher row always gets first refusal on a cover.
  const taken = new Set<number>();
  const entries: CreditEntry[] = ranked.slice(0, MAX_CREDIT_ENTRIES).map((item) => {
    const acc = tally.accumulators.get(String(item.key))!;
    const topGame = coverFor(acc, tally.plays, taken);
    taken.add(topGame.gameId);
    return {
      name: acc.name,
      plays: acc.plays,
      games: acc.games.size,
      topGame,
    };
  });

  return { id, core: false, entries, coverage: tally.coverage } as Stat;
};

export interface LeadCreditStatOptions {
  id: LeadCreditStatId;
  field: CreditField;
}

/**
 * The one credit at the top of the list, with the games that earned it.
 *
 * The hero counterpart to `creditStat` — the same shape as the most-played
 * slide, a claim and the evidence for it. The list slide says a theme came up
 * 39 times; this one says which games those were, which is the question the
 * list invites and cannot answer.
 *
 * The leader is taken from the *unfiltered* ranking, because that is what the
 * list beside it shows. Themes and mechanics take no distinct-games filter, so
 * `MIN_LEAD_CREDIT_GAMES` is applied to the winner alone: a theme carried by
 * one game has no games to show and is that game again under another name.
 */
export const leadingCredit = (
  ctx: StatContext,
  { id, field }: LeadCreditStatOptions,
): Stat | null => {
  const tally = tallyCredits(ctx, field);
  if (!tally) return null;

  const ranked = rankEligible(tally, 1);
  const top = ranked[0];
  if (!top) return null;

  const acc = tally.accumulators.get(String(top.key))!;
  if (acc.games.size < MIN_LEAD_CREDIT_GAMES) return null;

  // The games that carried it, most-played first, by the house tie-break.
  const games = rank(
    [...acc.games].map(([gameId, count]) => {
      const index = tally.plays.findIndex((p) => p.gameId === gameId);
      return {
        key: gameId,
        label: tally.plays[index]?.gameName ?? '',
        count,
        firstSeen: index,
      } satisfies Tallied;
    }),
  );

  return {
    id,
    core: false,
    name: acc.name,
    plays: acc.plays,
    games: acc.games.size,
    examples: games.slice(0, MAX_CREDIT_EXAMPLES).map((item) => ({
      ...gameRefOf(tally.plays.find((p) => p.gameId === item.key)!),
      plays: item.count,
    })),
    coverage: tally.coverage,
  } as Stat;
};
