/**
 * The curated font list, and how each choice resolves to CSS.
 *
 * Fonts are mirrored to `public/fonts/` by `scripts/prefetch-fonts.ts` and
 * loaded from there, never from Google's CDN. Two reasons: step 5's promise
 * that a render needs no network, and step 6's test case 6 — a font can only
 * render identically in the Player and in a CLI render if both read the same
 * bytes off the same disk.
 */
import type { FontId } from './types';

export interface FontSpec {
  id: FontId;
  /** Shown in the picker. */
  label: string;
  /** The family name as the browser will know it. */
  family: string;
  /** Fallback chain, used until the file loads and if it ever fails to. */
  fallback: string;
  /** Google Fonts CSS2 `family=` value, including axes. */
  googleSpec: string;
  /** Default weight for this role. */
  weight: number;
  /** Width axis, for variable families that have one. */
  stretch?: string;
  /**
   * Rough advance width per character, as a fraction of the font size.
   *
   * What the fitters in `slides/layout` size against. Absent means the default
   * — every face here is within a few percent of it — and it is stated only
   * where a face is genuinely a different width, which so far means the far
   * end of Archivo's width axis. Getting this wrong is visible: too small and
   * a headline runs off the right edge of the frame.
   */
  advance?: number;
  /** Utility faces are often set tracked-out and uppercase; this is part of the choice. */
  tracking?: string;
  uppercase?: boolean;
  role: 'display' | 'body' | 'utility';
}

const SANS = 'ui-sans-serif, system-ui, sans-serif';
const SERIF = 'ui-serif, Georgia, serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export const FONTS: Record<FontId, FontSpec> = {
  'archivo-condensed': {
    id: 'archivo-condensed',
    label: 'Archivo Condensed',
    family: 'Archivo',
    fallback: SANS,
    googleSpec: 'Archivo:wdth,wght@62..125,400..700',
    weight: 700,
    // Archivo is variable on width; 75% is the condensed cut the theme wants.
    stretch: '75%',
    role: 'display',
  },
  'archivo-expanded': {
    id: 'archivo-expanded',
    label: 'Archivo Expanded',
    family: 'Archivo',
    fallback: SANS,
    // The same variable file the condensed cut reads. `uniqueFontSpecs` dedupes
    // on this string, so a second Archivo width costs no extra download and
    // nothing new has to be mirrored.
    googleSpec: 'Archivo:wdth,wght@62..125,400..700',
    weight: 700,
    // The far end of the same width axis: 125% is a poster face, and next to
    // the 75% cut it reads as a different family altogether.
    stretch: '125%',
    // Measurably wider than the default, and the reason this field exists:
    // fitted at 0.56 the seven letters of "Faraway" ran past the right margin.
    advance: 0.72,
    role: 'display',
  },
  bricolage: {
    id: 'bricolage',
    label: 'Bricolage Grotesque',
    family: 'Bricolage Grotesque',
    fallback: SANS,
    googleSpec: 'Bricolage+Grotesque:opsz,wght@12..96,200..800',
    weight: 700,
    role: 'display',
  },
  familjen: {
    id: 'familjen',
    label: 'Familjen Grotesk',
    family: 'Familjen Grotesk',
    fallback: SANS,
    googleSpec: 'Familjen+Grotesk:wght@400..700',
    weight: 700,
    role: 'display',
  },
  anton: {
    id: 'anton',
    label: 'Anton',
    family: 'Anton',
    fallback: SANS,
    googleSpec: 'Anton',
    weight: 400, // Anton ships one weight, and it is already heavy
    role: 'display',
  },
  fraunces: {
    id: 'fraunces',
    label: 'Fraunces',
    family: 'Fraunces',
    fallback: SERIF,
    googleSpec: 'Fraunces:opsz,wght@9..144,100..900',
    weight: 700,
    role: 'display',
  },
  'space-grotesk': {
    id: 'space-grotesk',
    label: 'Space Grotesk',
    family: 'Space Grotesk',
    fallback: SANS,
    googleSpec: 'Space+Grotesk:wght@300..700',
    weight: 700,
    role: 'display',
  },

  syne: {
    id: 'syne',
    label: 'Syne',
    family: 'Syne',
    fallback: SANS,
    googleSpec: 'Syne:wght@400..800',
    weight: 800,
    role: 'display',
  },
  outfit: {
    id: 'outfit',
    label: 'Outfit',
    family: 'Outfit',
    fallback: SANS,
    googleSpec: 'Outfit:wght@100..900',
    weight: 700,
    role: 'display',
  },

  'plex-sans': {
    id: 'plex-sans',
    label: 'IBM Plex Sans',
    family: 'IBM Plex Sans',
    fallback: SANS,
    googleSpec: 'IBM+Plex+Sans:wght@400;500;600',
    weight: 400,
    role: 'body',
  },
  inter: {
    id: 'inter',
    label: 'Inter',
    family: 'Inter',
    fallback: SANS,
    googleSpec: 'Inter:wght@400..700',
    weight: 400,
    role: 'body',
  },
  'source-serif': {
    id: 'source-serif',
    label: 'Source Serif',
    family: 'Source Serif 4',
    fallback: SERIF,
    googleSpec: 'Source+Serif+4:opsz,wght@8..60,400..700',
    weight: 400,
    role: 'body',
  },
  'work-sans': {
    id: 'work-sans',
    label: 'Work Sans',
    family: 'Work Sans',
    fallback: SANS,
    googleSpec: 'Work+Sans:wght@400..700',
    weight: 400,
    role: 'body',
  },

  'plex-mono': {
    id: 'plex-mono',
    label: 'IBM Plex Mono',
    family: 'IBM Plex Mono',
    fallback: MONO,
    googleSpec: 'IBM+Plex+Mono:wght@400;500',
    weight: 400,
    tracking: '0.08em',
    uppercase: true,
    role: 'utility',
  },
  'courier-prime': {
    id: 'courier-prime',
    label: 'Courier Prime',
    family: 'Courier Prime',
    fallback: MONO,
    googleSpec: 'Courier+Prime:wght@400;700',
    weight: 400,
    tracking: '0.06em',
    uppercase: true,
    role: 'utility',
  },
  'inter-tracked': {
    id: 'inter-tracked',
    label: 'Inter (tracked)',
    family: 'Inter',
    fallback: SANS,
    googleSpec: 'Inter:wght@400..700',
    weight: 500,
    tracking: '0.16em',
    uppercase: true,
    role: 'utility',
  },
};

export const ALL_FONTS: FontSpec[] = Object.values(FONTS);

export const DISPLAY_FONTS = ALL_FONTS.filter((f) => f.role === 'display');
export const BODY_FONTS = ALL_FONTS.filter((f) => f.role === 'body');
export const UTILITY_FONTS = ALL_FONTS.filter((f) => f.role === 'utility');

/** The CSS `font-family` value for a choice, family first and fallbacks after. */
export const fontStack = (id: FontId): string => {
  const spec = FONTS[id];
  return `"${spec.family}", ${spec.fallback}`;
};

/**
 * Everything a slide needs to set one piece of text, as inline style props.
 * Slides spread this rather than assembling font properties themselves.
 */
export const fontStyle = (id: FontId): React.CSSProperties => {
  const spec = FONTS[id];
  return {
    fontFamily: fontStack(id),
    fontWeight: spec.weight,
    ...(spec.stretch ? { fontStretch: spec.stretch } : {}),
    ...(spec.tracking ? { letterSpacing: spec.tracking } : {}),
    ...(spec.uppercase ? { textTransform: 'uppercase' as const } : {}),
  };
};

/**
 * Distinct families to mirror. Several ids share one family (Inter is both a
 * body and a utility choice), so downloading per id would fetch it twice.
 */
export const uniqueFontSpecs = (): FontSpec[] => {
  const seen = new Set<string>();
  return ALL_FONTS.filter((spec) => {
    if (seen.has(spec.googleSpec)) return false;
    seen.add(spec.googleSpec);
    return true;
  });
};
