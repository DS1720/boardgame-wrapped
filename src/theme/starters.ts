/**
 * The three starter themes from step 6 of the plan.
 *
 * These are the only place in the codebase where a literal hex value is
 * correct: this file *is* the palette. Every slide reads these through tokens.
 */
import type { Theme } from './types';

/**
 * A — Punchboard. Grounded in unpunched cardboard sprues.
 * Signature: stats sit inside die-cut rounded rectangles that punch out of the
 * board on entry, leaving a recessed shadow behind.
 */
export const punchboard: Theme = {
  id: 'punchboard',
  name: 'Punchboard',
  color: {
    bg: '#B8AC97',
    surface: '#CFC5B2',
    ink: '#1C1A17',
    inkMuted: '#6B6255',
    accent: '#2B4C7E',
    accentAlt: '#C8402F',
  },
  type: {
    display: 'archivo-condensed',
    body: 'plex-sans',
    utility: 'plex-mono',
    scale: [28, 40, 92, 220],
  },
  // Cardboard is stiff and does not bounce: a fast, hard-damped punch.
  motion: { stiffness: 180, damping: 22, stagger: 4 },
  texture: 'paper',
  signature: 'diecut',
};

/**
 * B — Scorepad. Grounded in a paper score sheet.
 * Signature: play counts drawn as tally marks that stroke on one at a time,
 * numbers drawing on rather than fading, faint ruled lines throughout.
 */
export const scorepad: Theme = {
  id: 'scorepad',
  name: 'Scorepad',
  color: {
    bg: '#EDF1E6',
    surface: '#FFFFFF',
    ink: '#3A3A38',
    inkMuted: '#8A8A82',
    accent: '#D02B2B',
    accentAlt: '#7A94A6',
  },
  type: {
    display: 'bricolage',
    body: 'source-serif',
    utility: 'courier-prime',
    scale: [26, 38, 88, 200],
  },
  // A pen stroke settles rather than snaps: softer, slower, wider stagger.
  motion: { stiffness: 110, damping: 18, stagger: 6 },
  texture: 'paper',
  signature: 'tally',
};

/**
 * C — Table Light. Grounded in the data itself: these plays cluster between
 * 20:00 and 01:00.
 * Signature: a soft radial pool of warm light behind the subject, everything
 * outside it falling to near-black, drifting a few pixels over the slide.
 */
export const tableLight: Theme = {
  id: 'table-light',
  name: 'Table Light',
  color: {
    bg: '#0E1512',
    surface: '#182420',
    ink: '#F0EDE4',
    inkMuted: '#8C9A93',
    accent: '#F2C879',
    accentAlt: '#D9784F',
  },
  type: {
    display: 'familjen',
    body: 'inter',
    utility: 'inter-tracked',
    scale: [28, 40, 96, 232],
  },
  // Lamplight is slow and heavy; nothing in this theme should feel snappy.
  motion: { stiffness: 90, damping: 20, stagger: 7 },
  texture: 'lamp',
  signature: 'lamp',
};

export const STARTERS: Theme[] = [punchboard, scorepad, tableLight];

export const DEFAULT_THEME = tableLight;

export const starterById = (id: string): Theme | null =>
  STARTERS.find((theme) => theme.id === id) ?? null;
