import type { Dataset, DateRange, NormalizedPlay, Participant } from '@/shared/types';
import { playsInRange } from '@/ingest/select';
import type { BggIndex } from '@/shared/bgg';

export interface StatContext {
  playerId: number;
  playerName: string;
  range: DateRange;
  /** Plays in range that this player took part in, oldest first. */
  playerPlays: NormalizedPlay[];
  /** Every play in range, regardless of participants. Used for group comparisons. */
  allPlays: NormalizedPlay[];
  dataset: Dataset;
  /**
   * BGG credits, keyed by bggId. Empty when nobody has run the prefetch.
   *
   * The five credit modules are the only readers, and all of them return `null`
   * below a coverage floor — so an empty index is not a broken state, it is
   * five slides that do not appear.
   */
  bgg: BggIndex;
}

export const selfOf = (play: NormalizedPlay, playerId: number): Participant | undefined =>
  play.participants.find((p) => p.playerId === playerId);

export const buildContext = (
  dataset: Dataset,
  playerId: number,
  range: DateRange,
  bgg: BggIndex = new Map(),
): StatContext => {
  const allPlays = playsInRange(dataset.plays, range);
  const playerPlays = allPlays.filter((p) =>
    p.participants.some((x) => x.playerId === playerId),
  );
  const name =
    playerPlays[0]?.participants.find((x) => x.playerId === playerId)?.name ??
    dataset.playersById.get(playerId)?.name ??
    'Unknown player';
  return { playerId, playerName: name, range, playerPlays, allPlays, dataset, bgg };
};

/**
 * Deterministic ranking. Ties break by: higher count, then earlier first
 * appearance, then alphabetical name. The same input must always produce the
 * same video, so no ordering is ever left to Map insertion order alone.
 */
export interface Tallied {
  key: string | number;
  label: string;
  count: number;
  firstSeen: number;
  extra?: Record<string, unknown>;
}

export const rank = (items: Tallied[]): Tallied[] =>
  [...items].sort(
    (a, b) =>
      b.count - a.count ||
      a.firstSeen - b.firstSeen ||
      a.label.localeCompare(b.label),
  );

export const tally = <T>(
  source: T[],
  keyOf: (item: T) => { key: string | number; label: string; at: number } | null,
  extraOf?: (item: T, acc: Tallied) => void,
): Tallied[] => {
  const map = new Map<string | number, Tallied>();
  for (const item of source) {
    const id = keyOf(item);
    if (!id) continue;
    let acc = map.get(id.key);
    if (!acc) {
      acc = { key: id.key, label: id.label, count: 0, firstSeen: id.at };
      map.set(id.key, acc);
    }
    acc.count += 1;
    acc.firstSeen = Math.min(acc.firstSeen, id.at);
    extraOf?.(item, acc);
  }
  return rank([...map.values()]);
};
