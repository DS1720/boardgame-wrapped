/**
 * Themes are data. A slide reads tokens; it never names a color or a font.
 *
 * The shape follows step 6 of the plan. The one refinement: the three type
 * slots hold a `FontId` rather than a raw CSS stack, because a font choice is
 * more than a family name — "Archivo Condensed" is Archivo at 75% width, and a
 * bare stack has nowhere to put that. `fonts.ts` resolves an id to the stack,
 * weight and stretch a slide actually needs.
 */

export type FontId =
  // display
  | 'archivo-condensed'
  | 'bricolage'
  | 'familjen'
  | 'anton'
  | 'fraunces'
  | 'space-grotesk'
  // body
  | 'plex-sans'
  | 'inter'
  | 'source-serif'
  | 'work-sans'
  // utility
  | 'plex-mono'
  | 'courier-prime'
  | 'inter-tracked';

export type TextureId = 'none' | 'grain' | 'paper' | 'lamp';

/** The one element that makes a theme recognizable. Step 7 renders these. */
export type SignatureId = 'diecut' | 'tally' | 'lamp' | 'dice' | 'tiles' | 'pegs' | 'none';

/**
 * Signatures that draw a count as a set of marks, one arriving at a time.
 *
 * These four share the timing helpers in `src/video/signature`, so a count of
 * 233 never outlives its slide whichever theme is on.
 */
export type CountSignature = Extract<SignatureId, 'tally' | 'dice' | 'tiles' | 'pegs'>;

export const COUNT_SIGNATURES: CountSignature[] = ['tally', 'dice', 'tiles', 'pegs'];

export interface ThemeColor {
  /** Slide ground. */
  bg: string;
  /** Cards, tiles, the plate a stat sits on. */
  surface: string;
  /** Primary text. */
  ink: string;
  /** Labels, captions, anything secondary. */
  inkMuted: string;
  /** The number, the highlight. */
  accent: string;
  /** Secondary highlight. */
  accentAlt: string;
}

export interface ThemeType {
  display: FontId;
  body: FontId;
  utility: FontId;
  /** Four sizes only, in px at 1080 wide: caption, body, headline, display. */
  scale: [number, number, number, number];
}

export interface ThemeMotion {
  stiffness: number;
  damping: number;
  /** Frames between staggered children. */
  stagger: number;
}

export interface Theme {
  id: string;
  name: string;
  color: ThemeColor;
  type: ThemeType;
  motion: ThemeMotion;
  texture: TextureId;
  signature: SignatureId;
}

/** Which of the four ways a theme was arrived at. Drives the picker UI. */
export type ThemeMode = 'starter' | 'custom' | 'random' | 'boxart';

/**
 * Contrast floors.
 *
 * `inkOnBg` and `accentOnBg` are step 6's test case 3, applied to every
 * generated theme.
 *
 * `accentOnBgLarge` is the WCAG threshold for large text, and it is the bar the
 * hand-specified starters are held to: their accents are only ever set at
 * display sizes. Punchboard's printer's blue on chipboard measures 3.85:1 and
 * Scorepad's red pen 4.51:1 — correct for a 220px number, too low for a caption.
 *
 * `accentAlt` in the starters is **decorative only**. Punchboard's registration
 * red sits at 2.22:1 on its own ground and Scorepad's rule blue at 2.77:1;
 * neither is legible as text at any size. Use it for rules, marks and fills. If
 * a slide needs to set type in it, pass it through `ensureContrast` first.
 */
export const CONTRAST = {
  inkOnBg: 7,
  accentOnBg: 4.5,
  accentOnBgLarge: 3,
} as const;
