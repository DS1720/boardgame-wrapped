import { formatNumber } from '@/shared/format';
import type { Stat, WrappedStats } from './types';

/**
 * One line for the outro that says what was distinctive about this player's
 * year.
 *
 * The thresholds are not invented — they come from the real export, measured
 * across the 50 players with five or more plays, and each sits at roughly the
 * 90th percentile. A superlative everyone earns is not a superlative, it is a
 * caption; if nothing clears its bar this returns null and the outro simply
 * does not show a line.
 */

export type SuperlativeId =
  | 'marathon'
  | 'explorer'
  | 'loyalist'
  | 'nightOwl'
  | 'winner'
  | 'streaker'
  | 'social'
  | 'haunted'
  | 'regular';

export interface Superlative {
  id: SuperlativeId;
  line: string;
  /** How far into the tail this player sits, 0–1. Used to pick between them. */
  score: number;
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
}

/**
 * Rank the qualifying claims by how far each sits into its own tail.
 *
 * Comparing raw values would be meaningless — 504 plays and a 0.82 late share
 * are not on the same scale — so each is normalised against the span between
 * its threshold and the highest value seen in the export.
 */
export const superlativeFor = (stats: WrappedStats | null): Superlative | null => {
  if (!stats) return null;

  const total = find(stats, 'totalPlays');
  const topGame = find(stats, 'topGame');
  const winRate = find(stats, 'winRate');
  const learned = find(stats, 'gamesLearned');
  const streak = find(stats, 'longestWinStreak');
  const owl = find(stats, 'nightOwl');
  const people = find(stats, 'coPlayerCount');
  const nemesis = find(stats, 'nemesis');
  const location = find(stats, 'topLocation');

  const candidates: Candidate[] = [
    {
      id: 'marathon',
      value: total?.plays ?? null,
      threshold: 100,
      ceiling: 504,
      line: total ? `${formatNumber(total.plays)} plays. Never off the table.` : '',
    },
    {
      id: 'explorer',
      value: learned?.count ?? null,
      threshold: 33,
      ceiling: 89,
      line: learned ? `${formatNumber(learned.count)} games learned in one year.` : '',
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
    },
  ];

  const qualifying = candidates.filter(
    (c) => c.value !== null && c.value >= c.threshold && c.line !== '',
  );
  if (qualifying.length === 0) return null;

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
