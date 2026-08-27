import { describe, expect, it } from 'vitest';
import { fontFaceRule, WANTED_SUBSETS, type FontManifest } from '@/shared/fonts';
import { buildFontCss, fontLoadDescriptors } from '../fontLoading';
import { parseFontCss } from '../../../server/fonts';
import { FONTS } from '../fonts';
import { STARTERS, tableLight } from '../starters';

const manifest: FontManifest = {
  version: 1,
  generatedAt: '2026-08-27T00:00:00.000Z',
  faces: [
    {
      family: 'Archivo',
      file: 'archivo-400-700-normal-latin.woff2',
      weight: '400 700',
      style: 'normal',
      stretch: '62% 125%',
      unicodeRange: 'U+0000-00FF',
      subset: 'latin',
    },
    {
      family: 'Inter',
      file: 'inter-400-700-normal-latin.woff2',
      weight: '400 700',
      style: 'normal',
      subset: 'latin',
    },
  ],
};

describe('font face rules', () => {
  it('declares the variable axes the family actually has', () => {
    const css = fontFaceRule(manifest.faces[0], '/fonts/archivo-400-700-normal-latin.woff2');
    // Without the stretch range declared, font-stretch: 75% cannot engage the
    // width axis and "Archivo Condensed" silently renders at normal width.
    expect(css).toContain('font-stretch: 62% 125%;');
    expect(css).toContain('font-weight: 400 700;');
    expect(css).toContain('src: url("/fonts/archivo-400-700-normal-latin.woff2") format("woff2");');
    expect(css).toContain('unicode-range: U+0000-00FF;');
  });

  it('blocks rather than swaps, so no frame captures a fallback face', () => {
    expect(fontFaceRule(manifest.faces[1], '/x.woff2')).toContain('font-display: block;');
  });

  it('omits descriptors a face does not have', () => {
    const css = fontFaceRule(manifest.faces[1], '/x.woff2');
    expect(css).not.toContain('font-stretch');
    expect(css).not.toContain('unicode-range');
  });

  it('builds one rule per face', () => {
    const css = buildFontCss(manifest, (file) => `/${file}`);
    expect(css.match(/@font-face/g)).toHaveLength(2);
    expect(css).toContain('/fonts/inter-400-700-normal-latin.woff2');
  });
});

describe('what a theme waits for', () => {
  it('asks for the three faces the theme names', () => {
    const descriptors = fontLoadDescriptors(tableLight);
    expect(descriptors.some((d) => d.includes('Familjen Grotesk'))).toBe(true);
    expect(descriptors.some((d) => d.includes('Inter'))).toBe(true);
  });

  it('does not wait for the same family twice', () => {
    // Table Light uses Inter for both body and utility, at different weights;
    // only the distinct descriptors are worth awaiting.
    const descriptors = fontLoadDescriptors(tableLight);
    expect(new Set(descriptors).size).toBe(descriptors.length);
  });

  it('names a weight and a family CSS can parse', () => {
    for (const theme of STARTERS) {
      for (const descriptor of fontLoadDescriptors(theme)) {
        expect(descriptor).toMatch(/^\d+ 100px "[^"]+"$/);
      }
    }
  });
});

describe('parsing the Google stylesheet', () => {
  const spec = FONTS['archivo-condensed'];

  const css = `
/* cyrillic */
@font-face {
  font-family: 'Archivo';
  font-style: normal;
  font-weight: 400 700;
  font-stretch: 62% 125%;
  src: url(https://fonts.gstatic.com/s/archivo/cyr.woff2) format('woff2');
  unicode-range: U+0301, U+0400-045F;
}
/* latin */
@font-face {
  font-family: 'Archivo';
  font-style: normal;
  font-weight: 400 700;
  font-stretch: 62% 125%;
  src: url(https://fonts.gstatic.com/s/archivo/lat.woff2) format('woff2');
  unicode-range: U+0000-00FF;
}`;

  it('keeps only the subsets the export needs', () => {
    const parsed = parseFontCss(css, spec);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].face.subset).toBe('latin');
    expect(WANTED_SUBSETS).not.toContain('cyrillic');
  });

  it('carries the axes through to the manifest', () => {
    const [{ face, url, file }] = parseFontCss(css, spec);
    expect(face.stretch).toBe('62% 125%');
    expect(face.weight).toBe('400 700');
    expect(face.family).toBe('Archivo');
    expect(url).toBe('https://fonts.gstatic.com/s/archivo/lat.woff2');
    expect(file).toBe('archivo-400-700-normal-latin.woff2');
  });

  it('returns nothing for a stylesheet it cannot use', () => {
    expect(parseFontCss('', spec)).toEqual([]);
    expect(parseFontCss('/* latin */ @font-face { font-family: X; }', spec)).toEqual([]);
  });
});
