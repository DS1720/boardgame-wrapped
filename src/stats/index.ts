import type { Dataset, DateRange } from '@/shared/types';
import type { BggIndex } from '@/shared/bgg';
import { buildContext, type StatContext } from './context';
import type { SlideId, Stat, WrappedStats } from './types';
import * as core from './modules/core';
import * as optional from './modules/optional';

export type StatModule = (ctx: StatContext) => Stat | null;

/** Slide order. Core modules run by default; optional ones are opt-in. */
export const MODULES: Array<{ id: SlideId; run: StatModule; core: boolean }> = [
  { id: 'totalPlays', run: core.totalPlays, core: true },
  // Sits next to the play count because the two answer the same question in
  // different units, and reads better before the video moves on to games.
  { id: 'timePlayed', run: optional.timePlayed, core: true },
  // Straight after it, because the two are one thought: how long in total, and
  // then where it went. `LINKED_PAIRS` keeps them adjacent in the cut.
  { id: 'topFiveByTime', run: optional.topFiveByTime, core: true },
  // How it went, before which games it went on: the run of verdicts about the
  // player comes first, then the countdown of games.
  { id: 'winRate', run: core.winRate, core: true },
  { id: 'longestWinStreak', run: optional.longestWinStreak, core: true },
  { id: 'bestGame', run: optional.bestGame, core: true },
  { id: 'worstGame', run: optional.worstGame, core: true },
  { id: 'topGame', run: core.topGame, core: true },
  { id: 'topFive', run: core.topFive, core: true },
  // The five BGG credit slides, as a block. Same family as the two countdowns
  // above them — what you played, seen through who made it and what it was —
  // and all five off by default: they need a prefetch the other modules do
  // not, and enabling every one would be seven list slides in a row.
  // Each hero sits directly in front of its list: the claim, then the ranking
  // it came from. `LINKED_PAIRS` keeps them adjacent however they are dragged.
  { id: 'topTheme', run: optional.topTheme, core: false },
  { id: 'topThemes', run: optional.topThemes, core: false },
  { id: 'topMechanic', run: optional.topMechanic, core: false },
  { id: 'topMechanics', run: optional.topMechanics, core: false },
  { id: 'topDesigners', run: optional.topDesigners, core: false },
  { id: 'topArtists', run: optional.topArtists, core: false },
  { id: 'topPublishers', run: optional.topPublishers, core: false },
  { id: 'highestScore', run: optional.highestScore, core: true },
  { id: 'coPlayerCount', run: optional.coPlayerCount, core: true },
  // Counts the people, then names one of them. `LINKED_PAIRS` keeps the two
  // adjacent so the bridging line always has its setup in front of it.
  { id: 'topCoPlayer', run: core.topCoPlayer, core: true },
  { id: 'gameRecord', run: optional.gameRecord, core: true },
  { id: 'nemesis', run: core.nemesis, core: true },
  { id: 'gamesLearned', run: core.gamesLearned, core: true },
  { id: 'busiestDay', run: optional.busiestDay, core: true },
  { id: 'nightOwl', run: optional.nightOwl, core: true },
  { id: 'firstAndLastPlay', run: optional.firstAndLastPlay, core: true },
  { id: 'topLocation', run: core.topLocation, core: true },
  // The one module still off by default: the plays slide already draws a count
  // of nights, and a second slide counting them is the same fact twice.
  { id: 'groupShare', run: optional.groupShare, core: false },
];

export const CORE_SLIDES: SlideId[] = MODULES.filter((m) => m.core).map((m) => m.id);

export const THIN_PLAY_THRESHOLD = 3;

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const buildWrappedStats = (
  dataset: Dataset,
  playerId: number,
  range: DateRange,
  enabled: SlideId[] = CORE_SLIDES,
  /**
   * A name to use instead of the export's, when somebody has typed one.
   *
   * Applied here rather than at each call site because `playerName` is the
   * single value the intro, the square and the output filename all read — two
   * callers remembering to override it separately is two places to forget.
   * Blank and undefined both mean "use the export's name".
   */
  displayName?: string | null,
  /**
   * BGG credits, keyed by bggId, from the prefetch manifest.
   *
   * Optional and last, so every existing caller compiles unchanged — the same
   * shape `displayName` was added in. Six positionals is the ceiling: the next
   * addition here should turn the tail into an options object.
   *
   * Omitted means an empty index, which means the five credit modules return
   * `null` and their slides do not appear. That is the correct behaviour for a
   * machine where nobody has run the prefetch.
   */
  bgg?: BggIndex | null,
): WrappedStats => {
  const ctx = buildContext(dataset, playerId, range, bgg ?? new Map());
  const on = new Set(enabled);

  const stats: Stat[] = [];
  for (const module of MODULES) {
    if (!on.has(module.id)) continue;
    // A module that cannot be computed returns null and simply has no slide.
    const result = module.run(ctx);
    if (result) stats.push(result);
  }

  return {
    playerId,
    playerName: displayName?.trim() || ctx.playerName,
    rangeLabel: range.label,
    rangeFrom: isoDay(range.from),
    rangeTo: isoDay(range.to),
    stats,
    thin: ctx.playerPlays.length < THIN_PLAY_THRESHOLD,
  };
};

export { buildContext };
export type { StatContext };
