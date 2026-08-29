import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { withAlpha } from '@/theme/color';
import { useTheme } from '@/theme/ThemeContext';
import { COUNT_SIGNATURES, type CountSignature, type SignatureId } from '@/theme/types';
import { BOX_ART, VIDEO } from '../config';
import { useMotionSpring } from '../motion';

/**
 * A seamless offset for a repeating pattern.
 *
 * Returns a value in [0, pitch) that advances one whole pitch every
 * `framesPerPitch` frames. Translating a tiled layer by it moves forever
 * without the tiling ever showing a seam: at the moment the offset wraps back
 * to zero, the pattern is exactly one tile along and looks identical.
 *
 * Frame-driven, never `Math.random`. Determinism applies to a background
 * exactly as much as to a stat.
 */
const useTileDrift = (pitch: number, framesPerPitch: number): number =>
  ((useCurrentFrame() % framesPerPitch) / framesPerPitch) * pitch;

/**
 * Enough overhang that a drifting layer never shows its own edge.
 *
 * A tiled fill translated by up to one pitch exposes a strip of nothing at the
 * trailing edge unless the layer is bigger than the frame it sits in.
 */
const BLEED = 160;

/**
 * Theme signatures — the one element that makes each theme recognizable.

 * Every one of them moves. A still signature under a video whose ground now
 * travels between colours read as a printed sheet with a light show behind it —
 * and the plan's rule that the frame is never still was only ever half kept by
 * the ambient fields. The content is what holds still; the room it sits in
 * does not.
 *
 * Step 6 declared these in the tokens; this is where they are drawn. A
 * signature is the thing a person would describe if asked what the video looked
 * like, so each theme gets exactly one and it appears on every slide.
 */

/* -------------------------------------------------------------------------- */
/* Punchboard: die-cut                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Stats sit in rounded rectangles that punch out of the board on entry,
 * leaving a recessed shadow behind them.
 *
 * The recess is drawn first and never moves; the plate travels out of it. That
 * ordering is the whole illusion — a plate and its hole moving together would
 * just read as a card sliding.
 */
const DieCut: React.FC<{ children: React.ReactNode; delay: number }> = ({ children, delay }) => {
  const { color } = useTheme();
  const progress = useMotionSpring(delay);
  const lift = interpolate(progress, [0, 1], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: BOX_ART.radius,
          // The hole left behind: darker than the board, lit from the top edge.
          backgroundColor: withAlpha(color.ink, 0.14),
          boxShadow: `inset 0 3px 6px ${withAlpha(color.ink, 0.3)}`,
        }}
      />
      <div
        style={{
          position: 'relative',
          borderRadius: BOX_ART.radius,
          backgroundColor: color.surface,
          padding: '40px 44px',
          transform: `translate(${lift * -10}px, ${lift * -14}px)`,
          boxShadow: `${lift * 12}px ${lift * 16}px ${lift * 26}px ${withAlpha(color.ink, 0.28)}`,
        }}
      >
        {children}
      </div>
    </div>
  );
};

/**
 * The board these stats are punched out of, drifting past.
 *
 * Punchboard was the one theme with no backdrop at all: its signature acts on
 * the plate a stat sits in and nowhere else, which left the ground bare. These
 * are the cut lines of the shapes *not* yet punched out — the rest of the
 * sheet — so the die-cut plate reads as one piece taken from a board rather
 * than a card floating on a colour.
 */
const SPRUE_PITCH = 260;

const SprueField: React.FC = () => {
  const { color } = useTheme();
  const drift = useTileDrift(SPRUE_PITCH, 900);
  const rows = Math.ceil((VIDEO.height + BLEED * 2) / SPRUE_PITCH) + 1;
  const cols = Math.ceil((VIDEO.width + BLEED * 2) / SPRUE_PITCH) + 1;

  return (
    <AbsoluteFill aria-hidden style={{ overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: -BLEED,
          transform: `translate(${-drift * 0.35}px, ${-drift}px)`,
        }}
      >
        {Array.from({ length: rows * cols }, (_, i) => {
          const row = Math.floor(i / cols);
          const col = i % cols;
          // Every other row is offset half a pitch, the way a real sheet nests
          // its shapes to waste less board.
          const x = col * SPRUE_PITCH + (row % 2 ? SPRUE_PITCH / 2 : 0);
          const size = (row + col) % 3 === 0 ? 150 : 108;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: x,
                top: row * SPRUE_PITCH,
                width: size,
                height: size,
                borderRadius: size * 0.16,
                border: `2px solid ${withAlpha(color.ink, 0.13)}`,
              }}
            />
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/* -------------------------------------------------------------------------- */
/* Scorepad: tally marks and ruled lines                                       */
/* -------------------------------------------------------------------------- */

/** Faint ruled lines running through every slide, like a score sheet. */
const RULE_PITCH = 89;

const RuledLines: React.FC = () => {
  const { color } = useTheme();
  // One rule every ten seconds: slow enough to read as a page being filled
  // rather than as a scroll, fast enough to be motion rather than a still.
  const drift = useTileDrift(RULE_PITCH, 300);

  return (
    <AbsoluteFill aria-hidden style={{ overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: -BLEED,
          transform: `translateY(${-drift}px)`,
          backgroundImage: `repeating-linear-gradient(180deg, transparent 0 ${
            RULE_PITCH - 2
          }px, ${withAlpha(color.accentAlt, 0.28)} ${RULE_PITCH - 2}px ${RULE_PITCH}px)`,
        }}
      />
    </AbsoluteFill>
  );
};

/**
 * A count drawn as tally marks that stroke on one at a time.
 *
 * Capped, because 233 tally marks is not a slide. Past the cap the marks read
 * as a texture standing in for the number rather than a countable set, which is
 * the honest way to show it — the exact figure is always beside them.
 */
/** Frames one mark takes to arrive. A pen stroke; the heavier marks override it. */
export const MARK_DRAW_FRAMES = 3;

/**
 * Frames between the start of one mark and the next.
 *
 * Marks share a fixed window rather than each taking a fixed slot. With a flat
 * 3-frame stagger, 25 marks ran 84 frames and the last strokes were still being
 * drawn as the slide cut away.
 *
 * `draw` is how long a single mark takes: a pen stroke is three frames, a die
 * that has to tumble and land needs more. All four counting signatures go
 * through here, so none of them can outrun its slide.
 */
export const markStep = (
  shown: number,
  windowFrames: number,
  draw: number = MARK_DRAW_FRAMES,
): number => (shown > 1 ? Math.min(draw, (windowFrames - draw) / (shown - 1)) : 0);

/** The frame, relative to the set's start, at which the last mark is complete. */
export const markFinishFrame = (
  shown: number,
  windowFrames: number,
  draw: number = MARK_DRAW_FRAMES,
): number => (shown <= 0 ? 0 : (shown - 1) * markStep(shown, windowFrames, draw) + draw);

/** How far through its own arrival mark `index` is, from 0 to 1. */
const markProgress = (
  frame: number,
  index: number,
  shown: number,
  windowFrames: number,
  draw: number,
): number =>
  interpolate(frame - index * markStep(shown, windowFrames, draw), [0, draw], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

export interface CountMarksProps {
  count: number;
  delay?: number;
  max?: number;
  /** Frames the whole set has to finish in, so it never outlives its slide. */
  windowFrames?: number;
}

export const TallyMarks: React.FC<CountMarksProps> = ({
  count,
  delay = 0,
  max = 25,
  windowFrames = 46,
}) => {
  const frame = useCurrentFrame();
  const { color } = useTheme();
  const shown = Math.min(count, max);
  const groups = Math.ceil(shown / 5);

  const step = markStep(shown, windowFrames);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22, alignItems: 'flex-end' }}>
      {Array.from({ length: groups }, (_, groupIndex) => {
        const inGroup = Math.min(5, shown - groupIndex * 5);
        return (
          <svg key={groupIndex} width={68} height={72} viewBox="0 0 68 72" aria-hidden>
            {Array.from({ length: inGroup }, (_, markIndex) => {
              const index = groupIndex * 5 + markIndex;
              const drawn = interpolate(frame - delay - index * step, [0, MARK_DRAW_FRAMES], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              });
              // A zero-length line with a round cap draws a dot, so an
              // un-started mark has to be left out entirely rather than sized 0.
              if (drawn <= 0) return null;
              const isFifth = markIndex === 4;
              // The fifth mark crosses the other four, as a real tally does.
              const x1 = isFifth ? 4 : 8 + markIndex * 13;
              const y1 = isFifth ? 58 : 6;
              const x2 = isFifth ? 60 : 8 + markIndex * 13;
              const y2 = isFifth ? 14 : 66;
              return (
                <line
                  key={markIndex}
                  x1={x1}
                  y1={y1}
                  x2={x1 + (x2 - x1) * drawn}
                  y2={y1 + (y2 - y1) * drawn}
                  stroke={color.accent}
                  strokeWidth={5}
                  strokeLinecap="round"
                />
              );
            })}
          </svg>
        );
      })}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Table Light: the lamp pool                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A soft radial pool of warm light behind the subject, everything outside it
 * falling to near-black. The pool drifts a few pixels over the slide, so the
 * light never looks like a static gradient.
 */
const LampPool: React.FC = () => {
  const frame = useCurrentFrame();
  const { color } = useTheme();

  // A slow, unsynchronised drift — the two axes use different periods so the
  // motion never repeats visibly inside one slide. Wider than it was: at ±2%
  // the lamp was technically moving and visibly still.
  const x = 50 + Math.sin(frame / 96) * 6;
  const y = 38 + Math.cos(frame / 71) * 4.5;
  // The pool breathes as well as drifts, so the light has a source rather than
  // being a shape that slides.
  const spread = 58 + Math.sin(frame / 121) * 5;

  return (
    <AbsoluteFill
      aria-hidden
      style={{
        backgroundImage: `radial-gradient(${spread}% ${spread * 0.66}% at ${x}% ${y}%, ${withAlpha(
          color.accent,
          0.24,
        )} 0%, ${withAlpha(color.accent, 0.08)} 45%, transparent 72%)`,
      }}
    />
  );
};

/* -------------------------------------------------------------------------- */
/* Felt Table: dice                                                            */
/* -------------------------------------------------------------------------- */

/** A die takes longer than a pen stroke: it has to tumble and land. */
const DIE_ROLL_FRAMES = 9;

/** Pip positions on a 3×3 grid, by face. The layout every die in the world uses. */
const PIPS: Record<number, ReadonlyArray<readonly [number, number]>> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
  ],
  5: [
    [0, 0],
    [2, 0],
    [1, 1],
    [0, 2],
    [2, 2],
  ],
  6: [
    [0, 0],
    [2, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [2, 2],
  ],
};

/**
 * The face a die shows while it is still in the air.
 *
 * Driven by the frame rather than by `Math.random`, so the same video renders
 * the same way every time — the plan's determinism rule applies to a decorative
 * tumble exactly as much as to a stat.
 */
const tumblingFace = (index: number, frame: number): number =>
  1 + ((index * 5 + Math.floor(frame / 2)) % 6);

/**
 * A count thrown as dice: six pips to a die, each one tumbling in and landing.
 *
 * The roll is the detail that makes it. A die that simply faded in at its final
 * face would be a picture of dice; cycling the face while it is in the air and
 * settling on the real one is what reads as a throw.
 */
export const DiceMarks: React.FC<CountMarksProps> = ({
  count,
  delay = 0,
  max = 36,
  windowFrames = 46,
}) => {
  const frame = useCurrentFrame();
  const { color } = useTheme();
  const shown = Math.min(count, max);
  const dice = Math.ceil(shown / 6);
  const size = 88;
  const pip = 8;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
      {Array.from({ length: dice }, (_, index) => {
        const value = Math.min(6, shown - index * 6);
        const landed = markProgress(frame - delay, index, dice, windowFrames, DIE_ROLL_FRAMES);
        if (landed <= 0) return null;

        const face = landed < 1 ? tumblingFace(index, frame) : value;
        // Tumbles through most of a turn and settles square.
        const spin = (1 - landed) * -150;
        // Lands slightly hard, then sits.
        const drop = (1 - landed) * -26;
        const scale = 0.62 + landed * 0.38;

        return (
          <svg
            key={index}
            width={size}
            height={size}
            viewBox="0 0 60 60"
            aria-hidden
            style={{ transform: `translateY(${drop}px) rotate(${spin}deg) scale(${scale})` }}
          >
            <rect
              x={2}
              y={2}
              width={56}
              height={56}
              rx={13}
              fill={color.surface}
              stroke={withAlpha(color.ink, 0.35)}
              strokeWidth={1.5}
            />
            {PIPS[face].map(([cx, cy], p) => (
              <circle
                key={p}
                cx={13 + cx * 17}
                cy={13 + cy * 17}
                r={pip}
                fill={landed < 1 ? withAlpha(color.accent, 0.55) : color.accent}
              />
            ))}
          </svg>
        );
      })}
    </div>
  );
};

/** Stitched edging, like the border of a card table. Drawn on every slide. */
const NAP_PITCH = 9;

const FeltNap: React.FC = () => {
  const frame = useCurrentFrame();
  const { color } = useTheme();
  // The nap itself creeps along its own angle. At a 9px pitch the individual
  // lines are far too fine to follow, which is the point: what you see is the
  // cloth breathing, not stripes moving.
  const nap = useTileDrift(NAP_PITCH, 150);
  // A sheen crossing the table, the way light moves over felt when someone
  // leans over it. Twenty-three seconds for a full pass.
  const sweep = ((frame % 690) / 690) * 240 - 70;

  return (
    <AbsoluteFill aria-hidden style={{ overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: -BLEED,
          transform: `translate(${nap}px, ${nap}px)`,
          backgroundImage: `repeating-linear-gradient(118deg, ${withAlpha(
            color.ink,
            0.05,
          )} 0 2px, transparent 2px ${NAP_PITCH}px)`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(118deg, transparent ${sweep - 26}%, ${withAlpha(
            color.ink,
            0.05,
          )} ${sweep}%, transparent ${sweep + 26}%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 54,
          borderRadius: 26,
          border: `2px dashed ${withAlpha(color.accent, 0.22)}`,
        }}
      />
    </AbsoluteFill>
  );
};

/* -------------------------------------------------------------------------- */
/* Meadow: laid tiles                                                          */
/* -------------------------------------------------------------------------- */

/** A tile is placed, not stroked: long enough to see it turn and settle. */
const TILE_LAY_FRAMES = 6;

/**
 * A count laid out as tiles, one placed at a time.
 *
 * Each tile carries a road across it, quarter-turned by its own index, so the
 * finished block is a little mosaic rather than a grid of identical squares —
 * the same reason a tally crosses every fifth mark.
 */
export const TileMarks: React.FC<CountMarksProps> = ({
  count,
  delay = 0,
  max = 24,
  windowFrames = 46,
}) => {
  const frame = useCurrentFrame();
  const { color } = useTheme();
  const shown = Math.min(count, max);
  const size = 62;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, maxWidth: 8 * (size + 10) }}>
      {Array.from({ length: shown }, (_, index) => {
        const laid = markProgress(frame - delay, index, shown, windowFrames, TILE_LAY_FRAMES);
        if (laid <= 0) return null;

        // Dropped in from above with a turn that settles square.
        const turn = (1 - laid) * (index % 2 === 0 ? 16 : -16);
        const drop = (1 - laid) * -22;
        // Which way this tile's road runs. Deterministic, and varied enough
        // that no two neighbours in a row match.
        const quarter = (index * 90 + Math.floor(index / 8) * 90) % 360;

        return (
          <svg
            key={index}
            width={size}
            height={size}
            viewBox="0 0 40 40"
            aria-hidden
            style={{ transform: `translateY(${drop}px) rotate(${turn}deg)`, opacity: laid }}
          >
            <rect
              x={1}
              y={1}
              width={38}
              height={38}
              rx={4}
              fill={color.surface}
              stroke={withAlpha(color.ink, 0.25)}
              strokeWidth={1.5}
            />
            <g transform={`rotate(${quarter} 20 20)`}>
              <path
                d="M20 0 L20 20 L40 20"
                fill="none"
                stroke={color.accent}
                strokeWidth={5}
                strokeLinecap="square"
              />
              <circle cx={20} cy={20} r={3.4} fill={color.accentAlt} />
            </g>
          </svg>
        );
      })}
    </div>
  );
};

/** A faint field of tiles behind everything, so the ground is the same material. */
const TILE_PITCH = 96;

const TileField: React.FC = () => {
  const { color } = useTheme();
  // Diagonally, and on two different periods, so the field never looks like it
  // is sliding in one direction — a landscape being laid out rather than a
  // texture being dragged.
  const x = useTileDrift(TILE_PITCH, 640);
  const y = useTileDrift(TILE_PITCH, 430);

  return (
    <AbsoluteFill aria-hidden style={{ overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: -BLEED,
          transform: `translate(${x}px, ${-y}px)`,
          backgroundImage: `repeating-linear-gradient(0deg, ${withAlpha(
            color.ink,
            0.06,
          )} 0 1px, transparent 1px ${TILE_PITCH}px), repeating-linear-gradient(90deg, ${withAlpha(
            color.ink,
            0.06,
          )} 0 1px, transparent 1px ${TILE_PITCH}px)`,
        }}
      />
    </AbsoluteFill>
  );
};

/* -------------------------------------------------------------------------- */
/* Peg Board: a scoring track                                                  */
/* -------------------------------------------------------------------------- */

/** A peg drops and seats; slower than a stroke, faster than a die. */
const PEG_SET_FRAMES = 5;

/** Holes to a row on the counting track. */
const PEGS_PER_ROW = 10;

/**
 * Rows of holes drilled, whichever count is being shown.
 *
 * Deliberately more holes than there are ever pegs. With the track exactly as
 * long as the count it stopped being a track — thirty filled holes and no empty
 * ones is a row of dots, and the whole idea is a position on a board.
 */
const TRACK_ROWS = 4;

/** Never more pegs than this, so there is always empty track ahead of them. */
const MAX_PEGS = TRACK_ROWS * PEGS_PER_ROW - PEGS_PER_ROW;

/**
 * A count pegged out along a drilled track, the way a cribbage board scores.
 *
 * Every hole is drilled first and stays drilled — the empty ones are as much
 * the point as the filled ones, because they are what makes it read as a track
 * with a position on it rather than a row of dots.
 */
export const PegMarks: React.FC<CountMarksProps> = ({
  count,
  delay = 0,
  max = MAX_PEGS,
  windowFrames = 46,
}) => {
  const frame = useCurrentFrame();
  const { color } = useTheme();
  const shown = Math.min(count, max);
  const pitch = 52;
  const rowHeight = 46;
  const width = PEGS_PER_ROW * pitch;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {Array.from({ length: TRACK_ROWS }, (_, row) => {
        const inRow = Math.max(0, Math.min(PEGS_PER_ROW, shown - row * PEGS_PER_ROW));
        return (
          <svg
            key={row}
            width={width}
            height={rowHeight}
            viewBox={`0 0 ${width} ${rowHeight}`}
            aria-hidden
          >
            {/* The routed groove the holes are drilled into. */}
            <rect
              x={4}
              y={rowHeight / 2 - 15}
              width={width - 8}
              height={30}
              rx={15}
              fill={withAlpha(color.ink, 0.1)}
            />

            {Array.from({ length: PEGS_PER_ROW }, (_, hole) => {
              const index = row * PEGS_PER_ROW + hole;
              const cx = pitch / 2 + hole * pitch;
              // Every fifth hole is a marked space, as on a real board.
              const marked = (index + 1) % 5 === 0;
              return (
                <circle
                  key={`hole-${hole}`}
                  cx={cx}
                  cy={rowHeight / 2}
                  r={marked ? 11 : 9}
                  fill={withAlpha(color.ink, 0.34)}
                  stroke={withAlpha(color.ink, marked ? 0.45 : 0.24)}
                  strokeWidth={1.5}
                />
              );
            })}

            {Array.from({ length: inRow }, (_, hole) => {
              const index = row * PEGS_PER_ROW + hole;
              const seated = markProgress(frame - delay, index, shown, windowFrames, PEG_SET_FRAMES);
              if (seated <= 0) return null;
              const cx = pitch / 2 + hole * pitch;
              // Falls into the hole and seats; the last of the travel is the
              // peg settling rather than still dropping.
              const drop = (1 - seated) * -34;
              return (
                <g key={`peg-${hole}`} transform={`translate(0 ${drop})`} opacity={seated}>
                  <circle cx={cx} cy={rowHeight / 2} r={9.5} fill={color.accent} />
                  {/* A highlight on the shoulder, so a peg reads as turned wood
                      rather than a flat dot. */}
                  <circle
                    cx={cx - 2.6}
                    cy={rowHeight / 2 - 3}
                    r={3}
                    fill={withAlpha(color.surface, 0.55)}
                  />
                </g>
              );
            })}
          </svg>
        );
      })}
    </div>
  );
};

/** The board's own tracks, running down both margins on every slide. */
const HOLE_PITCH = 70;

const PegTracks: React.FC = () => {
  const { color } = useTheme();
  // The board travelling past, one hole every four seconds. Every fifth hole is
  // larger, so the drift is countable rather than a texture sliding — which is
  // what a scoring track is for.
  const drift = useTileDrift(HOLE_PITCH * 5, 600);
  // Two extra holes beyond the frame at each end, so the ends never arrive.
  const holes = Math.ceil(VIDEO.height / HOLE_PITCH) + 6;

  return (
    <AbsoluteFill aria-hidden style={{ overflow: 'hidden' }}>
      {[54, 1026].map((x, track) => (
        <svg
          key={x}
          width={28}
          height={VIDEO.height + HOLE_PITCH * 6}
          style={{
            position: 'absolute',
            left: x - 14,
            top: -HOLE_PITCH * 3,
            // The two tracks run opposite ways, so the frame reads as depth
            // rather than as one sheet sliding behind the type.
            transform: `translateY(${track === 0 ? drift : -drift}px)`,
          }}
        >
          {Array.from({ length: holes }, (_, i) => (
            <circle
              key={i}
              cx={14}
              cy={HOLE_PITCH + i * HOLE_PITCH}
              r={(i + 1) % 5 === 0 ? 5 : 4}
              fill={withAlpha(color.ink, 0.3)}
            />
          ))}
        </svg>
      ))}
    </AbsoluteFill>
  );
};

/* -------------------------------------------------------------------------- */
/* Neon Night: cubes                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Big flat cubes drifting behind the content.
 *
 * The wooden cube is the one component every game in this export has a bag of,
 * and drawn flat and huge it is also the shape a poster is built from — which is
 * what this theme is. Six of them, at three depths, so the frame has a
 * foreground and a back without anything crossing the middle where the number
 * sits.
 *
 * They drift on their own long periods rather than entering: the ground snaps
 * at every cut in this theme, and a signature that re-entered on each snap would
 * turn a colour change into an animation. This one is simply always there.
 */
const CUBES = [
  { x: -6, y: 8, size: 340, tilt: -12, period: 31, opacity: 0.16 },
  { x: 72, y: 2, size: 260, tilt: 9, period: 43, opacity: 0.13 },
  { x: 80, y: 74, size: 420, tilt: -6, period: 37, opacity: 0.15 },
  { x: -14, y: 66, size: 300, tilt: 14, period: 29, opacity: 0.12 },
  { x: 58, y: 40, size: 150, tilt: 22, period: 23, opacity: 0.1 },
  { x: 4, y: 36, size: 120, tilt: -18, period: 19, opacity: 0.09 },
] as const;

const CubeField: React.FC = () => {
  const frame = useCurrentFrame();
  const { color } = useTheme();

  return (
    <AbsoluteFill aria-hidden style={{ overflow: 'hidden' }}>
      {CUBES.map((cube, i) => {
        // Frame-driven, never random: a decorative drift is held to the same
        // determinism as a stat.
        const phase = (frame / (cube.period * 30) + i * 0.37) * Math.PI * 2;
        const drift = Math.sin(phase) * 26;
        const rock = Math.cos(phase) * 3;

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${cube.x}%`,
              top: `${cube.y}%`,
              width: cube.size,
              height: cube.size,
              // The corner radius a wooden cube actually has, at this size.
              borderRadius: cube.size * 0.14,
              backgroundColor: withAlpha(i % 2 === 0 ? color.accent : color.accentAlt, cube.opacity),
              transform: `translateY(${drift}px) rotate(${cube.tilt + rock}deg)`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/* -------------------------------------------------------------------------- */
/* Blueprint: a drafting grid                                                  */
/* -------------------------------------------------------------------------- */

/** Fine grid, and the heavier rule every fifth line. */
const GRID_FINE = 54;
const GRID_COARSE = GRID_FINE * 5;

/**
 * A drafting sheet sliding under the frame.
 *
 * Two grids at a five-to-one ratio, the way squared paper and a drawing board
 * both work, plus a pair of measurement rules with ticks along them. It travels
 * diagonally and slowly: a plan being pulled across a table rather than a
 * pattern scrolling.
 *
 * The ticks are what make it a *drawing* rather than graph paper. Somebody
 * measured something here.
 */
const DraftingGrid: React.FC = () => {
  const { color } = useTheme();
  const x = useTileDrift(GRID_COARSE, 1100);
  const y = useTileDrift(GRID_COARSE, 780);

  const fine = withAlpha(color.ink, 0.07);
  const coarse = withAlpha(color.accent, 0.16);

  return (
    <AbsoluteFill aria-hidden style={{ overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: -BLEED,
          transform: `translate(${-x}px, ${y}px)`,
          backgroundImage: [
            `repeating-linear-gradient(0deg, ${coarse} 0 1px, transparent 1px ${GRID_COARSE}px)`,
            `repeating-linear-gradient(90deg, ${coarse} 0 1px, transparent 1px ${GRID_COARSE}px)`,
            `repeating-linear-gradient(0deg, ${fine} 0 1px, transparent 1px ${GRID_FINE}px)`,
            `repeating-linear-gradient(90deg, ${fine} 0 1px, transparent 1px ${GRID_FINE}px)`,
          ].join(', '),
        }}
      />
      {/* Two rules with ticks, one down each margin, drifting against the grid
          so the sheet has a near and a far layer. */}
      {[72, VIDEO.width - 72].map((left, i) => (
        <svg
          key={left}
          width={22}
          height={VIDEO.height + GRID_COARSE * 2}
          style={{
            position: 'absolute',
            left: left - 11,
            top: -GRID_COARSE,
            transform: `translateY(${i === 0 ? y * 2 : -y * 2}px)`,
          }}
        >
          <line
            x1={11}
            y1={0}
            x2={11}
            y2={VIDEO.height + GRID_COARSE * 2}
            stroke={withAlpha(color.accent, 0.3)}
            strokeWidth={1}
          />
          {Array.from(
            { length: Math.ceil((VIDEO.height + GRID_COARSE * 2) / GRID_FINE) },
            (_, tick) => (
              <line
                key={tick}
                x1={tick % 5 === 0 ? 0 : 6}
                y1={tick * GRID_FINE}
                x2={tick % 5 === 0 ? 22 : 16}
                y2={tick * GRID_FINE}
                stroke={withAlpha(color.accent, tick % 5 === 0 ? 0.32 : 0.16)}
                strokeWidth={1}
              />
            ),
          )}
        </svg>
      ))}
    </AbsoluteFill>
  );
};

/* -------------------------------------------------------------------------- */
/* Meeple: the pieces themselves                                               */
/* -------------------------------------------------------------------------- */

/**
 * The meeple outline, in a 100x100 box.
 *
 * Head as a circle and body as a polygon rather than one traced path: the shape
 * is recognisable from its proportions — wide shoulders, a notch between the
 * legs — and two primitives get there without a curve nobody can adjust later.
 */
const MEEPLE_BODY =
  '50,34 62,44 88,54 88,68 66,64 70,96 56,96 50,80 44,96 30,96 34,64 12,68 12,54 38,44';

/** Position, size, tilt and period. Spread wide of the middle, like the cubes. */
const MEEPLES = [
  { x: -4, y: 6, size: 300, tilt: -14, period: 33, opacity: 0.15 },
  { x: 74, y: 1, size: 230, tilt: 11, period: 41, opacity: 0.13 },
  { x: 78, y: 70, size: 340, tilt: -7, period: 37, opacity: 0.14 },
  { x: -10, y: 64, size: 260, tilt: 16, period: 27, opacity: 0.12 },
  { x: 62, y: 38, size: 130, tilt: 24, period: 21, opacity: 0.1 },
  { x: 8, y: 34, size: 110, tilt: -20, period: 17, opacity: 0.09 },
] as const;

/**
 * Meeples drifting behind the content.
 *
 * The one piece that says "board game" without naming a game — and the only
 * component in the box shaped like a person, which is why this theme is the
 * warm one. Same arrangement as Neon Night's cubes: three depths, clear of the
 * middle where the number sits, always there rather than entering on the cut.
 */
const MeepleField: React.FC = () => {
  const frame = useCurrentFrame();
  const { color } = useTheme();

  return (
    <AbsoluteFill aria-hidden style={{ overflow: 'hidden' }}>
      {MEEPLES.map((meeple, i) => {
        const phase = (frame / (meeple.period * 30) + i * 0.41) * Math.PI * 2;
        const drift = Math.sin(phase) * 30;
        const rock = Math.cos(phase) * 4;
        const fill = withAlpha(i % 2 === 0 ? color.accent : color.accentAlt, meeple.opacity);

        return (
          <svg
            key={i}
            width={meeple.size}
            height={meeple.size}
            viewBox="0 0 100 100"
            style={{
              position: 'absolute',
              left: `${meeple.x}%`,
              top: `${meeple.y}%`,
              transform: `translateY(${drift}px) rotate(${meeple.tilt + rock}deg)`,
            }}
          >
            <circle cx={50} cy={20} r={16} fill={fill} />
            <polygon points={MEEPLE_BODY} fill={fill} />
          </svg>
        );
      })}
    </AbsoluteFill>
  );
};

/* -------------------------------------------------------------------------- */
/* Dispatch                                                                    */
/* -------------------------------------------------------------------------- */

/** The full-frame part of a signature, drawn behind slide content. */
const BACKDROPS: Partial<Record<SignatureId, React.FC>> = {
  diecut: SprueField,
  tally: RuledLines,
  lamp: LampPool,
  dice: FeltNap,
  tiles: TileField,
  pegs: PegTracks,
  cubes: CubeField,
  grid: DraftingGrid,
  meeples: MeepleField,
};

/**
 * The signatures that draw a full-frame backdrop.
 *
 * A map rather than a chain of ifs, so the set is a value a test can read.
 * Every starter's signature has to be in it: the point of a signature is that
 * the ground is recognisably this theme's, and one that fell through to `null`
 * would leave a theme sitting on a flat colour with only the ambient fields
 * moving — which is what Punchboard did until it got its sprue field.
 */
export const BACKDROP_SIGNATURES: ReadonlySet<SignatureId> = new Set(
  Object.keys(BACKDROPS) as SignatureId[],
);

export const SignatureBackdrop: React.FC = () => {
  const Component = BACKDROPS[useTheme().signature];
  return Component ? <Component /> : null;
};

/**
 * Wraps a stat so it carries the theme's signature treatment.
 *
 * Only Punchboard changes the box a stat sits in; the other two signatures act
 * on the ground or on the number itself, so this is a pass-through for them.
 */
export const SignaturePlate: React.FC<{ children: React.ReactNode; delay?: number }> = ({
  children,
  delay = 0,
}) => {
  const { signature } = useTheme();
  if (signature === 'diecut') return <DieCut delay={delay}>{children}</DieCut>;
  return <>{children}</>;
};

/**
 * The way this theme draws a count, or null if it does not draw one.
 *
 * Four of the six starters answer "how many" with something drawn as well as a
 * figure. A slide asks once and renders `<CountMarks>`; it never needs to know
 * which theme is on.
 */
export const useCountMarks = (): CountSignature | null => {
  const { signature } = useTheme();
  return (COUNT_SIGNATURES as SignatureId[]).includes(signature)
    ? (signature as CountSignature)
    : null;
};

/**
 * The theme's own mark, **excluding the tally**.
 *
 * The plays slide draws stripes in every theme, so a second slide drawing them
 * again is the same picture twice for one fact and a different fact. Scorepad
 * simply has no mark away from the plays slide; the other three do, and that is
 * where they are told apart.
 */
export const useThemeMark = (): CountSignature | null => {
  const kind = useCountMarks();
  return kind === 'tally' ? null : kind;
};

/** The theme's own mark, drawn. Nothing at all for a theme whose mark is the tally. */
export const ThemeMarks: React.FC<CountMarksProps> = (props) => {
  const kind = useThemeMark();
  if (kind === 'dice') return <DiceMarks {...props} />;
  if (kind === 'tiles') return <TileMarks {...props} />;
  if (kind === 'pegs') return <PegMarks {...props} />;
  return null;
};

/** Whichever counting mark the current theme uses. */
export const CountMarks: React.FC<CountMarksProps> = (props) => {
  const kind = useCountMarks();
  if (kind === 'tally') return <TallyMarks {...props} />;
  if (kind === 'dice') return <DiceMarks {...props} />;
  if (kind === 'tiles') return <TileMarks {...props} />;
  if (kind === 'pegs') return <PegMarks {...props} />;
  return null;
};
