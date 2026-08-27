import type { Dataset, DateRange } from '@/shared/types';
import { buildContext, type StatContext } from './context';
import type { SlideId, Stat, WrappedStats } from './types';
import * as core from './modules/core';
import * as optional from './modules/optional';

export type StatModule = (ctx: StatContext) => Stat | null;

/** Slide order. Core modules run by default; optional ones are opt-in. */
export const MODULES: Array<{ id: SlideId; run: StatModule; core: boolean }> = [
  { id: 'totalPlays', run: core.totalPlays, core: true },
  { id: 'topGame', run: core.topGame, core: true },
  { id: 'topFive', run: core.topFive, core: true },
  { id: 'winRate', run: core.winRate, core: true },
  { id: 'longestWinStreak', run: optional.longestWinStreak, core: false },
  { id: 'bestGame', run: optional.bestGame, core: false },
  { id: 'worstGame', run: optional.worstGame, core: false },
  { id: 'highestScore', run: optional.highestScore, core: false },
  { id: 'topCoPlayer', run: core.topCoPlayer, core: true },
  { id: 'nemesis', run: core.nemesis, core: true },
  { id: 'coPlayerCount', run: optional.coPlayerCount, core: false },
  { id: 'gamesLearned', run: core.gamesLearned, core: true },
  { id: 'busiestDay', run: optional.busiestDay, core: false },
  { id: 'nightOwl', run: optional.nightOwl, core: false },
  { id: 'firstAndLastPlay', run: optional.firstAndLastPlay, core: false },
  { id: 'topLocation', run: core.topLocation, core: true },
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
): WrappedStats => {
  const ctx = buildContext(dataset, playerId, range);
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
export type { StatContext };
