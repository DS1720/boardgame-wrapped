import { describe, expect, it } from 'vitest';
import { TALLY_STROKE_FRAMES, tallyFinishFrame, tallyStep } from '../signature';
import { EXIT_FRAMES } from '../slides';
import { slideFrames } from '../timeline';

/** Where the tally starts on the total-plays slide. */
const TALLY_DELAY = 12;
const WINDOW = 46;

describe('tally timing', () => {
  it('finishes inside its window however many marks there are', () => {
    for (const shown of [1, 2, 5, 12, 25]) {
      expect(tallyFinishFrame(shown, WINDOW)).toBeLessThanOrEqual(WINDOW);
    }
  });

  it('finishes before the slide starts leaving', () => {
    // The bug this locks in: 25 marks at a flat 3-frame stagger ran 84 frames
    // and were still drawing as the slide cut.
    const slide = slideFrames('totalPlays');
    const lastFrame = TALLY_DELAY + tallyFinishFrame(25, WINDOW);
    expect(lastFrame).toBeLessThan(slide - EXIT_FRAMES);
  });

  it('never staggers wider than a single stroke', () => {
    // A gap longer than the stroke would read as marks appearing one by one
    // rather than a hand working down the row.
    for (const shown of [2, 5, 25]) {
      expect(tallyStep(shown, WINDOW)).toBeLessThanOrEqual(TALLY_STROKE_FRAMES);
    }
  });

  it('packs marks closer together the more there are', () => {
    expect(tallyStep(25, WINDOW)).toBeLessThan(tallyStep(5, WINDOW));
  });

  it('handles a single mark and none at all', () => {
    expect(tallyStep(1, WINDOW)).toBe(0);
    expect(tallyFinishFrame(1, WINDOW)).toBe(TALLY_STROKE_FRAMES);
    expect(tallyFinishFrame(0, WINDOW)).toBe(0);
  });
});
