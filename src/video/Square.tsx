import { AbsoluteFill } from 'remotion';
import type { Track } from '@/shared/audio';
import { formatNumber } from '@/shared/format';
import { outroFactFor } from '@/stats/outroFact';
import { superlativeFor } from '@/stats/superlative';
import type { WrappedStats } from '@/stats/types';
import { FontLoader, ThemeProvider, useFont, useTheme } from '@/theme/ThemeContext';
import { themeFromBoxArt } from '@/theme/generate';
import { DEFAULT_THEME } from '@/theme/starters';
import type { Theme } from '@/theme/types';
import { Ambient } from './Ambient';
import { BoxArt } from './BoxArt';
import { VIDEO } from './config';
import { measureFor } from './measure';
import { fitBlock } from './slides/layout';
import { Texture, Vignette } from './Texture';
import { boxArtFor, useBoxArtManifest } from './useBoxArt';

/**
 * The shareable square.
 *
 * A 1080x1080 still rendered beside the MP4, for the places a 9:16 video does
 * not go — a group chat, a post, a message. It is the outro's content laid out
 * for a square rather than a second design: same theme, same six covers, same
 * superlative.
 *
 * Deliberately still. A video needs to be watched; this needs to be glanced at.
 */
export const SQUARE = { width: 1080, height: 1080, margin: 84 } as const;

/**
 * Type sizes for the square, in px, fixed rather than taken from the theme.
 *
 * The square used to size itself from the theme's four-step scale — `display *
 * 0.3` for the range, `display * 0.34` for the name. That works while every
 * theme's display step is around 300; Neon Night's is 340 and its body step 46,
 * which pushed the card 240px past its own frame. The name was cut off at the
 * top and the bottom row of covers lost its titles.
 *
 * A 1080 square is a fixed canvas, so its type is fixed too. The theme still
 * shows through in the faces and the colours, which is what a theme is for.
 */
const SQUARE_TYPE = {
  range: 56,
  /** Ceiling. A long name is fitted down from here. */
  name: 100,
  totals: 30,
  fact: 27,
  superlative: 29,
  gameName: 26,
  gameCount: 24,
} as const;

const SQUARE_GRID = { cols: 3, rows: 2, gap: 16 } as const;
const SQUARE_GAPS = { headerLine: 6, headerToGrid: 24, tile: 6, tileCount: 4 } as const;
const GAME_NAME_LINES = 2;
const GAME_NAME_LINE_HEIGHT = 1.18;

/** Never smaller than this, or the covers stop being the point of the card. */
const MIN_COVER = 150;

export interface SquareLayout {
  /** Width and height of the content box, inside the margin. */
  available: number;
  /** Column width in the cover grid. */
  column: number;
  /** Side of one cover. Derived from what the header leaves, never assumed. */
  cover: number;
  /** Total height the card will occupy. */
  height: number;
}

/**
 * Work out the cover size from the space the header actually leaves.
 *
 * Derived rather than tuned: the header is three to five lines depending on
 * whether this player earned a fourth fact and a superlative, and a fixed cover
 * size that fits the five-line case wastes the three-line one — while one tuned
 * for three lines overflows on five. This is the arithmetic, and
 * [Square.test.ts](src/video/__tests__/square.test.ts) checks that every
 * combination fits inside the frame.
 */
export const squareLayout = (lines: {
  hasTotals: boolean;
  hasFact: boolean;
  hasSuperlative: boolean;
  hasGames: boolean;
}): SquareLayout => {
  const available = SQUARE.height - SQUARE.margin * 2;
  const column =
    (available - SQUARE_GRID.gap * (SQUARE_GRID.cols - 1)) / SQUARE_GRID.cols;

  const headerLines = [
    SQUARE_TYPE.range,
    SQUARE_TYPE.name,
    ...(lines.hasTotals ? [SQUARE_TYPE.totals] : []),
    ...(lines.hasFact ? [SQUARE_TYPE.fact] : []),
    ...(lines.hasSuperlative ? [SQUARE_TYPE.superlative] : []),
  ];
  const header =
    headerLines.reduce((sum, line) => sum + line, 0) +
    SQUARE_GAPS.headerLine * (headerLines.length - 1);

  if (!lines.hasGames) return { available, column, cover: 0, height: header };

  // Everything in a tile that is not the cover.
  const tileText =
    SQUARE_GAPS.tile +
    SQUARE_TYPE.gameName * GAME_NAME_LINE_HEIGHT * GAME_NAME_LINES +
    SQUARE_GAPS.tileCount +
    SQUARE_TYPE.gameCount;

  const gridHeight = available - header - SQUARE_GAPS.headerToGrid;
  const row = (gridHeight - SQUARE_GRID.gap * (SQUARE_GRID.rows - 1)) / SQUARE_GRID.rows;
  // Never wider than its column and never below the floor — if the floor wins,
  // the card is over budget and the test says so rather than a viewer finding
  // out.
  const cover = Math.max(MIN_COVER, Math.min(column, row - tileText));

  const height =
    header +
    SQUARE_GAPS.headerToGrid +
    (cover + tileText) * SQUARE_GRID.rows +
    SQUARE_GRID.gap * (SQUARE_GRID.rows - 1);

  return { available, column, cover, height };
};

export interface SquareProps {
  stats?: WrappedStats | null;
  theme?: Theme | null;
  boxArtMode?: boolean;
  /** Accepted and ignored, so the same props object can drive both compositions. */
  track?: Track | null;
}

const SquareInner: React.FC<{ stats: WrappedStats }> = ({ stats }) => {
  const manifest = useBoxArtManifest();
  const theme = useTheme();
  const displayFont = useFont('display');
  const bodyFont = useFont('body');
  const utilityFont = useFont('utility');

  const topFive = stats.stats.find((s) => s.id === 'topFive');
  const games = topFive?.id === 'topFive' ? topFive.games.slice(0, 6) : [];
  const totals = stats.stats.find((s) => s.id === 'totalPlays');
  const fact = outroFactFor(stats);
  // The three numbers above, plus whatever the fact just said, are off the
  // table for the superlative: a distinction that restates something already
  // on the card is not a distinction.
  const superlative = superlativeFor(stats, {
    avoid: ['plays', 'games', 'nights', 'hours', fact?.quantity],
  });

  const layout = squareLayout({
    hasTotals: totals?.id === 'totalPlays',
    hasFact: fact !== null,
    hasSuperlative: superlative !== null,
    hasGames: games.length > 0,
  });
  // Measured in the face it will actually be set in, exactly as in the video.
  const nameSize = fitBlock({
    text: stats.playerName,
    ceiling: SQUARE_TYPE.name,
    maxLines: 1,
    measure: measureFor(theme.type.display),
    width: layout.available,
    floor: 40,
  });

  return (
    <AbsoluteFill style={{ backgroundColor: theme.color.bg }}>
      {/* The square gets one still frame of the same drift, so it belongs to
          the video it is rendered beside rather than looking like a flat card. */}
      <Ambient color={theme.color} />
      <Texture texture={theme.texture} color={theme.color} />
      <Vignette color={theme.color} />

      <AbsoluteFill
        style={{
          padding: SQUARE.margin,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: SQUARE_GAPS.headerToGrid,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: SQUARE_GAPS.headerLine }}>
          <p
            style={{
              ...displayFont,
              // Fixed, not scaled from the theme: see SQUARE_TYPE.
              fontSize: SQUARE_TYPE.range,
              color: theme.color.accent,
              margin: 0,
              lineHeight: 1,
            }}
          >
            {stats.rangeLabel}
          </p>
          <h1
            style={{
              ...displayFont,
              fontSize: nameSize,
              color: theme.color.ink,
              margin: 0,
              lineHeight: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {stats.playerName}
          </h1>
          {totals?.id === 'totalPlays' && (
            <p
              style={{
                ...bodyFont,
                fontSize: SQUARE_TYPE.totals,
                lineHeight: 1,
                color: theme.color.inkMuted,
                margin: 0,
              }}
            >
              {formatNumber(totals.plays)} plays · {formatNumber(totals.distinctGames)} games ·{' '}
              {formatNumber(totals.nights)} nights
            </p>
          )}
          {/* The square is the outro as a still, so it carries the same
              fourth fact. Two cards claiming different things about one year
              is worse than either. */}
          {fact && (
            <p
              style={{
                ...bodyFont,
                fontSize: SQUARE_TYPE.fact,
                lineHeight: 1,
                color: theme.color.inkMuted,
                margin: 0,
              }}
            >
              {fact.line}
            </p>
          )}
          {superlative && (
            <p
              style={{
                ...bodyFont,
                fontSize: SQUARE_TYPE.superlative,
                lineHeight: 1,
                color: theme.color.accent,
                margin: 0,
              }}
            >
              {superlative.line}
            </p>
          )}
        </div>

        {games.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(' + SQUARE_GRID.cols + ', 1fr)',
              gap: SQUARE_GRID.gap,
            }}
          >
            {games.map((game) => (
              <div
                key={game.gameId}
                style={{ display: 'flex', flexDirection: 'column', gap: SQUARE_GAPS.tile }}
              >
                <BoxArt
                  entry={boxArtFor(manifest, game.gameId)}
                  name={game.name}
                  width={layout.cover}
                  height={layout.cover}
                />
                {/* Exactly the two lines the layout budgeted for, reserved
                    whether the title needs them or not. A third line would come
                    out of the row below, which is the row that used to fall off
                    the bottom of the card. */}
                <span
                  style={{
                    ...bodyFont,
                    fontSize: SQUARE_TYPE.gameName,
                    color: theme.color.ink,
                    lineHeight: GAME_NAME_LINE_HEIGHT,
                    height: SQUARE_TYPE.gameName * GAME_NAME_LINE_HEIGHT * GAME_NAME_LINES,
                    display: '-webkit-box',
                    WebkitLineClamp: GAME_NAME_LINES,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {game.name}
                </span>
                <span
                  style={{
                    ...utilityFont,
                    fontSize: SQUARE_TYPE.gameCount,
                    lineHeight: 1,
                    marginTop: SQUARE_GAPS.tileCount - SQUARE_GAPS.tile,
                    color: theme.color.accent,
                  }}
                >
                  {formatNumber(game.plays)}×
                </span>
              </div>
            ))}
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const Square: React.FC<SquareProps> = ({ stats = null, theme = null, boxArtMode = false }) => {
  const base = theme ?? DEFAULT_THEME;
  const manifest = useBoxArtManifest();

  const topGame = stats?.stats.find((s) => s.id === 'topGame');
  const dominant = topGame?.id === 'topGame' ? boxArtFor(manifest, topGame.game.gameId)?.dominant : null;
  const resolved = boxArtMode ? themeFromBoxArt(base, dominant) : base;

  return (
    <ThemeProvider theme={resolved}>
      <FontLoader theme={resolved}>
        {stats ? (
          <SquareInner stats={stats} />
        ) : (
          <AbsoluteFill style={{ backgroundColor: resolved.color.bg, padding: VIDEO.safeMargin }} />
        )}
      </FontLoader>
    </ThemeProvider>
  );
};
