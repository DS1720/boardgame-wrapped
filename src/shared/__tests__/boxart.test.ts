import { describe, expect, it } from 'vitest';
import {
  boxArtSrc,
  fallbackHue,
  fileNameFor,
  formatFromContentType,
  formatFromMagic,
  hashName,
  hueOf,
  pickDominant,
  rejectionReason,
  resolveFormat,
  type BoxArtEntry,
  type Swatches,
} from '../boxart';

const bytes = (...values: number[]) => new Uint8Array([...values, ...new Array(16).fill(0)]);

const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0);
const GIF = bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x00, 0x00, 0x00, 0x00,
]);
const HTML = new Uint8Array([...Buffer.from('<!doctype html><html><body>404')]);

const swatches = (partial: Partial<Swatches>): Swatches => ({
  vibrant: null,
  darkVibrant: null,
  lightVibrant: null,
  muted: null,
  darkMuted: null,
  lightMuted: null,
  ...partial,
});

describe('format detection', () => {
  it('reads png and jpeg from magic bytes', () => {
    expect(formatFromMagic(PNG)).toBe('png');
    expect(formatFromMagic(JPEG)).toBe('jpg');
    expect(formatFromMagic(GIF)).toBe('gif');
    expect(formatFromMagic(WEBP)).toBe('webp');
  });

  it('refuses anything that is not an image', () => {
    expect(formatFromMagic(HTML)).toBeNull();
    expect(formatFromMagic(new Uint8Array([1, 2]))).toBeNull();
  });

  it('reads the content-type header, parameters and all', () => {
    expect(formatFromContentType('image/png')).toBe('png');
    expect(formatFromContentType('image/jpeg; charset=binary')).toBe('jpg');
    expect(formatFromContentType('IMAGE/PNG')).toBe('png');
    expect(formatFromContentType('application/octet-stream')).toBeNull();
    expect(formatFromContentType(null)).toBeNull();
  });

  it('trusts the bytes over a lying header', () => {
    // The host sometimes labels a PNG as a JPEG. The file on disk has to match
    // its extension or nothing downstream can decode it.
    expect(resolveFormat(PNG)).toBe('png');
    expect(resolveFormat(JPEG)).toBe('jpg');
  });

  it('rejects an error page even when the header claims it is an image', () => {
    // The whole point of magic-byte detection: a 404 page served as image/png
    // must never land on disk as a .png nobody can open.
    expect(resolveFormat(HTML)).toBeNull();
    expect(rejectionReason('image/png', HTML)).toMatch(/not a readable image/);
    expect(rejectionReason('text/html; charset=utf-8', HTML)).toMatch(/not an image/);
    expect(rejectionReason(null, HTML)).toMatch(/no content-type/);
  });

  it('names files by game id', () => {
    expect(fileNameFor(77, 'png')).toBe('77.png');
    expect(fileNameFor(3, 'jpg')).toBe('3.jpg');
  });
});

describe('dominant color', () => {
  it('prefers the vibrant swatch', () => {
    expect(pickDominant(swatches({ vibrant: '#e75f2b', muted: '#a28447' }))).toBe('#e75f2b');
  });

  it('walks outward when the cover is washed out', () => {
    expect(pickDominant(swatches({ muted: '#a28447' }))).toBe('#a28447');
    expect(pickDominant(swatches({ darkMuted: '#53335b' }))).toBe('#53335b');
  });

  it('returns null when there is nothing to use', () => {
    expect(pickDominant(swatches({}))).toBeNull();
    expect(pickDominant(null)).toBeNull();
  });

  it('computes hue in degrees', () => {
    expect(hueOf('#ff0000')).toBeCloseTo(0);
    expect(hueOf('#00ff00')).toBeCloseTo(120);
    expect(hueOf('#0000ff')).toBeCloseTo(240);
    expect(hueOf('e75f2b')).toBeCloseTo(16.6, 1);
  });

  it('has no hue for grey or for junk', () => {
    expect(hueOf('#808080')).toBeNull();
    expect(hueOf('#ffffff')).toBeNull();
    expect(hueOf('not a color')).toBeNull();
  });
});

describe('fallback tiles', () => {
  it('is deterministic — the same game always gets the same tile', () => {
    expect(hashName('Faraway')).toBe(hashName('Faraway'));
    expect(fallbackHue('✂️ 🪨 📜')).toBe(fallbackHue('✂️ 🪨 📜'));
  });

  it('gives different games different hues', () => {
    expect(fallbackHue('Faraway')).not.toBe(fallbackHue('Castle Combo'));
  });

  it('avoids the muddy yellow band', () => {
    const names = Array.from({ length: 500 }, (_, i) => `Game number ${i}`);
    for (const name of names) {
      const hue = fallbackHue(name);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
      expect(hue > 45 && hue < 65).toBe(false);
    }
  });
});

describe('boxArtSrc', () => {
  const entry = (file: string | null): BoxArtEntry => ({
    gameId: 77,
    name: 'Faraway',
    bggId: 385761,
    file,
    source: null,
    bytes: null,
    swatches: null,
    dominant: null,
    hue: null,
  });

  it('points at the stored file', () => {
    expect(boxArtSrc(entry('77.png'))).toBe('boxart/77.png');
  });

  it('returns null so the caller renders the fallback tile', () => {
    expect(boxArtSrc(entry(null))).toBeNull();
    expect(boxArtSrc(null)).toBeNull();
    expect(boxArtSrc(undefined)).toBeNull();
  });
});
