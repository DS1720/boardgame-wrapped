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
  gameRecord: 'Record holder',
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

  return ['intro', ...linkPairs(middle), 'outro'];
};

/**
 * Pull each linked pair together, first immediately before second.
 *
 * Only the leading slide moves; the trailing one keeps whatever position the
 * arrangement gave it, so someone who has dragged "Played most with" somewhere
 * particular still gets it there — with its setup now in front of it.
 */
const linkPairs = (order: TimelineSlideId[]): TimelineSlideId[] => {
  let next = order;
  for (const [first, second] of LINKED_PAIRS) {
    const at = next.indexOf(first);
    const to = next.indexOf(second);
    if (at === -1 || to === -1 || at === to - 1) continue;
    const without = next.filter((id) => id !== first);
    const before = without.indexOf(second);
    next = [...without.slice(0, before), first, ...without.slice(before)];
  }
  return next;
};

/**
 * Split an arrangement into the blocks that move as one.
 *
 * A linked pair is a single unit: its leading slide is pinned in front of its
 * partner, so stepping the partner one place would otherwise just swap the two
 * and `buildCut` would undo it — the move would look like nothing happened.
 *
 * With no pairs in the list every slide is its own unit, which is why the two
 * move functions below can be unit-aware without behaving any differently for
 * everyone who has no pair in their cut.
 */
export const unitsOf = (order: SlideId[]): SlideId[][] => {
  const leads = new Set<SlideId>(
    LINKED_PAIRS.filter(
      ([first, second]) =>
        order.includes(first as SlideId) && order.includes(second as SlideId),
    ).map(([first]) => first as SlideId),
  );

  const units: SlideId[][] = [];
  let pending: SlideId[] = [];

  for (const id of order) {
    pending.push(id);
    if (leads.has(id)) continue;
    units.push(pending);
    pending = [];
  }
  // A lead with nothing after it: not reachable through buildCut, but this is
  // also called on raw lists from storage.
  if (pending.length > 0) units.push(pending);

  return units;
};

/**
 * Move one slide up or down in an ordered selection.
 *
 * Returns the list unchanged when the move would run off either end, so the UI
 * can call it without checking first. A slide in a linked pair carries the
 * whole pair with it.
 */
export const moveSlide = (order: SlideId[], id: SlideId, delta: number): SlideId[] => {
  const units = unitsOf(order);
  const from = units.findIndex((unit) => unit.includes(id));
  if (from === -1) return order;

  const to = from + delta;
  if (to < 0 || to >= units.length) return order;

  const next = [...units];
  const [moving] = next.splice(from, 1);
  next.splice(to, 0, moving);
  return next.flat();
};

/**
 * Move one slide to an absolute position.
 *
 * The arrows ask "one step that way"; a drop asks "put it *here*". So unlike
 * `moveSlide` this clamps rather than refusing — a drop past either end is a
 * clear instruction to put the slide at that end, not a mistake to ignore.
 *
 * `index` is the position the slide ends up at in the returned list, which is
 * what makes `moveSlideTo(order, id, i)` mean "where row i is now".
 */
/**
 * The arrangement as it will actually play, without the bookends.
 *
 * `buildCut` can move a slide — it pulls each linked pair together — so the
 * list someone is looking at has to be this one and not the raw selection.
 * Otherwise the picker shows one order and the video plays another.
 *
 * Idempotent, which is what lets the UI feed its own output back in: the pairs
 * are already adjacent the second time through.
 */
export const arrangementOf = (order: SlideId[]): SlideId[] =>
  buildCut(order).filter((id): id is SlideId => id !== 'intro' && id !== 'outro');

export const moveSlideTo = (order: SlideId[], id: SlideId, index: number): SlideId[] => {
  const units = unitsOf(order);
  const from = units.findIndex((unit) => unit.includes(id));
  if (from === -1) return order;

  // `index` is a row, and rows are not units — resolve it to the unit that row
  // belongs to, so dropping on either half of a pair means the same thing.
  const row = Math.max(0, Math.min(order.length - 1, index));
  const to = units.findIndex((unit) => unit.includes(order[row]));
  if (to === -1 || to === from) return order;

  const next = [...units];
  const [moving] = next.splice(from, 1);
  next.splice(to, 0, moving);
  return next.flat();
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
 * Frames a lead-in line holds before its slide starts arriving.
 *
 * Comfortably inside one bar at any sensible tempo, which is what the extra bar
 * below pays for.
 */
export const LEAD_IN_FRAMES = 46;

/** An extra bar for any slide that has a line to deliver first. */
export const LEAD_IN_BARS = 1;

/**
 * Which slides open with a line, and what it says.
 *
 * Deliberately not every slide. A setup before each one would be a narrator,
 * and the video would stop being about the numbers. These are the slides where
 * a beat of anticipation actually pays — a name, a rate, a verdict — and each
 * line trails off because the next beat delivers the thing.
 */
export const LEAD_INS: Partial<Record<TimelineSlideId, string>> = {
  topGame: 'One game more than any other…',
  topFive: 'The five that defined the year…',
  bestGame: 'You were particularly good at one of them…',
  worstGame: 'And then there was this one…',
  nemesis: 'Someone had your number…',
  gamesLearned: 'You did not just replay old favourites…',
  highestScore: 'Your best night at the table…',
};

/**
 * Lines that only appear when one particular slide runs directly before.
 *
 * "Played with" counts the people; "Played most with" names one of them. Back
 * to back they are two halves of the same thought, and the line in between is
 * what makes them read that way instead of as two unrelated counts. Alone,
 * either slide is still a perfectly good slide — which is why this is keyed on
 * what actually precedes it rather than baked into the component.
 */
export const PAIRED_LEAD_INS: Partial<
  Record<TimelineSlideId, { after: TimelineSlideId; line: string }>
> = {
  topCoPlayer: {
    after: 'coPlayerCount',
    line: 'But one of them was at the table more than anyone…',
  },
};

/**
 * Slide pairs that are kept together, in this order, whenever both are in.
 *
 * `buildCut` pulls the first up against the second, so the bridging line above
 * always has its setup immediately before it.
 */
export const LINKED_PAIRS: ReadonlyArray<readonly [TimelineSlideId, TimelineSlideId]> = [
  ['coPlayerCount', 'topCoPlayer'],
];

export const leadInFor = (
  id: TimelineSlideId,
  previous: TimelineSlideId | null = null,
): string | null => {
  const paired = PAIRED_LEAD_INS[id];
  if (paired && previous === paired.after) return paired.line;
  return LEAD_INS[id] ?? null;
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
  // Two bars, not four. The intro carries a name and a date — there is nothing
  // to read for eight seconds, and a title card that outstays its content is
  // the fastest way to lose someone before the first number.
  intro: 2,
  totalPlays: 2,
  timePlayed: 2,
  // Three, not four. Eight seconds is a long time to hold one cover and one
  // number, and this slide has read as finished well before it cut for as long
  // as it has been four. The outro keeps its four: that one is the screenshot,
  // and it has to sit still long enough to take one.
  topGame: 3,
  // Long enough to count down from five, one at a time, and still hold the
  // finished list for a moment.
  topFive: 3,
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
  // Three: it carries a cover, a name, a number and two lines under it.
  gameRecord: 3,
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
  /**
   * The line that introduces this slide, or null.
   *
   * Resolved here rather than by the component, because it can depend on what
   * runs before it and **the slide's length depends on it**. Two places working
   * that out separately is two places to get it wrong.
   */
  leadIn: string | null;
}

export interface Timeline {
  slides: PlannedSlide[];
  durationInFrames: number;
  /** Whole bars the video occupies. Step 8's first test case. */
  bars: number;
  bpm: number;
}

/**
 * The index of the slide showing at `frame`, clamped into the video.
 *
 * Separate from `slideAt` because the ground needs the *position*, not the id:
 * the palette cycle is indexed, and two different slides are meant to be two
 * different colours even when they would answer the same id.
 */
export const slideIndexAt = (timeline: Timeline, frame: number): number => {
  for (let i = 0; i < timeline.slides.length; i += 1) {
    const slide = timeline.slides[i];
    if (frame >= slide.from && frame < slide.from + slide.durationInFrames) return i;
  }
  // Before the first frame, and on the very last one, the answer is still a
  // slide: the ground is painted from this, and there is no frame of the video
  // that is allowed to have no colour.
  return frame < 0 ? 0 : Math.max(0, timeline.slides.length - 1);
};

/**
 * The slide showing at `frame`, or null if the frame is outside the video.
 *
 * A plain scan rather than a binary search: eleven slides, called once per
 * frame update, and being obviously correct is worth more here than being fast.
 */
export const slideAt = (timeline: Timeline, frame: number): TimelineSlideId | null => {
  for (const slide of timeline.slides) {
    if (frame >= slide.from && frame < slide.from + slide.durationInFrames) return slide.id;
  }
  // The very last frame is inside the last slide, not past it.
  const last = timeline.slides[timeline.slides.length - 1];
  if (last && frame >= last.from) return last.id;
  return null;
};

export interface PlanOptions {
  bpm?: number;
  fps?: number;
  /** Overrides the default cut. Used by tests and, later, by the preview UI. */
  cut?: TimelineSlideId[];
}

/** A composition still needs a positive duration when there is nothing to show. */
export const EMPTY_DURATION_FRAMES = VIDEO.fps * 2;

/**
 * A slide's length, including the bar its lead-in needs.
 *
 * Added here rather than baked into `SLIDE_BARS` so the two stay separable: the
 * table says how long the content wants, this says what it actually gets.
 */
export const slideBars = (id: TimelineSlideId, previous: TimelineSlideId | null = null): number =>
  (SLIDE_BARS[id] ?? 2) + (leadInFor(id, previous) ? LEAD_IN_BARS : 0);

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
  // The slide actually emitted before this one, which is not the same as the
  // one before it in the cut: a stat the player has no data for is skipped.
  let previous: TimelineSlideId | null = null;

  for (const id of cut) {
    const isBookend = id === 'intro' || id === 'outro';
    const stat = isBookend ? null : byId.get(id as SlideId);
    if (!isBookend && !stat) continue;

    const leadIn = leadInFor(id, previous);
    barCursor += slideBars(id, previous);
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
      leadIn,
    });
    frameCursor = nextFrame;
    previous = id;
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
