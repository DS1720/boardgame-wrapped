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

/**
 * G — Neon Night. Grounded in nothing on the table: this one is a poster.
 *
 * The other six are named after a material and behave like it. This one is
 * named after a look, and it exists because six tasteful palettes could not get
 * anywhere near a Wrapped deck however they were arranged. It is the only
 * starter that states its own `grounds`: six saturated cards nobody would
 * derive from a formula, which is the whole point of them.
 *
 * Signature: cubes — the one component every game in the export has in a bag
 * somewhere, drawn flat and huge.
 */
export const neonNight: Theme = {
  id: 'neon-night',
  name: 'Neon Night',
  color: {
    bg: '#150A2E',
    surface: '#241246',
    ink: '#FFFFFF',
    inkMuted: '#A79BC8',
    accent: '#D6FF3E',
    accentAlt: '#FF3D9A',
  },
  type: {
    // The far end of Archivo's width axis. Next to Punchboard's 75% cut it
    // reads as a different family, and it costs no extra font to mirror.
    display: 'archivo-expanded',
    body: 'inter',
    utility: 'inter-tracked',
    // A step larger than any other starter: this theme is set to be shouted.
    scale: [32, 46, 150, 340],
  },
  // Nothing here eases. A card lands and the next one is already there.
  motion: { stiffness: 210, damping: 20, stagger: 3 },
  // Flat colour, deliberately. A texture over these grounds is a smudge on a
  // poster, and the grounds are doing the work a texture normally does.
  texture: 'none',
  signature: 'cubes',
  /*
    Two deep cards, three bright ones and a magenta, in an order that never puts
    two of the same weight together — the snap between cards is the effect, and
    two dark cards in a row is a gap in it.

    Each one is chosen so the palette that comes out of it stays saturated:
    a ground that cannot carry legible ink gets walked toward the light by
    `paletteForGround`, and a hot pink walked far enough to hold dark text is a
    pale pink. The magenta is deep enough to take white instead, so it keeps its
    colour and gets the lime for a number.
  */
  grounds: ['#150A2E', '#D6FF3E', '#B00050', '#00E5C0', '#3B1E8F', '#FF8A3D'],
};

/**
 * H — Blueprint. Grounded in the drawing a game gets designed from.
 *
 * The cool one. Six of the nine are warm — cardboard, paper, lamplight, wood,
 * parchment — and Neon Night is loud rather than cool, so this is the only
 * theme that reads as calm and technical. Its ground cycle is derived like
 * everything but Neon Night's: navy, teal, the drafting cyan itself.
 *
 * Signature: grid — two grids at a five-to-one ratio and a measured rule down
 * each margin, sliding diagonally under the frame.
 */
export const blueprint: Theme = {
  id: 'blueprint',
  name: 'Blueprint',
  color: {
    bg: '#0B2038',
    surface: '#153050',
    ink: '#E8F2FF',
    inkMuted: '#8FA8C4',
    accent: '#5FD4FF',
    // Deliberately below the cyan on this ground. `paletteForGround` gives the
    // accent slot to whichever highlight reads better, so an accentAlt with
    // more contrast than the accent would quietly demote the colour the theme
    // is named for.
    accentAlt: '#E58B3C',
  },
  type: {
    display: 'syne',
    body: 'inter',
    utility: 'plex-mono',
    scale: [30, 44, 134, 300],
  },
  // Drawn with an instrument: quick, exact, and stops where it was put.
  motion: { stiffness: 190, damping: 24, stagger: 4 },
  // The grid is the texture. A second one over it is a smudge on a drawing.
  texture: 'none',
  signature: 'grid',
};

/**
 * I — Meeple. Grounded in the piece itself.
 *
 * The one component in the box shaped like a person, which is why this is the
 * warm one: a year of games is a year of people, and every other theme is named
 * after a material.
 *
 * Signature: meeples — the same arrangement Neon Night gives its cubes, three
 * depths and clear of the middle, in a shape you can name.
 */
export const meeple: Theme = {
  id: 'meeple',
  name: 'Meeple',
  color: {
    bg: '#F3E2C7',
    surface: '#FFF6E7',
    ink: '#2E2013',
    inkMuted: '#7C6249',
    accent: '#B23A2E',
    accentAlt: '#2F7D6B',
  },
  type: {
    display: 'outfit',
    body: 'work-sans',
    utility: 'inter-tracked',
    scale: [30, 44, 132, 300],
  },
  // A piece is placed by hand and then let go of.
  motion: { stiffness: 150, damping: 20, stagger: 5 },
  texture: 'paper',
  signature: 'meeples',
};

export const STARTERS: Theme[] = [
  punchboard,
  scorepad,
  tableLight,
  feltTable,
  meadow,
  pegBoard,
  neonNight,
  blueprint,
  meeple,
];

export const DEFAULT_THEME = tableLight;

export const starterById = (id: string): Theme | null =>
  STARTERS.find((theme) => theme.id === id) ?? null;
