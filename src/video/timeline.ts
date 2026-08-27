import type { SlideId, Stat, WrappedStats } from '@/stats/types';
import { MODULES } from '@/stats/index';
import { framesPerBar } from '@/shared/audio';
import { VIDEO } from './config';

/**
 * The slide plan.
 *
 * Pure and React-free, so the two rules that matter most about a timeline can
 * be tested without rendering anything: a missing stat leaves no gap, and the
 * total duration is exactly the sum of the parts.
 *
 * Lengths are expressed in bars rather than frames because step 8 puts a track
 * under this. A slide that lasts a whole number of bars can land on the beat;
 * one that lasts 87 frames never can.
 */

/** Default tempo. Step 8 replaces this with the chosen track's real tempo. */
export const DEFAULT_BPM = 120;

export type TimelineSlideId = 'intro' | 'outro' | SlideId;

/**
 * The default cut, in order, from step 7 of the plan.
 *
 * This list is also the filter: a stat with no entry here gets no slide. The
 * stats engine can emit all 17 modules, but the default video is these ten.
 * Adding an optional stat to the cut means adding it here and writing its
 * component — nothing else.
 */
export const DEFAULT_CUT: TimelineSlideId[] = [
  'intro',
  'totalPlays',
  'timePlayed',
  'topGame',
  'topFive',
  'winRate',
  'topCoPlayer',
  'nemesis',
  'gamesLearned',
  'topLocation',
  'outro',
];

/**
 * Every slide that exists, in narrative order.
 *
 * Derived from `MODULES` rather than listed again, so the order a stat appears
 * in the video is the order step 4 already chose for it and the two cannot
 * drift apart.
 */
export const ALL_SLIDES: TimelineSlideId[] = ['intro', ...MODULES.map((m) => m.id), 'outro'];

/** Shown beside each toggle in the UI. */
export const SLIDE_LABELS: Record<TimelineSlideId, string> = {
  intro: 'Intro',
  totalPlays: 'Total plays',
  timePlayed: 'Time played',
  topGame: 'Top game',
  topFive: 'Top five',
  winRate: 'Win rate',
  topCoPlayer: 'Top co-player',
  nemesis: 'Nemesis',
  gamesLearned: 'Games learned',
  topLocation: 'Top location',
  outro: 'Outro',
  longestWinStreak: 'Longest win streak',
  bestGame: 'Best game',
  worstGame: 'Worst game',
  highestScore: 'Highest score',
  coPlayerCount: 'People played with',
  busiestDay: 'Busiest day',
  nightOwl: 'Night owl',
  firstAndLastPlay: 'First and last play',
  groupShare: 'Nights attended',
};

/** The stat slides on by default: the plan's ten-slide cut, minus the bookends. */
export const DEFAULT_SLIDE_IDS: SlideId[] = DEFAULT_CUT.filter(
  (id): id is SlideId => id !== 'intro' && id !== 'outro',
);

/**
 * Turn an **ordered** list of enabled stat slides into a cut.
 *
 * The order given is the order they play in: the UI lets a person move slides
 * up and down, so this preserves what they arranged rather than re-imposing the
 * catalogue order.
 *
 * The bookends are always present and always at the ends. A video with no intro
 * is not a shorter video, it is a broken one, and an outro in the middle is not
 * an outro.
 */
export const buildCut = (enabled: Iterable<SlideId>): TimelineSlideId[] => {
  const seen = new Set<string>();
  const middle: TimelineSlideId[] = [];

  for (const id of enabled) {
    // Unknown ids and repeats are dropped rather than trusted: this list can
    // come from localStorage written by an older version of the app, and the
    // bookends must not appear twice if one sneaks in.
    const slide = id as TimelineSlideId;
    if (slide === 'intro' || slide === 'outro') continue;
    if (seen.has(slide) || !ALL_SLIDES.includes(slide)) continue;
    seen.add(slide);
    middle.push(slide);
  }

  return ['intro', ...middle, 'outro'];
};

/**
 * Move one slide up or down in an ordered selection.
 *
 * Returns the list unchanged when the move would run off either end, so the UI
 * can call it without checking first.
 */
export const moveSlide = (order: SlideId[], id: SlideId, delta: number): SlideId[] => {
  const from = order.indexOf(id);
  if (from === -1) return order;
  const to = from + delta;
  if (to < 0 || to >= order.length) return order;

  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
};

/**
 * Fold a newly enabled slide into an existing order.
 *
 * A slide switched on lands where the catalogue would have put it relative to
 * the slides already there, rather than at the end — turning one on should not
 * silently rewrite the arrangement someone made.
 */
export const insertSlide = (order: SlideId[], id: SlideId): SlideId[] => {
  if (order.includes(id)) return order;
  const rank = (slide: SlideId) => ALL_SLIDES.indexOf(slide);
  const at = order.findIndex((existing) => rank(existing) > rank(id));
  const next = [...order];
  next.splice(at === -1 ? next.length : at, 0, id);
  return next;
};

/**
 * How long each slide runs, in **whole bars**.
 *
 * Whole numbers only. A slide lasting 1.5 bars puts the next cut on a half-bar,
 * which lands between downbeats however good the tempo detection is — and it
 * would make the video's total length a fraction of a bar, failing step 8's
 * first test case. Four bars for the three slides that carry an image or a
 * grid, two for the rest, as the plan specifies.
 */
export const SLIDE_BARS: Record<TimelineSlideId, number> = {
  intro: 4,
  totalPlays: 2,
  timePlayed: 2,
  topGame: 4,
  topFive: 2,
  winRate: 2,
  topCoPlayer: 2,
  nemesis: 2,
  gamesLearned: 2,
  topLocation: 2,
  // The outro is the screenshot. It has to sit on screen long enough to take one.
  outro: 4,
  // Optional modules keep a length here so adding one to the cut is a one-line change.
  bestGame: 2,
  worstGame: 2,
  longestWinStreak: 2,
  busiestDay: 2,
  coPlayerCount: 2,
  firstAndLastPlay: 2,
  nightOwl: 2,
  groupShare: 2,
  highestScore: 2,
};

export interface PlannedSlide {
  id: TimelineSlideId;
  /** First frame of this slide, relative to the video. */
  from: number;
  durationInFrames: number;
  /** The stat this slide renders. Null for intro and outro. */
  stat: Stat | null;
}

export interface Timeline {
  slides: PlannedSlide[];
  durationInFrames: number;
  /** Whole bars the video occupies. Step 8's first test case. */
  bars: number;
  bpm: number;
}

export interface PlanOptions {
  bpm?: number;
  fps?: number;
  /** Overrides the default cut. Used by tests and, later, by the preview UI. */
  cut?: TimelineSlideId[];
}

/** A composition still needs a positive duration when there is nothing to show. */
export const EMPTY_DURATION_FRAMES = VIDEO.fps * 2;

export const slideBars = (id: TimelineSlideId): number => SLIDE_BARS[id] ?? 2;

export const slideFrames = (id: TimelineSlideId, bpm = DEFAULT_BPM, fps: number = VIDEO.fps): number =>
  Math.round(slideBars(id) * framesPerBar(bpm, fps));

/**
 * Build the timeline for one player's stats.
 *
 * Slides are laid end to end in cut order. A stat the engine did not emit —
 * a player with no nemesis, say — simply is not in the list, and the slides
 * after it move up. There is never a gap, because `from` is accumulated from
 * the durations rather than from a slide's index in the cut.
 */
export const planTimeline = (
  stats: WrappedStats | null,
  { bpm = DEFAULT_BPM, fps = VIDEO.fps as number, cut = DEFAULT_CUT }: PlanOptions = {},
): Timeline => {
  if (!stats) {
    return { slides: [], durationInFrames: EMPTY_DURATION_FRAMES, bars: 0, bpm };
  }

  const byId = new Map(stats.stats.map((stat) => [stat.id, stat]));
  const perBar = framesPerBar(bpm, fps);
  const slides: PlannedSlide[] = [];

  let barCursor = 0;
  let frameCursor = 0;

  for (const id of cut) {
    const isBookend = id === 'intro' || id === 'outro';
    const stat = isBookend ? null : byId.get(id as SlideId);
    if (!isBookend && !stat) continue;

    barCursor += slideBars(id);
    // Each boundary is rounded from its absolute bar position, never
    // accumulated from rounded durations. At 128 BPM a bar is 56.25 frames;
    // rounding every slide to 56 would lose a quarter frame per slide and put
    // the last cut a fifth of a second off the beat.
    const nextFrame = Math.round(barCursor * perBar);
    slides.push({
      id,
      from: frameCursor,
      durationInFrames: Math.max(1, nextFrame - frameCursor),
      stat: stat ?? null,
    });
    frameCursor = nextFrame;
  }

  return {
    slides,
    durationInFrames: Math.max(frameCursor, 1),
    bars: barCursor,
    bpm,
  };
};

/** The top five games, for the outro grid. Empty when the player has no topFive stat. */
export const topFiveOf = (stats: WrappedStats | null) => {
  const stat = stats?.stats.find((s) => s.id === 'topFive');
  return stat?.id === 'topFive' ? stat.games : [];
};
