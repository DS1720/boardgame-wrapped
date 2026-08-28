import { formatDay, formatNumber } from '@/shared/format';
import type { Stat, WrappedStats } from './types';

/**
 * One line for the outro that says what was distinctive about this player's
 * year.
 *
 * Two tiers, and the difference between them is the point.
 *
 * **Earned** claims clear a threshold measured from the real export — across
 * the 50 players with five or more plays, each sits at roughly the 90th
 * percentile. A superlative everyone earns is not a superlative, it is a
 * caption, so these stay hard to get.
 *
 * **Fallback** lines are not claims at all. They state something true and
 * specific about the year — the game you were hardest to beat at, who you sat
 * across from, where the regular table was — so that a player who was not
 * remarkable at anything still gets a sentence about themselves rather than a
 * blank. They are ordered by how personal they are, and the first available one
 * wins.
 *
 * Only a player with no usable stats at all gets null.
 */

export type SuperlativeId =
  /* Earned: a claim that clears a threshold measured from the real export. */
  | 'marathon'
  | 'explorer'
  | 'loyalist'
  | 'nightOwl'
  | 'winner'
  | 'streaker'
  | 'social'
  | 'haunted'
  | 'regular'
  /* Always available: a fact about the year rather than a distinction. */
  | 'bestAt'
  | 'partner'
  | 'favourite'
  | 'rival'
  | 'venue'
  | 'bigDay'
  | 'bookends';

/**
 * The quantity a claim is built on.
 *
 * A surface that already shows one of these can ask not to be given a
 * superlative that repeats it: "504 plays. Never off the table." directly under
 * "504 plays · 106 games · 73 nights" is the same number twice, and the second
 * time it reads as filler rather than as a distinction.
 *
 * Only claims that actually *state* one of these carry a tag. "46% of games
 * began after dark" is built on the hour, not on a count of games, and
 * "Half the year was Faraway" names a game rather than counting any.
 */
export type SuperlativeQuantity =
  | 'plays'
  | 'games'
  | 'nights'
  | 'hours'
  | 'people'
  | 'winrate'
  | 'place';

export interface Superlative {
  id: SuperlativeId;
  line: string;
  /** How far into the tail this player sits, 0–1. Used to pick between them. */
  score: number;
}

export interface SuperlativeOptions {
  /** Quantities the surface is already showing, so they are not said twice. */
  avoid?: readonly (SuperlativeQuantity | null | undefined)[];
}

/**
 * Plays needed before a *proportion* can be claimed as a trait.
 *
 * Counts and streaks stand on their own; shares do not.
 */
const MIN_PLAYS_FOR_SHARE = 20;

const find = <T extends Stat['id']>(stats: WrappedStats, id: T) =>
  stats.stats.find((s) => s.id === id) as Extract<Stat, { id: T }> | undefined;

interface Candidate {
  id: SuperlativeId;
  /** The measured value, or null when the stat is missing. */
  value: number | null;
  /** Roughly the 90th percentile in the real data. */
  threshold: number;
  /** The observed maximum, used to place a value within the tail. */
  ceiling: number;
  line: string;
  /** Set only when the line states a number of this quantity. */
  quantity?: SuperlativeQuantity;
}

/**
 * Rank the qualifying claims by how far each sits into its own tail.
 *
 * Comparing raw values would be meaningless — 504 plays and a 0.82 late share
 * are not on the same scale — so each is normalised against the span between
 * its threshold and the highest value seen in the export.
 */
export const superlativeFor = (
  stats: WrappedStats | null,
  options: SuperlativeOptions = {},
): Superlative | null => {
  if (!stats) return null;
  const avoid = new Set(options.avoid?.filter(Boolean) as SuperlativeQuantity[]);

  const total = find(stats, 'totalPlays');
  const topGame = find(stats, 'topGame');
  const winRate = find(stats, 'winRate');
  const learned = find(stats, 'gamesLearned');
  const streak = find(stats, 'longestWinStreak');
  const owl = find(stats, 'nightOwl');
  const people = find(stats, 'coPlayerCount');
  const nemesis = find(stats, 'nemesis');
  const location = find(stats, 'topLocation');
  const bestGame = find(stats, 'bestGame');
  const coPlayer = find(stats, 'topCoPlayer');
  const busiest = find(stats, 'busiestDay');
  const bookends = find(stats, 'firstAndLastPlay');

  const candidates: Candidate[] = [
    {
      id: 'marathon',
      value: total?.plays ?? null,
      threshold: 100,
      ceiling: 504,
      line: total ? `${formatNumber(total.plays)} plays. Never off the table.` : '',
      quantity: 'plays',
    },
    {
      id: 'explorer',
      value: learned?.count ?? null,
      threshold: 33,
      ceiling: 89,
      line: learned ? `${formatNumber(learned.count)} games learned in one year.` : '',
      quantity: 'games',
    },
    {
      id: 'loyalist',
      // Guarded by play count. A share is trivially high on a small sample —
      // three of six plays clears "half the year" and means nothing. Without
      // this the claim fired for 44 of 93 players.
      value: total && topGame && total.plays >= MIN_PLAYS_FOR_SHARE
        ? topGame.plays / total.plays
        : null,
      threshold: 0.5,
      ceiling: 0.7,
      line: topGame ? `Half the year was ${topGame.game.name}.` : '',
    },
    {
      id: 'nightOwl',
      // Same reasoning as loyalist: four late nights out of five is not a habit.
      value: owl && total && total.plays >= MIN_PLAYS_FOR_SHARE ? owl.lateShare : null,
      threshold: 0.7,
      ceiling: 0.82,
      line: owl ? `${Math.round(owl.lateShare * 100)}% of games began after dark.` : '',
    },
    {
      id: 'winner',
      // Guarded by play count: a 100% record over three games is not a record.
      value: winRate && winRate.wins + winRate.losses >= 20 ? winRate.ratio : null,
      threshold: 0.44,
      ceiling: 0.7,
      line: winRate ? `Won ${Math.round(winRate.ratio * 100)}% of the time. Hard to beat.` : '',
      quantity: 'winrate',
    },
    {
      id: 'streaker',
      value: streak?.length ?? null,
      threshold: 5,
      ceiling: 7,
      line: streak ? `${streak.length} wins in a row at the best of it.` : '',
    },
    {
      id: 'social',
      value: people?.count ?? null,
      threshold: 23,
      ceiling: 92,
      line: people ? `Played with ${formatNumber(people.count)} different people.` : '',
      quantity: 'people',
    },
    {
      id: 'haunted',
      value: nemesis && nemesis.headToHead >= 8 ? nemesis.lossRate : null,
      threshold: 0.67,
      ceiling: 0.88,
      line: nemesis ? `${nemesis.name} had your number all year.` : '',
    },
    {
      id: 'regular',
      // Every single night in one place, and enough nights for that to mean
      // something.
      value: total && location && total.nights >= 10 ? location.nights / total.nights : null,
      threshold: 1,
      ceiling: 1,
      line: location ? `Every night at ${location.name}.` : '',
      quantity: 'place',
    },
  ];

  const usable = (c: { line: string; quantity?: SuperlativeQuantity }) =>
    c.line !== '' && !(c.quantity && avoid.has(c.quantity));

  const qualifying = candidates.filter(
    (c) => c.value !== null && c.value >= c.threshold && usable(c),
  );

  if (qualifying.length === 0) {
    /**
     * Nothing was remarkable, so say something true instead.
     *
     * Ordered by how much it says about the person rather than the calendar:
     * what they were good at, what they kept coming back to, who they played
     * it with. `favourite` sits above `partner` for spread as much as for
     * interest: without it two thirds of a batch ended on the same sentence
     * shape with only the name changed.
     */
    const fallbacks: Array<{ id: SuperlativeId; line: string; quantity?: SuperlativeQuantity }> = [
      {
        id: 'bestAt',
        // "Hardest to beat" is a claim about the record, so it is only said
        // when the record supports it. `bestGame` is the *best* of their games,
        // which for plenty of players is still a losing one.
        line: bestGame
          ? bestGame.ratio >= 0.5
            ? `Hardest to beat at ${bestGame.game.name}.`
            : `Your best record was at ${bestGame.game.name}.`
          : '',
      },
      {
        id: 'favourite',
        // One play of everything is not a favourite, it is a tie broken
        // alphabetically.
        line: topGame && topGame.plays >= 2 ? `${topGame.game.name} more than anything else.` : '',
      },
      {
        id: 'partner',
        // Same rule. Somebody who played five games with five different people
        // has a top co-player they sat with once, and "almost always" would be
        // plainly false — so the wording follows the share.
        line:
          coPlayer && total && total.plays > 0
            ? coPlayer.shared / total.plays >= 0.6
              ? `Almost always across the table from ${coPlayer.name}.`
              : `More games with ${coPlayer.name} than anyone else.`
            : '',
      },
      {
        id: 'rival',
        line: nemesis ? `${nemesis.name} had the better of it.` : '',
      },
      {
        id: 'venue',
        // Tagged: "mostly at Home" is one of the fourth-fact lines, and this
        // would be the same sentence under it.
        line: location ? `The regular table was ${location.name}.` : '',
        quantity: 'place',
      },
      {
        id: 'bigDay',
        line: busiest ? `${formatDay(busiest.day)} was the busiest of the lot.` : '',
      },
      {
        id: 'bookends',
        line: bookends
          ? `Opened with ${bookends.first.game.name}, closed with ${bookends.last.game.name}.`
          : '',
      },
    ];

    const chosen = fallbacks.find(usable);
    // A fact is not a distinction, so it scores zero — nothing else is ranked
    // against it, but the field has to mean something.
    return chosen ? { id: chosen.id, line: chosen.line, score: 0 } : null;
  }

  const scored = qualifying.map((c) => ({
    id: c.id,
    line: c.line,
    // A candidate whose ceiling equals its threshold is pass/fail, not a scale.
    score:
      c.ceiling > c.threshold
        ? Math.min(1, (c.value! - c.threshold) / (c.ceiling - c.threshold))
        : 1,
  }));

  // Ties break by the catalogue order above, so the same stats always produce
  // the same line.
  return scored.reduce((best, current) => (current.score > best.score ? current : best));
};
