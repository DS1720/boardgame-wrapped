/**
 * The starter themes: the plan's original three, plus three more.
 *
 * These are the only place in the codebase where a literal hex value is
 * correct: this file *is* the palette. Every slide reads these through tokens.
 *
 * Each one owns a ground, a display face and a signature that no other theme
 * uses — a test enforces all three, because the point of having six is that
 * they look like six studios' work rather than one palette shuffled.
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
    scale: [30, 44, 132, 300],
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
    scale: [28, 42, 126, 280],
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
    scale: [30, 44, 136, 310],
  },
  // Lamplight is slow and heavy; nothing in this theme should feel snappy.
  motion: { stiffness: 90, damping: 20, stagger: 7 },
  texture: 'lamp',
  signature: 'lamp',
};

/**
 * D — Felt Table. Grounded in the cloth a game gets played on.
 * Signature: counts thrown as dice, each one tumbling through faces in the air
 * and landing on its own, over a napped cloth with a stitched edge.
 */
export const feltTable: Theme = {
  id: 'felt-table',
  name: 'Felt Table',
  color: {
    bg: '#0F2A20',
    surface: '#17392C',
    ink: '#F4F1E6',
    inkMuted: '#8DA79A',
    accent: '#E9B84C',
    accentAlt: '#CC5541',
  },
  type: {
    display: 'anton',
    body: 'work-sans',
    utility: 'inter-tracked',
    scale: [30, 44, 138, 320],
  },
  // Dice land hard and stop dead. Nothing here should float.
  motion: { stiffness: 200, damping: 24, stagger: 4 },
  texture: 'grain',
  signature: 'dice',
};

/**
 * E — Meadow. Grounded in a tile-laying game mid-play.
 * Signature: counts laid out as tiles, each dropped in with a quarter turn and
 * a road across it, over a faint field of the same tiles.
 */
export const meadow: Theme = {
  id: 'meadow',
  name: 'Meadow',
  color: {
    bg: '#E9E4D2',
    surface: '#FFFDF4',
    ink: '#26261E',
    inkMuted: '#75735F',
    accent: '#3E7A34',
    accentAlt: '#B4611C',
  },
  type: {
    display: 'fraunces',
    body: 'source-serif',
    utility: 'plex-mono',
    scale: [29, 43, 128, 290],
  },
  // A tile is placed deliberately: a little slower, with room between placements.
  motion: { stiffness: 130, damping: 19, stagger: 6 },
  texture: 'paper',
  signature: 'tiles',
};

/**
 * F — Peg Board. Grounded in a cribbage board's scoring track.
 * Signature: counts pegged out along a drilled track, holes drilled first and
 * pegs dropping into them, with the board's own tracks down both margins.
 */
export const pegBoard: Theme = {
  id: 'peg-board',
  name: 'Peg Board',
  color: {
    bg: '#3E2A1C',
    surface: '#523726',
    ink: '#F6EEE2',
    inkMuted: '#B49A80',
    accent: '#E3A85C',
    accentAlt: '#6FA79C',
  },
  type: {
    display: 'space-grotesk',
    body: 'inter',
    utility: 'courier-prime',
    scale: [30, 44, 130, 300],
  },
  // A peg seats into a hole: quick, and completely still once it is in.
  motion: { stiffness: 160, damping: 21, stagger: 5 },
  texture: 'grain',
  signature: 'pegs',
};

export const STARTERS: Theme[] = [
  punchboard,
  scorepad,
  tableLight,
  feltTable,
  meadow,
  pegBoard,
];

export const DEFAULT_THEME = tableLight;

export const starterById = (id: string): Theme | null =>
  STARTERS.find((theme) => theme.id === id) ?? null;
