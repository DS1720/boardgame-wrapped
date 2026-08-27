/**
 * Font mirror: shared types.
 *
 * Same arrangement as box art — the download engine is Node-only, but the
 * manifest shape has to be understood by the browser and by a CLI render.
 */

export interface FontFace {
  /** Family name as CSS will refer to it. */
  family: string;
  /** Filename inside public/fonts. */
  file: string;
  /** "400" or a variable range like "400 700". */
  weight: string;
  style: string;
  /** Width axis for variable families, e.g. "62% 125%". */
  stretch?: string;
  /** Kept so the browser only downloads the subset a slide actually needs. */
  unicodeRange?: string;
  /** Which curated choices this face serves. */
  subset: string;
}

export interface FontManifest {
  version: 1;
  generatedAt: string;
  faces: FontFace[];
}

export const FONT_MANIFEST_VERSION = 1 as const;
export const FONT_MANIFEST_FILE = 'manifest.json';

export const emptyFontManifest = (): FontManifest => ({
  version: FONT_MANIFEST_VERSION,
  generatedAt: new Date().toISOString(),
  faces: [],
});

/** Only these subsets are mirrored: the export has German titles, nothing further afield. */
export const WANTED_SUBSETS = ['latin', 'latin-ext'];

/**
 * Build the CSS for one face. Kept here rather than in the loader so the
 * browser and a test can generate the identical rule.
 */
export const fontFaceRule = (face: FontFace, url: string): string =>
  [
    '@font-face {',
    `  font-family: "${face.family}";`,
    `  font-style: ${face.style};`,
    `  font-weight: ${face.weight};`,
    face.stretch ? `  font-stretch: ${face.stretch};` : null,
    // "block" rather than "swap": a render must not capture frames with a
    // fallback face still showing, and a local file is fast enough that a
    // person never sees the block either.
    '  font-display: block;',
    `  src: url("${url}") format("woff2");`,
    face.unicodeRange ? `  unicode-range: ${face.unicodeRange};` : null,
    '}',
  ]
    .filter(Boolean)
    .join('\n');
