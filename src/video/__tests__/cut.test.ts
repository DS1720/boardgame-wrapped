import { describe, expect, it } from 'vitest';
import { CORE_SLIDES, MODULES } from '@/stats/index';
import type { SlideId } from '@/stats/types';
import {
  ALL_SLIDES,
  buildCut,
  DEFAULT_CUT,
  DEFAULT_SLIDE_IDS,
  insertSlide,
  leadInFor,
  arrangementOf,
  moveSlide,
  moveSlideTo,
  unitsOf,
  SLIDE_BARS,
  SLIDE_LABELS,
} from '../timeline';
import { SLIDE_COMPONENTS } from '../slides';

describe('the slide catalogue', () => {
  it('covers every stat module plus the two bookends', () => {
    expect(ALL_SLIDES).toHaveLength(MODULES.length + 2);
    expect(ALL_SLIDES[0]).toBe('intro');
    expect(ALL_SLIDES.at(-1)).toBe('outro');
  });

  it('follows the order the stats engine already chose', () => {
    // The narrative order of the video is step 4's order, not a second list
    // that can drift away from it.
    expect(ALL_SLIDES.slice(1, -1)).toEqual(MODULES.map((m) => m.id));
  });

  it('has a component for every slide that exists', () => {
    for (const id of ALL_SLIDES) {
      expect(SLIDE_COMPONENTS[id], `${id} has no component`).toBeTypeOf('function');
    }
  });

  it('has a length and a label for every slide', () => {
    for (const id of ALL_SLIDES) {
      expect(SLIDE_BARS[id], `${id} has no length`).toBeGreaterThan(0);
      expect(SLIDE_LABELS[id], `${id} has no label`).toBeTruthy();
    }
  });

  it('uses whole bars everywhere, not just in the default cut', () => {
    for (const id of ALL_SLIDES) {
      expect(SLIDE_BARS[id] % 1, `${id} is not a whole number of bars`).toBe(0);
    }
  });
});

describe('buildCut', () => {
  it('always keeps the bookends, even with nothing selected', () => {
    expect(buildCut([])).toEqual(['intro', 'outro']);
  });

  it('reproduces the default cut from the default selection', () => {
    expect(buildCut(DEFAULT_SLIDE_IDS)).toEqual(DEFAULT_CUT);
  });

  it('keeps the order it is given, because that order is the arrangement', () => {
    // The UI lets slides be moved up and down, so this must preserve what was
    // arranged rather than re-imposing the catalogue order over the top of it.
    const arranged: SlideId[] = ['topLocation', 'totalPlays', 'nemesis'];
    expect(buildCut(arranged)).toEqual(['intro', 'topLocation', 'totalPlays', 'nemesis', 'outro']);
  });

  it('includes optional slides wherever they were placed', () => {
    const cut = buildCut(['nightOwl', 'totalPlays', 'bestGame']);
    expect(cut).toEqual(['intro', 'nightOwl', 'totalPlays', 'bestGame', 'outro']);
  });

  it('pins the bookends to the ends even if they are passed in the middle', () => {
    const cut = buildCut(['winRate', 'outro', 'intro', 'nemesis'] as SlideId[]);
    expect(cut).toEqual(['intro', 'winRate', 'nemesis', 'outro']);
    expect(cut.filter((id) => id === 'intro')).toHaveLength(1);
    expect(cut.filter((id) => id === 'outro')).toHaveLength(1);
  });

  it('ignores ids that are not slides', () => {
    expect(buildCut(['totalPlays', 'nonsense' as SlideId])).toEqual([
      'intro',
      'totalPlays',
      'outro',
    ]);
  });

  it('does not duplicate a slide listed twice', () => {
    const cut = buildCut(['totalPlays', 'totalPlays']);
    expect(cut.filter((id) => id === 'totalPlays')).toHaveLength(1);
  });

  it('accepts a Set, which is what the UI holds', () => {
    expect(buildCut(new Set<SlideId>(['winRate']))).toEqual(['intro', 'winRate', 'outro']);
  });
});

describe('moveSlide', () => {
  const order: SlideId[] = ['totalPlays', 'topGame', 'winRate'];

  it('moves a slide up and down', () => {
    expect(moveSlide(order, 'topGame', -1)).toEqual(['topGame', 'totalPlays', 'winRate']);
    expect(moveSlide(order, 'topGame', 1)).toEqual(['totalPlays', 'winRate', 'topGame']);
  });

  it('refuses to walk off either end', () => {
    // The UI can call this without checking, so it has to be safe at the edges.
    expect(moveSlide(order, 'totalPlays', -1)).toEqual(order);
    expect(moveSlide(order, 'winRate', 1)).toEqual(order);
  });

  it('ignores a slide that is not in the order', () => {
    expect(moveSlide(order, 'nightOwl', -1)).toEqual(order);
  });

  it('does not mutate the list it was given', () => {
    const original: SlideId[] = [...order];
    moveSlide(original, 'topGame', -1);
    expect(original).toEqual(order);
  });
});

describe('moveSlideTo', () => {
  const order: SlideId[] = ['totalPlays', 'topGame', 'winRate', 'nemesis'];

  it('lands the slide at the position asked for', () => {
    // The index is where the slide ends up, which is what lets the drop
    // handler pass the index of the row it was dropped on.
    expect(moveSlideTo(order, 'nemesis', 0)).toEqual([
      'nemesis',
      'totalPlays',
      'topGame',
      'winRate',
    ]);
    expect(moveSlideTo(order, 'totalPlays', 3)).toEqual([
      'topGame',
      'winRate',
      'nemesis',
      'totalPlays',
    ]);
  });

  it('moves a slide the same way the arrows do', () => {
    for (const id of order) {
      const at = order.indexOf(id);
      for (const delta of [-1, 1]) {
        if (at + delta < 0 || at + delta >= order.length) continue;
        expect(moveSlideTo(order, id, at + delta)).toEqual(moveSlide(order, id, delta));
      }
    }
  });

  it('clamps a drop past either end rather than ignoring it', () => {
    // A drop below the last row means "put it last" — refusing it, the way the
    // arrows refuse a step off the end, would lose a deliberate gesture.
    expect(moveSlideTo(order, 'topGame', -5)).toEqual([
      'topGame',
      'totalPlays',
      'winRate',
      'nemesis',
    ]);
    expect(moveSlideTo(order, 'topGame', 99)).toEqual([
      'totalPlays',
      'winRate',
      'nemesis',
      'topGame',
    ]);
  });

  it('is a no-op when the slide is already there', () => {
    expect(moveSlideTo(order, 'topGame', 1)).toBe(order);
  });

  it('ignores a slide that is not in the order', () => {
    expect(moveSlideTo(order, 'nightOwl', 0)).toBe(order);
  });

  it('does not mutate the list it was given', () => {
    const original: SlideId[] = [...order];
    moveSlideTo(original, 'nemesis', 0);
    expect(original).toEqual(order);
  });

  it('keeps every slide, whatever the move', () => {
    for (let i = -1; i <= order.length; i++) {
      const moved = moveSlideTo(order, 'winRate', i);
      expect([...moved].sort()).toEqual([...order].sort());
    }
  });
});

describe('a linked pair moves as one', () => {
  // As laid out by buildCut: the count is pinned in front of the person.
  const order = (): SlideId[] =>
    arrangementOf(['totalPlays', 'winRate', 'coPlayerCount', 'topCoPlayer', 'nemesis']);

  it('is arranged with the count in front of the person', () => {
    expect(order()).toEqual([
      'totalPlays',
      'winRate',
      'coPlayerCount',
      'topCoPlayer',
      'nemesis',
    ]);
  });

  it('groups the pair into one movable unit', () => {
    expect(unitsOf(order())).toEqual([
      ['totalPlays'],
      ['winRate'],
      ['coPlayerCount', 'topCoPlayer'],
      ['nemesis'],
    ]);
  });

  it('treats every slide as its own unit when nothing is paired', () => {
    const plain: SlideId[] = ['totalPlays', 'topGame', 'winRate'];
    expect(unitsOf(plain)).toEqual([['totalPlays'], ['topGame'], ['winRate']]);
  });

  it('steps the whole pair past the slide before it, not just the person', () => {
    // The bug this guards: moving the person one step used to swap it with its
    // own pinned partner, and buildCut put that straight back — so the arrow
    // did nothing at all.
    expect(moveSlide(order(), 'topCoPlayer', -1)).toEqual([
      'totalPlays',
      'coPlayerCount',
      'topCoPlayer',
      'winRate',
      'nemesis',
    ]);
  });

  it('carries the pair when the pinned half is the one asked to move', () => {
    expect(moveSlide(order(), 'coPlayerCount', 1)).toEqual([
      'totalPlays',
      'winRate',
      'nemesis',
      'coPlayerCount',
      'topCoPlayer',
    ]);
  });

  it('never splits the pair, whatever it is asked to do', () => {
    const ids: SlideId[] = ['totalPlays', 'winRate', 'coPlayerCount', 'topCoPlayer', 'nemesis'];
    for (const id of ids) {
      for (let i = -2; i <= 6; i++) {
        const moved = moveSlideTo(order(), id, i);
        expect(moved.indexOf('coPlayerCount')).toBe(moved.indexOf('topCoPlayer') - 1);
        expect([...moved].sort()).toEqual([...ids].sort());
      }
    }
  });

  it('drops onto a pair by either of its rows and lands in the same place', () => {
    const from = order();
    const onLead = moveSlideTo(from, 'totalPlays', from.indexOf('coPlayerCount'));
    const onPartner = moveSlideTo(from, 'totalPlays', from.indexOf('topCoPlayer'));
    expect(onLead).toEqual(onPartner);
  });
});

describe('insertSlide', () => {
  it('places a newly enabled slide where the catalogue would put it', () => {
    const order: SlideId[] = ['totalPlays', 'topFive'];
    // topGame sits between them in the catalogue, so that is where it lands.
    expect(insertSlide(order, 'topGame')).toEqual(['totalPlays', 'topGame', 'topFive']);
  });

  it('adds the optional theme list beside top theme after the top five games', () => {
    const withThemes = insertSlide(DEFAULT_SLIDE_IDS, 'topThemes');
    expect(withThemes[withThemes.indexOf('topTheme') - 1]).toBe('topFive');
    expect(withThemes[withThemes.indexOf('topThemes') - 1]).toBe('topTheme');
    expect(withThemes[withThemes.indexOf('topThemes') + 1]).toBe('winRate');
  });

  it('appends when nothing after it is enabled', () => {
    expect(insertSlide(['totalPlays'], 'topLocation')).toEqual(['totalPlays', 'topLocation']);
  });

  it('prepends when everything enabled comes later', () => {
    expect(insertSlide(['topLocation'], 'totalPlays')).toEqual(['totalPlays', 'topLocation']);
  });

  it('leaves a slide that is already there alone', () => {
    const order: SlideId[] = ['totalPlays', 'winRate'];
    expect(insertSlide(order, 'winRate')).toBe(order);
  });

  it('respects a hand-made arrangement rather than resorting it', () => {
    // Someone moved winRate to the front; adding a slide must not undo that.
    const arranged: SlideId[] = ['winRate', 'totalPlays', 'topLocation'];
    const next = insertSlide(arranged, 'nemesis');
    expect(next.slice(0, 2)).toEqual(['winRate', 'totalPlays']);
    expect(next).toContain('nemesis');
  });
});

describe('the default selection', () => {
  it('is the core set the stats engine marks as default', () => {
    // The ten-slide cut and the engine's "core" flag have to agree, or the UI
    // would show optional tags on slides that are actually on by default.
    expect([...DEFAULT_SLIDE_IDS].sort()).toEqual([...CORE_SLIDES].sort());
  });

  it('contains no bookends', () => {
    expect(DEFAULT_SLIDE_IDS).not.toContain('intro');
    expect(DEFAULT_SLIDE_IDS).not.toContain('outro');
  });

  it('is a fresh array each time, so the UI cannot mutate the default', () => {
    const cut = buildCut(DEFAULT_SLIDE_IDS);
    cut.push('nightOwl');
    expect(buildCut(DEFAULT_SLIDE_IDS)).toEqual(DEFAULT_CUT);
  });

  it('drops ids a newer version of the app no longer knows', () => {
    // Selections come back from localStorage and can name slides that were
    // renamed or removed since they were saved.
    expect(buildCut(['totalPlays', 'retiredStat' as SlideId])).toEqual([
      'intro',
      'totalPlays',
      'outro',
    ]);
  });
});

describe('the time pair', () => {
  /*
    "114 h at the table", then where it went. The bridging line only works with
    that number still on screen behind it, which is what makes the two one
    thought rather than two lists — and what `LINKED_PAIRS` is for.
  */
  it('keeps the time slide directly before its list', () => {
    const cut = buildCut(['topFiveByTime', 'winRate', 'timePlayed'] as SlideId[]);
    const list = cut.indexOf('topFiveByTime');
    expect(cut[list - 1]).toBe('timePlayed');
  });

  it('introduces the list off the back of the time slide', () => {
    expect(leadInFor('topFiveByTime', 'timePlayed')).toBe('And this is where it went…');
  });

  // Turning the time slide off must not leave a line pointing at a number
  // nobody was shown.
  it('falls back to a line that stands on its own', () => {
    const alone = leadInFor('topFiveByTime', 'totalPlays');
    expect(alone).not.toBeNull();
    expect(alone).not.toContain('where it went');
  });
});
