import type { Dataset, DateRange, NormalizedPlay } from '@/shared/types';

export class RangeError_ extends Error {}

export const makeRange = (from: Date, to: Date, label: string): DateRange => {
  if (to.getTime() < from.getTime()) {
    throw new RangeError_('The end date is before the start date.');
  }
  // Inclusive on both ends: extend "to" to the last millisecond of that day.
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999);
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 0, 0, 0, 0);
  return { from: start, to: end, label };
};

export const yearRange = (year: number): DateRange =>
  makeRange(new Date(year, 0, 1), new Date(year, 11, 31), String(year));

export const allTimeRange = (dataset: Dataset): DateRange => {
  const r = dataset.range;
  if (!r) throw new RangeError_('Dataset has no plays.');
  return makeRange(r.from, r.to, 'All time');
};

export const lastMonthsRange = (months: number, now = new Date()): DateRange => {
  const from = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  return makeRange(from, now, `Last ${months} months`);
};

export const playsInRange = (plays: NormalizedPlay[], range: DateRange): NormalizedPlay[] =>
  plays.filter((p) => p.date >= range.from && p.date <= range.to);

export const playsForPlayer = (
  plays: NormalizedPlay[],
  playerId: number,
): NormalizedPlay[] => plays.filter((p) => p.participants.some((x) => x.playerId === playerId));

export interface PlayerSummary {
  id: number;
  name: string;
  playCount: number;
}

/** Players who appear in the given plays, sorted by play count desc then name. */
export const playersInPlays = (
  plays: NormalizedPlay[],
): PlayerSummary[] => {
  const counts = new Map<number, PlayerSummary>();
  for (const play of plays) {
    for (const part of play.participants) {
      const existing = counts.get(part.playerId);
      if (existing) existing.playCount += 1;
      else counts.set(part.playerId, { id: part.playerId, name: part.name, playCount: 1 });
    }
  }
  return [...counts.values()].sort(
    (a, b) => b.playCount - a.playCount || a.name.localeCompare(b.name),
  );
};
