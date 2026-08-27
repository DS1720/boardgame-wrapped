import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BoxArt, displaySize, FallbackTile, MIN_DISPLAY_PX } from '../BoxArt';
import { BOX_ART } from '../config';
import { boxArtSrc, fallbackHue, type BoxArtEntry } from '@/shared/boxart';

const entry = (over: Partial<BoxArtEntry> = {}): BoxArtEntry => ({
  gameId: 77,
  name: 'Faraway',
  bggId: 385761,
  file: '77.png',
  source: 'https://img/77.png',
  bytes: 1234,
  swatches: null,
  dominant: '#e75f2b',
  hue: 16.6,
  ...over,
});

describe('BoxArt', () => {
  /**
   * The image path is not rendered here. It uses Remotion's `<Img>`, which
   * calls `useCurrentFrame()` to hold the render until the file has decoded,
   * and that needs a composition context this test cannot provide. What it
   * guards instead is the path decision and the crop tokens; the crop itself is
   * verified by looking at rendered frames.
   */
  it('resolves a stored cover to its file', () => {
    expect(boxArtSrc(entry())).toBe('boxart/77.png');
    expect(BOX_ART.radius).toBeGreaterThan(0);
  });

  it('falls back to a tile when the game has no stored art', () => {
    const html = renderToStaticMarkup(
      <BoxArt entry={entry({ file: null })} name="Faraway" width={600} height={600} />,
    );
    expect(html).not.toContain('<img');
    expect(html).toContain('Faraway');
  });

  it('falls back when there is no manifest entry at all', () => {
    const html = renderToStaticMarkup(<BoxArt entry={null} name="Unknown Game" width={600} height={600} />);
    expect(html).toContain('Unknown Game');
    expect(html).not.toContain('<img');
  });
});

describe('FallbackTile', () => {
  // The emoji-named game in the real export: the case that made the tile
  // necessary in the first place.
  const SCISSORS = '✂️ 🪨 📜';

  it('renders the game name, themed, at the same radius as real art', () => {
    const html = renderToStaticMarkup(<FallbackTile name={SCISSORS} width={600} height={600} />);
    expect(html).toContain(SCISSORS);
    expect(html).toContain(`border-radius:${BOX_ART.radius}px`);
    expect(html).toContain(`hsl(${fallbackHue(SCISSORS)}`);
  });

  it('is deterministic across renders', () => {
    const once = renderToStaticMarkup(<FallbackTile name={SCISSORS} width={600} height={600} />);
    const twice = renderToStaticMarkup(<FallbackTile name={SCISSORS} width={600} height={600} />);
    expect(once).toBe(twice);
  });

  it('shrinks the type so a long name still fits the box', () => {
    const short = renderToStaticMarkup(<FallbackTile name="Go" width={600} height={600} />);
    const long = renderToStaticMarkup(
      <FallbackTile name="Brass: Birmingham Deluxe Edition" width={600} height={600} />,
    );
    const sizeOf = (html: string) => Number(/font-size:([\d.]+)px/.exec(html)?.[1]);
    expect(sizeOf(long)).toBeLessThan(sizeOf(short));
    expect(sizeOf(long)).toBeGreaterThan(20);
  });

  it('keeps an unbroken long word inside the tile', () => {
    const name = 'Donnerwetterunwahrscheinlichkeitsspiel'; // one 37-character word
    const size = displaySize(name, 600);
    // Wrapping cannot help a single word, so the type has to shrink to fit.
    // Tolerance of a pixel: the width estimate is a heuristic, not a metric.
    expect(size * 0.62 * name.length).toBeLessThanOrEqual(600 * 0.82 + 1);
    expect(size).toBeGreaterThanOrEqual(MIN_DISPLAY_PX);
  });

  it('stops shrinking at the legibility floor rather than vanishing', () => {
    const absurd = 'x'.repeat(400);
    expect(displaySize(absurd, 600)).toBe(MIN_DISPLAY_PX);
  });
});
