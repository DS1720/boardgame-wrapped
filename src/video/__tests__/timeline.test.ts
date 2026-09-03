import { describe, expect, it } from 'vitest';
import type { Stat, WrappedStats } from '@/stats/types';
import { VIDEO } from '../config';
import { framesPerBar } from '@/shared/audio';
import {
  buildCut,
  DEFAULT_BPM,
  ALL_SLIDES,
  DEFAULT_CUT,
  EMPTY_DURATION_FRAMES,
  LEAD_IN_BARS,
  LEAD_INS,
  LEAD_IN_FRAMES,
  leadInFor,
  PAIRED_LEAD_INS,
  planTimeline,
  barsFor,
  clampBars,
  MAX_SLIDE_BARS,
  MIN_SLIDE_BARS,
  parseBarOverrides,
  slideAt,
  slideIndexAt,
  slideBars,
  slideFrames,
  SLIDE_BARS,
  SLIDE_LABELS,
  type TimelineSlideId,
  topFiveOf,
} from '../timeline';
import { SLIDE_COMPONENTS } from '../slides';

const game = (gameId: number, name: string) => ({ gameId, name, boxArt: null, bggId: gameId });

const ALL_CORE: Stat[] = [
  { id: 'totalPlays', core: true, plays: 233, nights: 73, distinctGames: 71 },
  {
    id: 'timePlayed',
    core: true,
    minutes: 6852,
    playsCounted: 229,
    playsMissing: 4,
    topGame: { ...game(99, 'Terraforming Mars'), minutes: 480, plays: 4 },
  },
  {
    id: 'topFiveByTime',
    core: true,
    // Deliberately a different order from the play count below it: that
    // contrast is the reason this slide exists.
    games: [
      { ...game(99, 'Terraforming Mars'), minutes: 480, plays: 4 },
      { ...game(77, 'Faraway'), minutes: 420, plays: 21 },
      { ...game(78, 'Phantom Ink'), minutes: 300, plays: 15 },
      { ...game(23, 'Bluff'), minutes: 200, plays: 10 },
      { ...game(40, 'Hitster'), minutes: 180, plays: 9 },
    ],
  },
  { id: 'winRate', core: true, wins: 61, losses: 161, ratio: 61 / 222, coopOnly: false },
  { id: 'longestWinStreak', core: true, length: 7 },
  { id: 'bestGame', core: true, game: game(23, 'Bluff'), ratio: 0.7, plays: 10 },
  { id: 'worstGame', core: true, game: game(63, 'Castle Combo'), ratio: 0.1, plays: 10 },
  { id: 'topGame', core: true, game: game(77, 'Faraway'), plays: 21, standing: null },
  {
    id: 'topFive',
    core: true,
    games: [
      { ...game(77, 'Faraway'), plays: 21 },
      { ...game(78, 'Phantom Ink'), plays: 15 },
      { ...game(23, 'Bluff'), plays: 10 },
      { ...game(63, 'Castle Combo'), plays: 10 },
      { ...game(40, 'Hitster'), plays: 9 },
    ],
  },
  {
    id: 'highestScore',
    core: true,
    score: 466,
    game: game(31, 'La Cuenta'),
    day: '2026-04-02',
    won: true,
  },
  { id: 'coPlayerCount', core: true, count: 60 },
  { id: 'topCoPlayer', core: true, name: 'Dario', playerId: 1, shared: 180, others: [] },
  {
    id: 'gameRecord',
    core: true,
    game: game(23, 'Bluff'),
    score: 88,
    plays: 10,
    otherRecords: 2,
    contenders: 5,
    highestWins: true,
    shared: false,
  },
  { id: 'nemesis', core: true, name: 'Markus', playerId: 2, lossesTo: 14, headToHead: 30, lossRate: 14 / 30 },
  { id: 'gamesLearned', core: true, count: 34, games: [game(1, 'A'), game(2, 'B')] },
  { id: 'busiestDay', core: true, day: '2026-03-14', plays: 9 },
  { id: 'nightOwl', core: true, peakHour: 20, playsAtPeak: 40, lateShare: 0.46 },
  {
    id: 'firstAndLastPlay',
    core: true,
    first: { day: '2026-01-03', game: game(77, 'Faraway') },
    last: { day: '2026-12-27', game: game(40, 'Hitster') },
  },
  { id: 'topLocation', core: true, name: 'Home', nights: 40 },
];


const statsWith = (stats: Stat[]): WrappedStats => ({
  playerId: 4,
  playerName: 'Tina',
  rangeLabel: '2026',
  rangeFrom: '2026-01-01',
  rangeTo: '2026-12-31',
  stats,
  thin: false,
});

describe('the default cut', () => {
  it("is the plan's cut, in order, plus the estimated play time", () => {
    expect(DEFAULT_CUT).toEqual([
      'intro',
      'totalPlays',
      // Sits beside the play count: the same question answered in hours.
      'timePlayed',
      // And immediately after it, where that time went.
      'topFiveByTime',
      'winRate',
      'longestWinStreak',
      'bestGame',
      'worstGame',
      'topGame',
      'topFive',
      'highestScore',
      // Counts the people, then names one of them.
      'coPlayerCount',
      'topCoPlayer',
      'gameRecord',
      'nemesis',
      'gamesLearned',
      'busiestDay',
      'nightOwl',
      'firstAndLastPlay',
      'topLocation',
      'outro',
    ]);
  });

  it('has a component for every slide in the cut', () => {
    // A slide that can be planned but not drawn would render an empty frame.
    for (const id of DEFAULT_CUT) {
      expect(SLIDE_COMPONENTS[id]).toBeTypeOf('function');
    }
  });

  it('gives every slide in the cut a length', () => {
    for (const id of DEFAULT_CUT) {
      expect(SLIDE_BARS[id]).toBeGreaterThan(0);
    }
  });

  /*
    The five BGG credit slides. They are opt-in, so nothing in the default cut
    reaches them — which is exactly why they need asserting: a missing entry in
    any of these three tables is invisible until somebody switches one on.
  */
  const CREDIT_SLIDES = [
    'topTheme',
    'topThemes',
    'topMechanic',
    'topMechanics',
    'topDesigners',
    'topArtists',
    'topPublishers',
  ] as const;

  it('registers every credit slide without putting it in the default cut', () => {
    for (const id of CREDIT_SLIDES) {
      expect(ALL_SLIDES).toContain(id);
      expect(SLIDE_COMPONENTS[id]).toBeTypeOf('function');
      expect(SLIDE_BARS[id]).toBeGreaterThan(0);
      expect(SLIDE_LABELS[id]).toBeTruthy();
      // They need a prefetch the other modules do not, and five list slides in
      // a row is not a default anybody chose.
      expect(DEFAULT_CUT).not.toContain(id);
    }
  });

  it('lets every credit section introduce itself and no more', () => {
    /*
      A line costs a bar, so only the head of a section gets one: the two theme
      and mechanic slides (either of which can open its section, depending on
      which is switched on) and the designers slide, which is what reframes the
      video from games to people. Artists and publishers follow it and start
      cold.
    */
    const withLine = CREDIT_SLIDES.filter((id) => leadInFor(id) !== null);
    expect(withLine).toEqual(['topTheme', 'topThemes', 'topMechanic', 'topMechanics', 'topDesigners']);
  });

  it('says a linked pair’s introduction once, not twice', () => {
    /*
      Both halves of a pair carry the same line so either can open the section
      alone. Run together — which `LINKED_PAIRS` guarantees whenever both are
      in — the second would repeat it one bar after the first said it.
    */
    for (const [first, second] of [
      ['topTheme', 'topThemes'],
      ['topMechanic', 'topMechanics'],
    ] as const) {
      expect(leadInFor(first)).not.toBeNull();
      expect(leadInFor(second)).toBe(leadInFor(first));
      expect(leadInFor(second, first)).toBeNull();
    }
  });

  it('leaves a pair with its own joining line alone', () => {
    // `topFiveByTime` has a PAIRED_LEAD_IN that exists precisely to be said on
    // the join, so the suppression above must not swallow it.
    expect(leadInFor('topFiveByTime', 'timePlayed')).not.toBeNull();
    expect(leadInFor('topCoPlayer', 'coPlayerCount')).not.toBeNull();
  });
});

describe('planTimeline', () => {
  it('lays the full cut end to end', () => {
    const { slides } = planTimeline(statsWith(ALL_CORE));
    expect(slides.map((s) => s.id)).toEqual(DEFAULT_CUT);
  });

  // Step 7, test case 5.
  it('has a duration exactly equal to the sum of its slides', () => {
    const { slides, durationInFrames } = planTimeline(statsWith(ALL_CORE));
    const sum = slides.reduce((total, slide) => total + slide.durationInFrames, 0);
    expect(durationInFrames).toBe(sum);
  });

  // Step 7, test case 2.
  it('drops a missing stat and leaves no gap', () => {
    const withoutNemesis = ALL_CORE.filter((s) => s.id !== 'nemesis');
    const { slides, durationInFrames } = planTimeline(statsWith(withoutNemesis));

    expect(slides.map((s) => s.id)).not.toContain('nemesis');
    expect(slides).toHaveLength(DEFAULT_CUT.length - 1);

    // Every slide starts exactly where the previous one ended.
    let expectedFrom = 0;
    for (const slide of slides) {
      expect(slide.from).toBe(expectedFrom);
      expectedFrom += slide.durationInFrames;
    }
    expect(durationInFrames).toBe(expectedFrom);
  });

  it('stays contiguous however many stats are missing', () => {
    for (let keep = 0; keep <= ALL_CORE.length; keep += 1) {
      const { slides, durationInFrames } = planTimeline(statsWith(ALL_CORE.slice(0, keep)));
      let cursor = 0;
      for (const slide of slides) {
        expect(slide.from).toBe(cursor);
        cursor += slide.durationInFrames;
      }
      expect(durationInFrames).toBe(cursor);
      // The bookends always survive.
      expect(slides[0].id).toBe('intro');
      expect(slides.at(-1)?.id).toBe('outro');
    }
  });

  it('keeps the bookends even for a player with no stats at all', () => {
    const { slides } = planTimeline(statsWith([]));
    expect(slides.map((s) => s.id)).toEqual(['intro', 'outro']);
  });

  it('ignores optional stats that are not in the cut', () => {
    const withOptional: Stat[] = [
      ...ALL_CORE,
      { id: 'groupShare', core: false, ratio: 0.8, attended: 73, total: 91 },
    ];
    // The engine emits more modules than the default video shows.
    expect(planTimeline(statsWith(withOptional)).slides).toHaveLength(DEFAULT_CUT.length);
  });

  it('can be given a different cut', () => {
    const { slides } = planTimeline(statsWith(ALL_CORE), { cut: ['intro', 'winRate', 'outro'] });
    expect(slides.map((s) => s.id)).toEqual(['intro', 'winRate', 'outro']);
  });

  it('returns a usable duration with no stats to plan', () => {
    const empty = planTimeline(null);
    expect(empty.slides).toEqual([]);
    // A composition with zero frames cannot be rendered at all.
    expect(empty.durationInFrames).toBe(EMPTY_DURATION_FRAMES);
    expect(empty.durationInFrames).toBeGreaterThan(0);
  });

  it('never returns a zero-length video', () => {
    expect(planTimeline(statsWith([])).durationInFrames).toBeGreaterThan(0);
  });
});

describe('slide lengths', () => {
  it('are whole bars at the default tempo, so step 8 can land on the beat', () => {
    for (const id of DEFAULT_CUT) {
      const frames = slideFrames(id, DEFAULT_BPM);
      expect(Number.isInteger(frames)).toBe(true);
      expect(frames).toBeGreaterThan(0);
    }
  });

  it('scale with tempo', () => {
    // Twice the tempo, half the wall-clock length for the same number of bars.
    expect(slideFrames('intro', 240)).toBe(slideFrames('intro', 120) / 2);
  });

  it('give the outro the longest hold, because it is the screenshot', () => {
    // Compared against content length, not total: a slide with a lead-in is
    // longer overall but does not hold its content for longer.
    const outro = SLIDE_BARS.outro;
    for (const id of DEFAULT_CUT.filter((s) => s !== 'outro')) {
      expect(outro).toBeGreaterThanOrEqual(SLIDE_BARS[id]);
    }
  });

  it('only charges the extra bar to slides that actually have a line', () => {
    const withLine = DEFAULT_CUT.filter((id) => leadInFor(id) !== null);
    expect(withLine.length).toBeGreaterThan(0);
    // Not every slide: a setup before each one would be a narrator.
    expect(withLine.length).toBeLessThan(DEFAULT_CUT.length / 2);
  });

  it('produces a video of a sane length for a full year', () => {
    // Grew from 56s when the lead-in lines and the top-five countdown landed,
    // and again when the cut went from ten stat slides to nineteen. The ceiling
    // is what a story-format video can hold, not a target.
    const seconds = planTimeline(statsWith(ALL_CORE)).durationInFrames / VIDEO.fps;
    expect(seconds).toBeGreaterThan(20);
    expect(seconds).toBeLessThan(150);
  });

  it('charges a slide with a lead-in exactly one extra bar', () => {
    // topGame opens with a line; topLocation does not.
    expect(slideBars('topGame')).toBe(SLIDE_BARS.topGame + LEAD_IN_BARS);
    expect(slideBars('topLocation')).toBe(SLIDE_BARS.topLocation);
  });

  it('keeps every slide a whole number of bars, lead-ins included', () => {
    for (const id of DEFAULT_CUT) {
      expect(slideBars(id) % 1).toBe(0);
    }
  });

  it('leaves room for the line inside the bar it charges for', () => {
    // A lead-in that outlasted the bar it was given would eat into the content
    // it is introducing.
    expect(LEAD_IN_FRAMES).toBeLessThan(framesPerBar(DEFAULT_BPM, VIDEO.fps));
  });
});

describe('slideIndexAt', () => {
  const plan = planTimeline(statsWith(ALL_CORE));

  it('agrees with slideAt on every frame of the video', () => {
    for (let f = 0; f < plan.durationInFrames; f += 1) {
      expect(plan.slides[slideIndexAt(plan, f)].id).toBe(slideAt(plan, f));
    }
  });

  // The ground is painted from this, and there is no frame that may have no
  // colour — so unlike `slideAt` it answers outside the video too.
  it('clamps rather than answering nothing outside the video', () => {
    expect(slideIndexAt(plan, -50)).toBe(0);
    expect(slideIndexAt(plan, plan.durationInFrames + 500)).toBe(plan.slides.length - 1);
  });
});

describe('slideAt', () => {
  const plan = planTimeline(statsWith(ALL_CORE));

  it('names the slide under a frame', () => {
    for (const slide of plan.slides) {
      expect(slideAt(plan, slide.from)).toBe(slide.id);
      expect(slideAt(plan, slide.from + slide.durationInFrames - 1)).toBe(slide.id);
    }
  });

  it('hands a boundary frame to the slide that is starting', () => {
    // A cut belongs to the incoming slide: at frame `from` the new one is
    // already on screen.
    const [first, second] = plan.slides;
    expect(slideAt(plan, first.from + first.durationInFrames)).toBe(second.id);
  });

  it('covers every frame of the video, with no gaps', () => {
    for (let f = 0; f < plan.durationInFrames; f++) {
      expect(slideAt(plan, f)).not.toBeNull();
    }
  });

  it('keeps the last frame on the last slide rather than falling off the end', () => {
    const last = plan.slides[plan.slides.length - 1];
    expect(slideAt(plan, plan.durationInFrames)).toBe(last.id);
    expect(slideAt(plan, plan.durationInFrames - 1)).toBe(last.id);
  });

  it('is null before the video starts, and on an empty plan', () => {
    expect(slideAt(plan, -1)).toBeNull();
    expect(slideAt(planTimeline(null), 0)).toBeNull();
  });
});

describe('the linked co-player pair', () => {
  const BRIDGE = PAIRED_LEAD_INS.topCoPlayer!.line;

  // The count is in the default cut, so it is already in ALL_CORE. The
  // interesting case is the player who has no co-player count at all.
  const withCount = (): Stat[] => ALL_CORE;
  const withoutCount = (): Stat[] => ALL_CORE.filter((s) => s.id !== 'coPlayerCount');

  it('pulls the count up against the person, whatever order they were given in', () => {
    const cut = buildCut(['totalPlays', 'topCoPlayer', 'nemesis', 'coPlayerCount']);
    expect(cut.indexOf('coPlayerCount')).toBe(cut.indexOf('topCoPlayer') - 1);
  });

  it('leaves the trailing slide where the arrangement put it', () => {
    // Only the leading slide moves: someone who dragged "Played most with" to
    // the end still gets it at the end, with its setup now in front of it.
    const cut = buildCut(['coPlayerCount', 'totalPlays', 'nemesis', 'topCoPlayer']);
    expect(cut).toEqual(['intro', 'totalPlays', 'nemesis', 'coPlayerCount', 'topCoPlayer', 'outro']);
  });

  it('does nothing when only one of the two is in the cut', () => {
    expect(buildCut(['totalPlays', 'topCoPlayer'])).toEqual([
      'intro',
      'totalPlays',
      'topCoPlayer',
      'outro',
    ]);
    expect(buildCut(['totalPlays', 'coPlayerCount'])).toEqual([
      'intro',
      'totalPlays',
      'coPlayerCount',
      'outro',
    ]);
  });

  it('says the bridging line only when the count actually ran before it', () => {
    expect(leadInFor('topCoPlayer', 'coPlayerCount')).toBe(BRIDGE);
    expect(leadInFor('topCoPlayer', 'winRate')).toBeNull();
    expect(leadInFor('topCoPlayer')).toBeNull();
  });

  it('gives the paired slide its lead-in bar, so the content keeps its full time', () => {
    expect(slideBars('topCoPlayer', 'coPlayerCount')).toBe(
      SLIDE_BARS.topCoPlayer + LEAD_IN_BARS,
    );
    expect(slideBars('topCoPlayer', 'winRate')).toBe(SLIDE_BARS.topCoPlayer);
  });

  it('plans the line onto the slide, and only that slide', () => {
    const plan = planTimeline(statsWith(withCount()), { cut: buildCut(withCount().map((s) => s.id)) });
    const paired = plan.slides.find((s) => s.id === 'topCoPlayer')!;
    const before = plan.slides[plan.slides.indexOf(paired) - 1];

    expect(before.id).toBe('coPlayerCount');
    expect(paired.leadIn).toBe(BRIDGE);
    expect(before.leadIn).toBeNull();
  });

  it('drops the line when the player has no co-player count to set it up', () => {
    // The stat module returned null, so the slide is never emitted — and the
    // line that introduces it must not be left stranded on the next slide.
    const plan = planTimeline(statsWith(withoutCount()), {
      cut: buildCut(withCount().map((s) => s.id)),
    });
    const paired = plan.slides.find((s) => s.id === 'topCoPlayer')!;
    expect(paired.leadIn).toBeNull();
    expect(paired.durationInFrames).toBe(slideFrames('topCoPlayer'));
  });
});

describe('topFiveOf', () => {
  it('finds the games for the outro grid', () => {
    expect(topFiveOf(statsWith(ALL_CORE))).toHaveLength(5);
  });

  it('is empty rather than undefined when there is no top five', () => {
    expect(topFiveOf(statsWith([]))).toEqual([]);
    expect(topFiveOf(null)).toEqual([]);
  });
});

describe('slide lengths chosen by hand', () => {
  it('is the table until somebody says otherwise', () => {
    expect(barsFor('topGame')).toBe(SLIDE_BARS.topGame);
    expect(barsFor('topGame', { topGame: 5 })).toBe(5);
  });

  it('makes the video longer or shorter by exactly what was asked', () => {
    const base = planTimeline(statsWith(ALL_CORE));
    const longer = planTimeline(statsWith(ALL_CORE), { bars: { topGame: SLIDE_BARS.topGame + 2 } });
    expect(longer.bars).toBe(base.bars + 2);
  });

  // The override replaces the content length, not the total. A slide with a
  // lead-in still gets its extra bar, so setting a length means the same amount
  // of content time wherever the slide happens to sit.
  it('leaves a lead-in its own bar', () => {
    const introduced = (Object.keys(LEAD_INS) as TimelineSlideId[]).filter((id) => LEAD_INS[id]);
    expect(introduced.length).toBeGreaterThan(0);
    for (const id of introduced) {
      expect(slideBars(id, null, { [id]: 2 })).toBe(2 + LEAD_IN_BARS);
      // And a slide with no line gets exactly what was asked for.
      expect(slideBars('winRate', null, { winRate: 2 })).toBe(2);
    }
  });

  it('keeps every cut on a whole bar', () => {
    const plan = planTimeline(statsWith(ALL_CORE), {
      bars: { totalPlays: 1, topGame: 6, outro: 3 },
    });
    let total = 0;
    for (const slide of plan.slides) total += slideBars(slide.id, null, {});
    // Lengths stay whole numbers whatever is chosen, which is the whole reason
    // this is measured in bars rather than seconds.
    expect(Number.isInteger(plan.bars)).toBe(true);
    expect(total).toBeGreaterThan(0);
  });
});

describe('a chosen length, made safe', () => {
  it('is a whole number inside the range', () => {
    expect(clampBars(3)).toBe(3);
    expect(clampBars(2.6)).toBe(3);
    expect(clampBars(0)).toBe(MIN_SLIDE_BARS);
    expect(clampBars(-4)).toBe(MIN_SLIDE_BARS);
    expect(clampBars(900)).toBe(MAX_SLIDE_BARS);
  });

  // This runs on values from localStorage and from an HTTP body, so it is a
  // boundary rather than a convenience: a fractional length would put every cut
  // after it off the beat.
  it('drops anything that is not a slide and a number', () => {
    expect(
      parseBarOverrides({ topGame: 3, nonsense: 4, winRate: 'two', outro: null, intro: 2.4 }),
    ).toEqual({ topGame: 3, intro: 2 });
  });

  it('answers an empty object for anything that is not one', () => {
    expect(parseBarOverrides(null)).toEqual({});
    expect(parseBarOverrides('bars')).toEqual({});
    expect(parseBarOverrides(undefined)).toEqual({});
  });
});

describe('slide labels', () => {
  it('gives every slide a label', () => {
    // The picker renders `SLIDE_LABELS[id]`; a missing one is a blank row.
    for (const id of ALL_SLIDES) expect(SLIDE_LABELS[id]).toBeTruthy();
  });

  it('never gives two slides the same label', () => {
    /*
      The picker is a list of names and nothing else, so two rows reading the
      same thing are two rows nobody can tell apart. This is why the countdowns
      say what they rank by: "Top game (by plays)" against "Top 5 by time".
    */
    const labels = ALL_SLIDES.map((id) => SLIDE_LABELS[id]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('distinguishes a hero slide from the list it leads', () => {
    // These four are the pairs most easily confused for each other.
    expect(SLIDE_LABELS.topTheme).not.toBe(SLIDE_LABELS.topThemes);
    expect(SLIDE_LABELS.topMechanic).not.toBe(SLIDE_LABELS.topMechanics);
  });
});
