import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { withAlpha } from '@/theme/color';
import { useFont, useTheme, useTypeScale } from '@/theme/ThemeContext';
import { useMotionSpring } from '../motion';
import { markStep } from '../signature';

/**
 * Per-slide detail animations.
 *
 * These are not signatures — a signature belongs to a theme and appears on
 * every slide. Each of these belongs to one *stat* and appears wherever that
 * stat does, in whatever theme is on. The rule they are all written to: the
 * drawing has to be about the number underneath it. A shape that would fit any
 * slide equally well is decoration, and decoration is what makes a video look
 * assembled rather than made.
 *
 * All of them are frame-driven and take their colours from theme tokens, so a
 * render is reproducible and no slide carries a literal hex.
 */

/* -------------------------------------------------------------------------- */
/* Win rate: two stacks of chips                                               */
/* -------------------------------------------------------------------------- */

/** Tallest either stack is allowed to get, so the pair always fits the frame. */
const MAX_CHIPS = 9;

/** Frames one chip takes to fall and settle. */
const CHIP_DROP_FRAMES = 5;

/**
 * How many chips stand for a count, and what one chip is worth.
 *
 * Both columns are scaled by the *same* unit — that is the whole point. Scaling
 * each to its own height would make 61 wins and 161 losses look like the same
 * pile, which is the one thing this drawing exists to contradict.
 */
export const chipScale = (
  wins: number,
  losses: number,
): { unit: number; winChips: number; lossChips: number } => {
  const most = Math.max(wins, losses);
  if (most <= 0) return { unit: 1, winChips: 0, lossChips: 0 };

  const unit = Math.max(1, Math.ceil(most / MAX_CHIPS));
  // A column with any plays in it never rounds away to nothing: "you won some"
  // and "you won none" have to look different.
  const chips = (n: number) => (n > 0 ? Math.max(1, Math.round(n / unit)) : 0);
  return { unit, winChips: chips(wins), lossChips: chips(losses) };
};

/**
 * Wins and losses as two stacks of chips, dropped in one at a time.
 *
 * A bar states the ratio; two stacks let you see it — which is worth more on
 * the one slide whose subject is a comparison. Both stacks fill together, so
 * the shorter one visibly stops while the other keeps going.
 */
export const ChipStacks: React.FC<{
  wins: number;
  losses: number;
  delay?: number;
  windowFrames?: number;
  /** Label under the left stack. Co-op years call these something else. */
  wonLabel?: string;
  lostLabel?: string;
}> = ({
  wins,
  losses,
  delay = 0,
  windowFrames = 46,
  wonLabel = 'won',
  lostLabel = 'lost',
}) => {
  const frame = useCurrentFrame();
  const { color } = useTheme();
  const utility = useFont('utility');
  const { caption } = useTypeScale();

  const { unit, winChips, lossChips } = chipScale(wins, losses);
  const tallest = Math.max(winChips, lossChips, 1);
  const step = markStep(tallest, windowFrames, CHIP_DROP_FRAMES);

  const chipW = 168;
  const chipH = 32;
  const overlap = 19;

  const stack = (count: number, fill: string) => (
    <div style={{ position: 'relative', width: chipW, height: tallest * overlap + chipH }}>
      {Array.from({ length: count }, (_, i) => {
        const landed = interpolate(
          frame - delay - i * step,
          [0, CHIP_DROP_FRAMES],
          [0, 1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        );
        if (landed <= 0) return null;

        // Chips are placed by hand, not machined: a couple of pixels of lean
        // from the index, so the stack is not a perfect column.
        const lean = ((i * 37) % 5) - 2;
        const drop = (1 - landed) * -70;

        return (
          <svg
            key={i}
            width={chipW}
            height={chipH * 2}
            viewBox="0 0 132 56"
            aria-hidden
            style={{
              position: 'absolute',
              left: lean,
              bottom: i * overlap + drop,
              opacity: landed,
            }}
          >
            {/* The edge of the chip, then its face: a disc seen near-on. */}
            <ellipse cx={66} cy={30} rx={64} ry={17} fill={withAlpha(color.ink, 0.35)} />
            <ellipse cx={66} cy={24} rx={64} ry={17} fill={fill} />
            <ellipse
              cx={66}
              cy={24}
              rx={44}
              ry={10}
              fill="none"
              stroke={withAlpha(color.bg, 0.45)}
              strokeWidth={3}
            />
          </svg>
        );
      })}
    </div>
  );

  const label = (text: string, tone: string) => (
    <p style={{ ...utility, fontSize: caption * 0.9, color: tone, margin: '10px 0 0' }}>{text}</p>
  );

  return (
    <div style={{ display: 'flex', gap: 46, alignItems: 'flex-end' }}>
      <div>
        {stack(winChips, color.accent)}
        {label(wonLabel, color.accent)}
      </div>
      <div>
        {stack(lossChips, withAlpha(color.ink, 0.34))}
        {label(lostLabel, color.inkMuted)}
      </div>
      <p
        style={{
          ...utility,
          fontSize: caption * 0.78,
          color: color.inkMuted,
          margin: 0,
          paddingBottom: 12,
        }}
      >
        {/* Said out loud, because a chip that silently means fourteen plays
            would be a chart with a hidden axis. */}
        one chip = {unit} {unit === 1 ? 'play' : 'plays'}
      </p>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Nemesis: the head-to-head                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The head-to-head record as one track, filled from both ends.
 *
 * Their wins push in from the left and yours from the right; where the two meet
 * is the record. A single bar showing only their share would be the same number
 * again in a different shape — the meeting point is what makes it a face-off.
 */
export const HeadToHead: React.FC<{
  theirName: string;
  theirWins: number;
  yourWins: number;
  delay?: number;
}> = ({ theirName, theirWins, yourWins, delay = 0 }) => {
  const { color } = useTheme();
  const utility = useFont('utility');
  const { caption } = useTypeScale();
  const progress = useMotionSpring(delay);

  const total = Math.max(1, theirWins + yourWins);
  const theirShare = (theirWins / total) * 100;
  // Both sides grow out of the middle, so the split arrives rather than being
  // there from the start.
  const filled = interpolate(progress, [0, 1], [50, theirShare], { extrapolateRight: 'clamp' });

  const end = (text: string, value: number, tone: string, align: 'flex-start' | 'flex-end') => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: align, gap: 4 }}>
      <span style={{ ...utility, fontSize: caption * 0.9, color: tone }}>{text}</span>
      <span style={{ ...utility, fontSize: caption * 1.15, color: tone }}>{value}</span>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
      <div
        style={{
          position: 'relative',
          height: 30,
          borderRadius: 15,
          backgroundColor: withAlpha(color.ink, 0.16),
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            right: `${100 - filled}%`,
            backgroundColor: color.accent,
          }}
        />
        {/* An even split, marked. Without it there is nothing to be ahead of. */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            bottom: 0,
            width: 2,
            backgroundColor: withAlpha(color.bg, 0.55),
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {end(theirName, theirWins, color.accent, 'flex-start')}
        {end('you', yourWins, color.inkMuted, 'flex-end')}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Top location: a pin, and the room around it                                 */
/* -------------------------------------------------------------------------- */

/** Seconds one ring takes to travel out and fade. */
const RING_PERIOD = 2.6;
const RINGS = 3;

/**
 * A pin dropped on the place, with rings going out from where it lands.
 *
 * The rings never stop, which is the point: this is the one slide about a place
 * rather than a moment, and a place is somewhere you keep going back to.
 */
export const PinDrop: React.FC<{ delay?: number; size?: number }> = ({ delay = 0, size = 360 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { color } = useTheme();
  const progress = useMotionSpring(delay);

  const drop = (1 - progress) * -120;
  // Lands with a little give, then holds its shape.
  const squash = 1 + Math.sin(Math.min(1, progress) * Math.PI) * 0.12;
  const landed = progress > 0.6;

  return (
    <svg width={size} height={size * 0.73} viewBox="0 0 260 190" aria-hidden>
      {landed &&
        Array.from({ length: RINGS }, (_, i) => {
          // Each ring is the same journey, started a third of a period apart.
          const t = (((frame - delay) / fps + (i * RING_PERIOD) / RINGS) % RING_PERIOD) / RING_PERIOD;
          return (
            <ellipse
              key={i}
              cx={130}
              cy={158}
              rx={18 + t * 108}
              ry={6 + t * 34}
              fill="none"
              stroke={color.accent}
              strokeWidth={3}
              opacity={(1 - t) * 0.65}
            />
          );
        })}

      {/* The ground shadow tightens as the pin arrives. */}
      <ellipse
        cx={130}
        cy={158}
        rx={26 - progress * 8}
        ry={8 - progress * 2.5}
        fill={withAlpha(color.ink, 0.28)}
      />

      <g transform={`translate(0 ${drop}) scale(1 ${squash})`} style={{ transformOrigin: '130px 158px' }}>
        <path
          d="M130 158 L112 106 A22 22 0 1 1 148 106 Z"
          fill={color.accent}
        />
        <circle cx={130} cy={92} r={9} fill={color.bg} />
      </g>
    </svg>
  );
};

/* -------------------------------------------------------------------------- */
/* Time played: one lap of the dial is one day                                 */
/* -------------------------------------------------------------------------- */

/** Frames the hand takes to run through the whole span. */
const SWEEP_FRAMES = 40;

/**
 * A clock whose hand laps once per day spent at the table.
 *
 * The caption already says "about 4.8 days"; this is that sentence as a
 * movement. A pip is dropped at the top of the dial for each full day the hand
 * gets through, so the count is left behind on the face rather than being a
 * spin you have to take on trust.
 */
export const DayClock: React.FC<{ minutes: number; delay?: number; size?: number }> = ({
  minutes,
  delay = 0,
  size = 190,
}) => {
  const frame = useCurrentFrame();
  const { color } = useTheme();

  const days = minutes / (60 * 24);
  const run = interpolate(frame - delay, [0, SWEEP_FRAMES], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const lapsRun = days * run;
  const angle = lapsRun * 360;
  const fullDays = Math.floor(lapsRun);

  const r = 46;
  const pips = Math.min(Math.floor(days), 12);

  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden>
      <circle cx={60} cy={60} r={r} fill="none" stroke={withAlpha(color.ink, 0.22)} strokeWidth={3} />

      {/* Quarter ticks, so a lap is legible as a lap. */}
      {[0, 90, 180, 270].map((deg) => (
        <line
          key={deg}
          x1={60}
          y1={60 - r + 3}
          x2={60}
          y2={60 - r + 11}
          stroke={withAlpha(color.ink, 0.34)}
          strokeWidth={3}
          transform={`rotate(${deg} 60 60)`}
        />
      ))}

      {/* One pip outside the dial per whole day completed. */}
      {Array.from({ length: pips }, (_, i) => (
        <circle
          key={i}
          cx={60}
          cy={60 - r - 8}
          r={3}
          fill={i < fullDays ? color.accent : withAlpha(color.ink, 0.18)}
          transform={`rotate(${(i - (pips - 1) / 2) * 15} 60 60)`}
        />
      ))}

      <g transform={`rotate(${angle} 60 60)`}>
        <line x1={60} y1={64} x2={60} y2={24} stroke={color.accent} strokeWidth={4} strokeLinecap="round" />
        {/* A counterweight, which is what stops it reading as an arrow. */}
        <line x1={60} y1={60} x2={60} y2={71} stroke={color.accent} strokeWidth={4} strokeLinecap="round" />
      </g>
      <circle cx={60} cy={60} r={5} fill={color.accent} />
    </svg>
  );
};

/* -------------------------------------------------------------------------- */
/* Night owl: a day, once round                                                */
/* -------------------------------------------------------------------------- */

/** The window `lateShare` actually counts: 22:00 through 04:00. */
const LATE_FROM = 22;
const LATE_TO = 4;

/** Where on the dial an hour sits. Midnight at the top, noon at the bottom. */
const hourAngle = (hour: number) => (hour / 24) * 360;

/**
 * The 24 hours of a day as a ring, with the hand swinging to the peak.
 *
 * The late band is shaded at exactly the hours the stat counts — 22:00 to
 * 04:00 — because the caption quotes a percentage for that window and a shaded
 * band that disagreed with it would be worse than no band at all.
 */
export const HourDial: React.FC<{ peakHour: number; delay?: number; size?: number }> = ({
  peakHour,
  delay = 0,
  size = 280,
}) => {
  const { color } = useTheme();
  const utility = useFont('utility');
  const progress = useMotionSpring(delay);

  const r = 54;
  const swing = interpolate(progress, [0, 1], [0, hourAngle(peakHour)], {
    extrapolateRight: 'clamp',
  });

  // The shaded band, as an arc path from 22:00 round through midnight to 04:00.
  const point = (hour: number, radius: number) => {
    const rad = ((hourAngle(hour) - 90) * Math.PI) / 180;
    return [75 + Math.cos(rad) * radius, 75 + Math.sin(rad) * radius];
  };
  const [ax, ay] = point(LATE_FROM, r);
  const [bx, by] = point(LATE_TO, r);

  return (
    <svg width={size} height={size} viewBox="0 0 150 150" aria-hidden>
      <circle cx={75} cy={75} r={r} fill="none" stroke={withAlpha(color.ink, 0.2)} strokeWidth={3} />

      {/* Late night, shaded. Six hours, so never the long way round. */}
      <path
        d={`M ${ax} ${ay} A ${r} ${r} 0 0 1 ${bx} ${by}`}
        fill="none"
        stroke={withAlpha(color.accent, 0.35)}
        strokeWidth={11}
        strokeLinecap="round"
      />

      {Array.from({ length: 24 }, (_, h) => {
        const long = h % 6 === 0;
        return (
          <line
            key={h}
            x1={75}
            y1={75 - r + 2}
            x2={75}
            y2={75 - r + (long ? 12 : 7)}
            stroke={withAlpha(color.ink, long ? 0.45 : 0.25)}
            strokeWidth={long ? 3 : 2}
            transform={`rotate(${hourAngle(h)} 75 75)`}
          />
        );
      })}

      {[0, 6, 12, 18].map((h) => {
        const [lx, ly] = point(h, r - 22);
        return (
          <text
            key={h}
            x={lx}
            y={ly + 4}
            textAnchor="middle"
            style={{ ...utility, fontSize: 10, fill: color.inkMuted } as React.CSSProperties}
          >
            {h}
          </text>
        );
      })}

      <g transform={`rotate(${swing} 75 75)`}>
        <line
          x1={75}
          y1={75}
          x2={75}
          y2={75 - r + 6}
          stroke={color.accent}
          strokeWidth={4}
          strokeLinecap="round"
        />
        <circle cx={75} cy={75 - r + 6} r={6} fill={color.accent} />
      </g>
      <circle cx={75} cy={75} r={5} fill={color.ink} />
    </svg>
  );
};

/* -------------------------------------------------------------------------- */
/* Intro: the table gets set                                                   */
/* -------------------------------------------------------------------------- */

/** Cards in the opening fan. Enough to read as a hand, few enough to see each one. */
const HAND = 7;

/** Frames one card takes to arrive. */
const DEAL_FRAMES = 4;

/**
 * A hand fanned out under the title card.
 *
 * "A year at the table" starts the way every one of these evenings starts, so
 * the intro deals. The cards keep a slow fan-breathe afterwards rather than
 * freezing, because this is the one card in the video with no number on it to
 * hold the eye.
 */
export const DealtHand: React.FC<{ delay?: number; width?: number }> = ({
  delay = 0,
  width = 470,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { color } = useTheme();

  // The pivot sits below the cards, so they swing out around a hand rather
  // than rotating on the spot. The further down it is, the wider the fan opens.
  const pivotX = 260;
  const pivotY = 208;

  return (
    <svg width={width} height={width * 0.44} viewBox="0 0 520 228" aria-hidden>
      {Array.from({ length: HAND }, (_, i) => {
        const dealt = interpolate(frame - delay - i * DEAL_FRAMES, [0, DEAL_FRAMES * 2], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        if (dealt <= 0) return null;

        // The fan opens as the cards land, then breathes a degree or two.
        const spread = (i - (HAND - 1) / 2) * 16;
        const breathe = Math.sin((frame - delay) / fps / 5 + i * 0.4) * 1.2;
        const angle = spread * dealt + breathe;
        // Each card slides in from the left, where the deck would be sitting.
        const travel = (1 - dealt) * -140;

        return (
          <g
            key={i}
            transform={`translate(${travel} ${(1 - dealt) * 26}) rotate(${angle} ${pivotX} ${pivotY})`}
            opacity={dealt}
          >
            <rect
              x={pivotX - 33}
              y={36}
              width={66}
              height={96}
              rx={8}
              fill={color.surface}
              stroke={withAlpha(color.ink, 0.5)}
              strokeWidth={2.5}
            />
            {/*
              The pip sits at the top-left corner, not the middle. In a fan the
              only part of every card but the last that stays visible is its
              leading edge — centred pips left six blank slivers and one card.
            */}
            <circle
              cx={pivotX - 18}
              cy={56}
              r={7.5}
              fill={i % 2 === 0 ? color.accent : color.accentAlt}
            />
          </g>
        );
      })}
    </svg>
  );
};

/* -------------------------------------------------------------------------- */
/* Co-players: the table fills up                                              */
/* -------------------------------------------------------------------------- */

/** Frames one person takes to arrive. */
const SEAT_FRAMES = 4;

/**
 * The people, as people.
 *
 * This slide used to borrow whichever counting mark the theme owned, which on
 * Scorepad meant the same stripes the plays slide had already drawn. A count of
 * *people* has a shape of its own, and drawing the stripes twice twenty seconds
 * apart made two different facts look like the same one.
 */
export const Crowd: React.FC<{
  count: number;
  delay?: number;
  max?: number;
  windowFrames?: number;
}> = ({ count, delay = 0, max = 24, windowFrames = 46 }) => {
  const frame = useCurrentFrame();
  const { color } = useTheme();
  const shown = Math.min(count, max);
  const step = markStep(shown, windowFrames, SEAT_FRAMES);
  const size = 46;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, maxWidth: 8 * (size + 12) }}>
      {Array.from({ length: shown }, (_, i) => {
        const arrived = interpolate(frame - delay - i * step, [0, SEAT_FRAMES], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        if (arrived <= 0) return null;

        // They arrive from below, the way someone pulls up a chair.
        const rise = (1 - arrived) * 20;
        // Every fourth figure takes the accent, so the group has a rhythm
        // rather than being one solid block of the same colour.
        const tone = i % 4 === 0 ? color.accent : withAlpha(color.ink, 0.42);

        return (
          <svg
            key={i}
            width={size}
            height={size}
            viewBox="0 0 32 32"
            aria-hidden
            style={{ transform: `translateY(${rise}px)`, opacity: arrived }}
          >
            <circle cx={16} cy={9} r={6.5} fill={tone} />
            <path d="M4 30 a12 12 0 0 1 24 0 Z" fill={tone} />
          </svg>
        );
      })}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Win streak: the run, link by link                                           */
/* -------------------------------------------------------------------------- */

/** Frames one win in the run takes to light. */
const LINK_FRAMES = 4;

/**
 * The streak as a chain, drawn left to right.
 *
 * The line between two wins is drawn as the second one lights, so the run reads
 * as consecutive rather than as a row of separate wins. That connection is the
 * whole claim the slide makes — four wins scattered across a year is not a
 * streak, and this has to look like the difference.
 */
export const StreakChain: React.FC<{
  length: number;
  delay?: number;
  max?: number;
  windowFrames?: number;
}> = ({ length, delay = 0, max = 12, windowFrames = 46 }) => {
  const frame = useCurrentFrame();
  const { color } = useTheme();
  const shown = Math.min(length, max);
  const step = markStep(shown, windowFrames, LINK_FRAMES);
  const pitch = 62;
  const r = 20;
  const width = Math.max(pitch, (shown - 1) * pitch + r * 2 + 8);

  return (
    <svg width={width} height={56} viewBox={`0 0 ${width} 56`} aria-hidden>
      {Array.from({ length: shown }, (_, i) => {
        const lit = interpolate(frame - delay - i * step, [0, LINK_FRAMES], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        if (lit <= 0) return null;
        const cx = r + 4 + i * pitch;

        return (
          <g key={i}>
            {/* The link back to the previous win, drawn as this one arrives. */}
            {i > 0 && (
              <line
                x1={cx - pitch + r}
                y1={28}
                x2={cx - pitch + r + (pitch - r * 2) * lit}
                y2={28}
                stroke={color.accent}
                strokeWidth={5}
                strokeLinecap="round"
              />
            )}
            <circle cx={cx} cy={28} r={r * (0.75 + lit * 0.25)} fill={color.accent} opacity={lit} />
            {/* A tick, so the run reads as wins rather than beads. */}
            <path
              d={`M ${cx - 8} 28 l 5 6 l 11 -12`}
              fill="none"
              stroke={color.bg}
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={lit}
            />
          </g>
        );
      })}
    </svg>
  );
};

/* -------------------------------------------------------------------------- */
/* Worst game: the plays, one at a time                                        */
/* -------------------------------------------------------------------------- */

/** Frames one result takes to turn over. */
const RESULT_FRAMES = 4;

/**
 * Every play of the game, as a won or lost marker.
 *
 * "0% in 10 plays" is a fact you read; ten hollow rings in a row is the same
 * fact you can count. The wins are spread evenly through the row rather than
 * bunched at the front, because **which** plays were won is not in the stat —
 * putting them all at one end would invent a run that may never have happened.
 */
export const ResultRow: React.FC<{
  ratio: number;
  plays: number;
  delay?: number;
  max?: number;
  windowFrames?: number;
}> = ({ ratio, plays, delay = 0, max = 18, windowFrames = 46 }) => {
  const frame = useCurrentFrame();
  const { color } = useTheme();

  const shown = Math.min(plays, max);
  const wins = Math.round(ratio * shown);
  const step = markStep(shown, windowFrames, RESULT_FRAMES);
  const size = 40;
  // Every nth marker is a win, spaced across the whole row.
  const every = wins > 0 ? shown / wins : 0;

  return (
    // Ten to a row: a ten-play record is the common case and 9 + 1 left an
    // orphan on its own line.
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, maxWidth: 10 * (size + 10) }}>
      {Array.from({ length: shown }, (_, i) => {
        const turned = interpolate(frame - delay - i * step, [0, RESULT_FRAMES], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        if (turned <= 0) return null;

        const won = every > 0 && Math.floor(i / every) !== Math.floor((i - 1) / every) && i > 0
          ? true
          : every > 0 && i === 0;

        return (
          <svg
            key={i}
            width={size}
            height={size}
            viewBox="0 0 32 32"
            aria-hidden
            // Turns over as it arrives, like a card being flipped face up.
            style={{ transform: `scaleX(${Math.abs(Math.cos((1 - turned) * Math.PI))})` }}
          >
            <circle
              cx={16}
              cy={16}
              r={13}
              fill={won ? color.accent : 'none'}
              stroke={won ? color.accent : withAlpha(color.ink, 0.4)}
              strokeWidth={3}
            />
          </svg>
        );
      })}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Busiest day: one day, stacked up                                            */
/* -------------------------------------------------------------------------- */

/** Frames one play takes to land on the pile. */
const STACK_FRAMES = 4;

/**
 * The day's plays as boxes stacked on a table.
 *
 * Every other count in the video is spread across a year; this one happened
 * between breakfast and bed, so it piles up instead of spreading out. The boxes
 * lean further the higher they go, which is what a real stack of fourteen
 * games does and what stops it reading as a bar chart.
 */
export const DayStack: React.FC<{
  plays: number;
  delay?: number;
  max?: number;
  windowFrames?: number;
}> = ({ plays, delay = 0, max = 14, windowFrames = 46 }) => {
  const frame = useCurrentFrame();
  const { color } = useTheme();
  const shown = Math.min(plays, max);
  const step = markStep(shown, windowFrames, STACK_FRAMES);

  const w = 230;
  const h = 26;
  const gap = 4;

  return (
    <div style={{ position: 'relative', width: w + 46, height: shown * (h + gap) + 18 }}>
      {Array.from({ length: shown }, (_, i) => {
        const landed = interpolate(frame - delay - i * step, [0, STACK_FRAMES], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        if (landed <= 0) return null;

        // Deterministic lean, growing with height.
        const lean = (((i * 53) % 7) - 3) * (0.4 + i * 0.12);
        const drop = (1 - landed) * -90;

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 23 + lean,
              bottom: i * (h + gap) + drop,
              width: w,
              height: h,
              borderRadius: 5,
              backgroundColor: i % 3 === 0 ? color.accent : withAlpha(color.ink, 0.3),
              boxShadow: `0 2px 0 ${withAlpha(color.ink, 0.28)}`,
              opacity: landed,
              transform: `rotate(${lean * 0.22}deg)`,
            }}
          />
        );
      })}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* First and last: the calendar comes off the wall                             */
/* -------------------------------------------------------------------------- */

/** Frames the whole span takes to tear through. */
const TEAR_FRAMES = 44;

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * A calendar tearing its pages off, from the first play's month to the last.
 *
 * The months on the sheet are the real ones, so the number of pages that fly is
 * the length of the span rather than a fixed flourish: a year that ran January
 * to March tears three, not twelve. That is the difference between a drawing of
 * this stat and a drawing of a calendar.
 */
export const CalendarTear: React.FC<{
  fromMonth: number;
  toMonth: number;
  delay?: number;
  size?: number;
}> = ({ fromMonth, toMonth, delay = 0, size = 210 }) => {
  const frame = useCurrentFrame();
  const { color } = useTheme();
  const utility = useFont('utility');

  // Inclusive, and never fewer than the one page there is to show.
  const span = Math.max(1, toMonth - fromMonth + 1);
  const run = interpolate(frame - delay, [0, TEAR_FRAMES], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const reached = run * (span - 1);
  const torn = Math.min(span - 1, Math.floor(reached));
  // How far through tearing the current page we are, for the one in flight.
  const within = span > 1 && torn < span - 1 ? reached - torn : 0;

  const page = (month: number, fly: number) => (
    <g transform={`translate(${fly * 52} ${-fly * 76}) rotate(${fly * 24} 60 56)`} opacity={1 - fly}>
      <rect
        x={10}
        y={20}
        width={100}
        height={76}
        rx={6}
        fill={color.surface}
        stroke={withAlpha(color.ink, 0.3)}
        strokeWidth={2}
      />
      <text
        x={60}
        y={70}
        textAnchor="middle"
        style={{ ...utility, fontSize: 26, fill: color.ink } as React.CSSProperties}
      >
        {MONTHS[((month % 12) + 12) % 12]}
      </text>
    </g>
  );

  return (
    <svg width={size} height={size * 0.72} viewBox="0 0 120 108" aria-hidden>
      {/* The board the pad hangs on, and its binding rings. */}
      <rect x={4} y={12} width={112} height={90} rx={8} fill={withAlpha(color.ink, 0.14)} />
      {[28, 60, 92].map((x) => (
        <circle key={x} cx={x} cy={18} r={3} fill={withAlpha(color.ink, 0.42)} />
      ))}

      {/* The page underneath, waiting its turn. */}
      {torn + 1 < span && page(fromMonth + torn + 1, 0)}
      {/* The page coming off. */}
      {page(fromMonth + torn, within)}
    </svg>
  );
};
