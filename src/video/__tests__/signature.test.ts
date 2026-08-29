import { describe, expect, it } from 'vitest';
import { BACKDROP_SIGNATURES, MARK_DRAW_FRAMES, markFinishFrame, markStep } from '../signature';
import { STARTERS } from '@/theme/starters';
import { EXIT_FRAMES } from '../slides';
import { slideFrames } from '../timeline';

/** Where the marks start on the total-plays slide. */
const MARK_DELAY = 12;
const WINDOW = 46;

/**
 * How long one mark takes, per signature, and the most it will ever draw.
 * A die tumbles for nine frames; a pen stroke takes three. All four go through
 * the same window, which is what stops any of them outrunning the slide.
 */
// `max` is the number of things that actually animate, not the play count:
// dice hold six pips each, so thirty-six plays is six dice.
const SIGNATURES = [
  { name: 'tally', draw: 3, marks: 25 },
  { name: 'dice', draw: 9, marks: 6 },
  { name: 'tiles', draw: 6, marks: 24 },
  { name: 'pegs', draw: 5, marks: 30 },
] as const;

describe('counting-mark timing', () => {
  it('finishes inside its window, for every signature and every count', () => {
    for (const { draw, marks } of SIGNATURES) {
      for (const shown of [1, 2, 5, 12, marks]) {
        expect(markFinishFrame(shown, WINDOW, draw)).toBeLessThanOrEqual(WINDOW);
      }
    }
  });

  it('finishes before the slide starts leaving, for every signature', () => {
    // The bug this locks in: 25 marks at a flat 3-frame stagger ran 84 frames
    // and were still drawing as the slide cut. A die takes three times as long
    // to land as a stroke takes to draw, so this has to hold for the slowest.
    const slide = slideFrames('totalPlays');
    for (const { draw, marks } of SIGNATURES) {
      const lastFrame = MARK_DELAY + markFinishFrame(marks, WINDOW, draw);
      expect(lastFrame).toBeLessThan(slide - EXIT_FRAMES);
    }
  });

  it('never staggers wider than a single mark', () => {
    // A gap longer than the mark itself would read as marks appearing one by
    // one rather than a hand working down the row.
    for (const { draw, marks } of SIGNATURES) {
      for (const shown of [2, 5, marks]) {
        expect(markStep(shown, WINDOW, draw)).toBeLessThanOrEqual(draw);
      }
    }
  });

  it('packs marks closer together the more there are', () => {
    expect(markStep(25, WINDOW)).toBeLessThan(markStep(5, WINDOW));
  });

  it('handles a single mark and none at all', () => {
    expect(markStep(1, WINDOW)).toBe(0);
    expect(markFinishFrame(1, WINDOW)).toBe(MARK_DRAW_FRAMES);
    expect(markFinishFrame(0, WINDOW)).toBe(0);
    // And with a heavier mark, the single one still takes its full draw.
    expect(markFinishFrame(1, WINDOW, 9)).toBe(9);
  });

  it('defaults to the pen stroke when no length is given', () => {
    expect(markStep(5, WINDOW)).toBe(markStep(5, WINDOW, MARK_DRAW_FRAMES));
  });
});

describe('every theme has a moving ground', () => {
  /*
    A signature is what makes a theme's ground recognisably that theme's, and
    the rule the video is built to is that the frame is never still while the
    content is. Punchboard kept neither promise for a long time: its signature
    acts on the plate a stat sits in, so it had no backdrop at all and the
    ambient fields were doing the whole job.
  */
  it('draws a backdrop for every starter', () => {
    for (const theme of STARTERS) {
      expect(BACKDROP_SIGNATURES.has(theme.signature)).toBe(true);
    }
  });

  it('has one per starter and no spares', () => {
    // Signatures are one-to-one with starters, so a backdrop nobody uses is
    // dead code that looks wired up.
    expect(BACKDROP_SIGNATURES.size).toBe(STARTERS.length);
    expect(new Set(STARTERS.map((t) => t.signature)).size).toBe(STARTERS.length);
  });
});
