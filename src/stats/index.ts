import type { Dataset, DateRange } from '@/shared/types';
import type { BggIndex } from '@/shared/bgg';
import { buildContext, type PlayerNameResolver, type StatContext } from './context';
import type { SlideId, Stat, WrappedStats } from './types';
import * as core from './modules/core';
import * as optional from './modules/optional';

export type StatModule = (ctx: StatContext) => Stat | null;

export interface BuildWrappedStatsOptions {
  /**
   * Compatibility hook for the selected player's display name. Prefer
   * `displayNameOf` when aliases may apply to other players in the video too.
   */
  displayName?: string | null;
  /**
   * The display name for any player in the export.
   *
   * The player picker lets every row be renamed, and stats such as top
   * co-player and nemesis name people other than the video's owner. Keeping the
   * resolver in the context means those stats cannot quietly fall back to the
   * raw export name.
   */
  displayNameOf?: PlayerNameResolver | null;
  bgg?: BggIndex | null;
}

/** Slide order. Core modules run by default; optional ones are opt-in. */
export const MODULES: Array<{ id: SlideId; run: StatModule; core: boolean }> = [
  { id: 'totalPlays', run: core.totalPlays, core: true },
  // Sits next to the play count because the two answer the same question in
  // different units, and reads better before the video moves on to games.
  { id: 'timePlayed', run: optional.timePlayed, core: true },
  // Straight after it, because the two are one thought: how long in total, and
  // then where it went. `LINKED_PAIRS` keeps them adjacent in the cut.
  { id: 'topFiveByTime', run: optional.topFiveByTime, core: true },
  { id: 'distinctGames', run: core.distinctGames, core: true },
  { id: 'topGame', run: core.topGame, core: true },
  { id: 'topFive', run: core.topFive, core: true },
  // The BGG credit slides in their catalogue positions. Top theme is part of
  // the default story when data exists; the list and people-shaped credit
  // slides stay opt-in so enabling them does not add a long list block by
  // default.
  // Each hero sits directly in front of its list: the claim, then the ranking
  // it came from. `LINKED_PAIRS` keeps them adjacent however they are dragged.
  { id: 'topTheme', run: optional.topTheme, core: true },
  { id: 'topThemes', run: optional.topThemes, core: false },
  { id: 'winRate', run: core.winRate, core: true },
  { id: 'longestWinStreak', run: optional.longestWinStreak, core: true },
  { id: 'bestGame', run: optional.bestGame, core: true },
  { id: 'worstGame', run: optional.worstGame, core: true },
  { id: 'topMechanic', run: optional.topMechanic, core: false },
  { id: 'topMechanics', run: optional.topMechanics, core: false },
  { id: 'coPlayerCount', run: optional.coPlayerCount, core: true },
  // Counts the people, then names one of them. `LINKED_PAIRS` keeps the two
  // adjacent so the bridging line always has its setup in front of it.
  { id: 'topCoPlayer', run: core.topCoPlayer, core: true },
  { id: 'nemesis', run: core.nemesis, core: true },
  { id: 'gamesLearned', run: core.gamesLearned, core: true },
  { id: 'highestScore', run: optional.highestScore, core: false },
  { id: 'gameRecord', run: optional.gameRecord, core: true },
  { id: 'topDesigners', run: optional.topDesigners, core: false },
  { id: 'topArtists', run: optional.topArtists, core: false },
  { id: 'busiestDay', run: optional.busiestDay, core: true },
  { id: 'nightOwl', run: optional.nightOwl, core: true },
  { id: 'topLocation', run: core.topLocation, core: true },
  { id: 'topPublishers', run: optional.topPublishers, core: false },
  // The plays slide already draws a count of nights, and a second slide
  // counting them is opt-in.
  { id: 'groupShare', run: optional.groupShare, core: false },
  { id: 'firstAndLastPlay', run: optional.firstAndLastPlay, core: true },
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
   * Options for names and BGG credits. The previous
   * `buildWrappedStats(..., displayName, bgg)` call shape is still accepted.
   */
  optionsOrDisplayName?: BuildWrappedStatsOptions | string | null,
  legacyBgg?: BggIndex | null,
): WrappedStats => {
  const options =
    typeof optionsOrDisplayName === 'object' && optionsOrDisplayName !== null
      ? optionsOrDisplayName
      : null;
  const displayName =
    typeof optionsOrDisplayName === 'string'
      ? optionsOrDisplayName
      : options?.displayName;
  const bgg = options ? options.bgg : legacyBgg;
  const resolveName = options?.displayNameOf ?? ((_id: number, actual: string) => actual);
  const selectedName = displayName?.trim();
  const displayNameOf: PlayerNameResolver = (id, actual) =>
    id === playerId && selectedName ? selectedName : resolveName(id, actual);

  const ctx = buildContext(dataset, playerId, range, bgg ?? new Map(), displayNameOf);
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
    playerName: ctx.playerName,
    rangeLabel: range.label,
    rangeFrom: isoDay(range.from),
    rangeTo: isoDay(range.to),
    stats,
    thin: ctx.playerPlays.length < THIN_PLAY_THRESHOLD,
  };
};

export { buildContext };
export type { PlayerNameResolver, StatContext };
