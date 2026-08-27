import { describe, expect, it } from 'vitest';
import type { WrappedStats } from '@/stats/types';
import { STARTERS } from '@/theme/starters';
import { outputFileName, RENDER_SETTINGS, type RenderInput } from '../render';

const stats = (playerName: string, rangeLabel: string): WrappedStats => ({
  playerId: 1,
  playerName,
  rangeLabel,
  rangeFrom: '2026-01-01',
  rangeTo: '2026-12-31',
  stats: [],
  thin: false,
});

const input = (playerName: string, rangeLabel = '2026', theme = STARTERS[2]): RenderInput => ({
  stats: stats(playerName, rangeLabel),
  theme,
  track: null,
  slides: null,
});

describe('output filenames', () => {
  it('is player, range and theme', () => {
    expect(outputFileName(input('Tina'))).toBe('tina-2026-table-light.mp4');
  });

  // Step 10, test case 4.
  it('sanitises umlauts', () => {
    // Real names in this dataset: "Bluff Jubiläumsausgabe", "Straße".
    expect(outputFileName(input('Jürgen Groß'))).toBe('jurgen-gross-2026-table-light.mp4');
  });

  it('sanitises spaces and punctuation', () => {
    expect(outputFileName(input('Flo (Spielewochenende)'))).toBe(
      'flo-spielewochenende-2026-table-light.mp4',
    );
  });

  it('sanitises a trailing space, which this export really contains', () => {
    const name = outputFileName(input('markus Spielewochenende '));
    expect(name).toBe('markus-spielewochenende-2026-table-light.mp4');
    expect(name).not.toMatch(/[-\s]\.mp4$/);
  });

  it('sanitises the arrow in a custom range label', () => {
    // `makeRange` labels a custom span "2026-05-01 → 2026-06-30".
    const name = outputFileName(input('Tina', '2026-05-01 → 2026-06-30'));
    expect(name).toBe('tina-2026-05-01-2026-06-30-table-light.mp4');
  });

  it('never emits a character Windows refuses', () => {
    const hostile = outputFileName(input('a/b\\c:d*e?f"g<h>i|j'));
    expect(hostile).not.toMatch(/[/\\:*?"<>|]/);
    expect(hostile.endsWith('.mp4')).toBe(true);
  });

  it('falls back rather than producing a nameless file', () => {
    // A player called only "♪" slugifies to nothing.
    const name = outputFileName(input('♪♫'));
    expect(name).toMatch(/^player-/);
    expect(name).toBe('player-2026-table-light.mp4');
  });

  it('names the theme, so two themes do not overwrite each other', () => {
    const light = outputFileName(input('Tina', '2026', STARTERS[2]));
    const punch = outputFileName(input('Tina', '2026', STARTERS[0]));
    expect(light).not.toBe(punch);
  });

  it('survives a theme that was never set', () => {
    expect(outputFileName({ ...input('Tina'), theme: null })).toBe('tina-2026-theme.mp4');
  });

  // Step 10, test case 3, at the level this can be checked without rendering.
  it('is deterministic for the same inputs', () => {
    expect(outputFileName(input('Tina'))).toBe(outputFileName(input('Tina')));
  });
});

describe('render settings', () => {
  it('match the CLI, so the app and the command line produce the same file', () => {
    // remotion.config.ts sets h264 at CRF 18; these have to agree or a video
    // rendered from the UI would differ from one rendered by hand.
    expect(RENDER_SETTINGS.codec).toBe('h264');
    expect(RENDER_SETTINGS.crf).toBe(18);
  });

  it('pins a pixel format every player understands', () => {
    // JPEG frames otherwise produce yuvj420p, the deprecated full-range
    // variant, which can shift colours depending on how a player reads it.
    expect(RENDER_SETTINGS.pixelFormat).toBe('yuv420p');
  });
});
