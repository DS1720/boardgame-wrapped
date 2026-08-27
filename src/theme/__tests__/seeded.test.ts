import { describe, expect, it } from 'vitest';
import { contrast } from '../color';
import { seededRandom, themeForPlayer } from '../generate';
import { BODY_FONTS, DISPLAY_FONTS, UTILITY_FONTS } from '../fonts';
import { CONTRAST } from '../types';

describe('seededRandom', () => {
  it('produces the same sequence for the same seed', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    expect(Array.from({ length: 8 }, a)).toEqual(Array.from({ length: 8 }, b));
  });

  it('produces different sequences for different seeds', () => {
    expect(seededRandom(1)()).not.toBe(seededRandom(2)());
  });

  it('separates adjacent seeds', () => {
    // Player ids are 1, 2, 3… A generator seeded directly with those gives
    // near-identical first draws, and a whole group comes out the same colour.
    const firsts = [1, 2, 3, 4, 5].map((id) => seededRandom(id)());
    for (let i = 1; i < firsts.length; i += 1) {
      expect(Math.abs(firsts[i] - firsts[i - 1])).toBeGreaterThan(0.05);
    }
  });

  it('stays inside 0–1', () => {
    const rand = seededRandom(7);
    for (let i = 0; i < 500; i += 1) {
      const value = rand();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('survives a seed of zero', () => {
    const rand = seededRandom(0);
    expect(Number.isFinite(rand())).toBe(true);
  });
});

describe('themeForPlayer', () => {
  // Step 11, test case 4.
  it('gives the same player the same theme every time', () => {
    for (const id of [1, 4, 17, 268]) {
      expect(themeForPlayer(id)).toEqual(themeForPlayer(id));
    }
  });

  it('gives different players different themes', () => {
    const grounds = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => themeForPlayer(id).color.bg);
    // Not all eight need be unique, but a batch that came out mostly one colour
    // would defeat the point of the toggle.
    expect(new Set(grounds).size).toBeGreaterThanOrEqual(6);
  });

  it('has an id and name fixed to the player, not to the draw', () => {
    // `randomTheme` puts a random tail in its id, which would make the theme
    // part of a filename differ between runs of the same batch.
    const theme = themeForPlayer(9);
    expect(theme.id).toBe('player-9');
    expect(theme.id).toBe(themeForPlayer(9).id);
    expect(theme.name).toBe(themeForPlayer(9).name);
  });

  it('is legible for every player id in a large group', () => {
    for (let id = 1; id <= 300; id += 1) {
      const { color } = themeForPlayer(id);
      expect(contrast(color.ink, color.bg)).toBeGreaterThanOrEqual(CONTRAST.inkOnBg);
      expect(contrast(color.accent, color.bg)).toBeGreaterThanOrEqual(CONTRAST.accentOnBg);
    }
  });

  it('picks fonts only from the curated lists', () => {
    for (let id = 1; id <= 60; id += 1) {
      const { type } = themeForPlayer(id);
      expect(DISPLAY_FONTS.map((f) => f.id)).toContain(type.display);
      expect(BODY_FONTS.map((f) => f.id)).toContain(type.body);
      expect(UTILITY_FONTS.map((f) => f.id)).toContain(type.utility);
    }
  });

  it('honours a forced light or dark mode', () => {
    for (let id = 1; id <= 20; id += 1) {
      const dark = themeForPlayer(id, { dark: true });
      const light = themeForPlayer(id, { dark: false });
      expect(contrast(dark.color.bg, '#000000')).toBeLessThan(contrast(light.color.bg, '#000000'));
    }
  });
});
