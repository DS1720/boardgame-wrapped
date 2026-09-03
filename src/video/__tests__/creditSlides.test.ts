import { describe, expect, it } from 'vitest';
import { moreDelay } from '../slides/CreditSlides';
import { STARTERS } from '@/theme/starters';
import { SLIDE_BARS, slideFrames, LEAD_IN_FRAMES } from '../timeline';

/**
 * The "+N more" line under a hero credit slide's grid.
 *
 * It counts the covers above it, so it cannot appear before them — and the
 * stagger step that decides when the last one lands belongs to the theme, not
 * to the slide. That is the whole reason this is computed rather than written
 * down as a constant.
 */

/** When the last of `n` staggered covers begins its entrance. */
const lastCoverAt = (n: number, stagger: number) => 20 + Math.max(0, n - 1) * stagger;

describe('moreDelay', () => {
  it('never precedes the last cover, in any theme', () => {
    for (const theme of STARTERS) {
      for (const examples of [2, 3, 4, 5, 6]) {
        expect(moreDelay(examples, theme.motion.stagger)).toBeGreaterThan(
          lastCoverAt(examples, theme.motion.stagger),
        );
      }
    }
  });

  it('waits longer on a slower theme', () => {
    // 22 frames flat was the old constant: right on a fast theme, and 13 frames
    // early on Table Light, where the sixth cover does not land until 55.
    const slow = Math.max(...STARTERS.map((t) => t.motion.stagger));
    const fast = Math.min(...STARTERS.map((t) => t.motion.stagger));
    expect(slow).toBeGreaterThan(fast);
    expect(moreDelay(6, slow)).toBeGreaterThan(moreDelay(6, fast));
  });

  it('still lands well inside a two-bar slide', () => {
    /*
      Both hero slides are two bars, plus one for their lead-in. The content is
      offset by `LEAD_IN_FRAMES`, so what is left is what the whole animation
      has to finish in — with room after it to hold the finished card.
    */
    for (const id of ['topTheme', 'topMechanic'] as const) {
      expect(SLIDE_BARS[id]).toBe(2);
      // `slideFrames` already includes the lead-in bar; the content sits
      // behind it, so what the animation gets is the rest.
      const window = slideFrames(id) - LEAD_IN_FRAMES;
      const slowest = Math.max(...STARTERS.map((t) => moreDelay(6, t.motion.stagger)));
      // A spring needs room to settle after its delay, not just to start.
      expect(slowest + 30).toBeLessThan(window);
    }
  });
});
