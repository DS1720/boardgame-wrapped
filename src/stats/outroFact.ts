import { formatDuration, formatNumber, formatPercent } from '@/shared/format';
import type { Stat, WrappedStats } from './types';

/**
 * One more fact for the outro, under "233 plays · 71 games · 73 nights".
 *
 * The rule that decides what qualifies: it has to add a **dimension those three
 * do not have.** Plays, games and nights are all counts of the same thing seen
 * three ways — how often, how varied, how many evenings. A fourth count of the
 * same kind reads as a rounding of the first three and tells you nothing new.
 *
 * So the candidates are ordered by how far they sit from that axis:
 *
 * 1. **Hours** — a different unit entirely. Nothing above it says how long any
 *    of this took.
 * 2. **People** — the only social fact on the card.
 * 3. **Win rate** — the only one that says how it *went* rather than how much.
 * 4. **Place** — where, which none of the others touch.
 *
 * `gamesLearned` is deliberately not a candidate: "34 new games" beside
 * "71 games" is the same axis twice, and the pair invites arithmetic the card
 * cannot support.
 *
 * Returns null when a player has none of them, which is the honest outcome for
 * a very thin year — the outro simply shows three numbers.
 */

const find = <T extends Stat['id']>(stats: WrappedStats, id: T) =>
  stats.stats.find((s) => s.id === id) as Extract<Stat, { id: T }> | undefined;

export const outroFactFor = (stats: WrappedStats | null): string | null => {
  if (!stats) return null;

  const time = find(stats, 'timePlayed');
  if (time) return `${formatDuration(time.minutes)} at the table`;

  const people = find(stats, 'coPlayerCount');
  if (people) {
    return people.count === 1 ? 'with one other person' : `with ${formatNumber(people.count)} people`;
  }

  const rate = find(stats, 'winRate');
  if (rate && rate.wins + rate.losses > 0) {
    // A co-op year's "win rate" is the group's record, not a record against
    // anyone, so it is not called one.
    return rate.coopOnly
      ? `${formatPercent(rate.ratio)} of them beaten`
      : `${formatPercent(rate.ratio)} of them won`;
  }

  const where = find(stats, 'topLocation');
  if (where) return `mostly at ${where.name}`;

  return null;
};
