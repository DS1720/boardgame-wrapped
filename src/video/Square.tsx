import { AbsoluteFill } from 'remotion';
import type { Track } from '@/shared/audio';
import { formatNumber } from '@/shared/format';
import { superlativeFor } from '@/stats/superlative';
import type { WrappedStats } from '@/stats/types';
import { FontLoader, ThemeProvider, useFont, useTheme, useTypeScale } from '@/theme/ThemeContext';
import { themeFromBoxArt } from '@/theme/generate';
import { DEFAULT_THEME } from '@/theme/starters';
import type { Theme } from '@/theme/types';
import { Ambient } from './Ambient';
import { BoxArt } from './BoxArt';
import { VIDEO } from './config';
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
  const { caption, body, display } = useTypeScale();

  const topFive = stats.stats.find((s) => s.id === 'topFive');
  const games = topFive?.id === 'topFive' ? topFive.games.slice(0, 6) : [];
  const totals = stats.stats.find((s) => s.id === 'totalPlays');
  const superlative = superlativeFor(stats);

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
          gap: 26,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p
            style={{
              ...displayFont,
              // Smaller than the video's display step: this frame is square and
              // has to hold a grid as well as a name.
              fontSize: display * 0.3,
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
              fontSize: display * 0.34,
              color: theme.color.ink,
              margin: 0,
              lineHeight: 1.02,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {stats.playerName}
          </h1>
          {totals?.id === 'totalPlays' && (
            <p style={{ ...bodyFont, fontSize: body * 0.8, color: theme.color.inkMuted, margin: 0 }}>
              {formatNumber(totals.plays)} plays · {formatNumber(totals.distinctGames)} games ·{' '}
              {formatNumber(totals.nights)} nights
            </p>
          )}
          {superlative && (
            <p style={{ ...bodyFont, fontSize: body * 0.8, color: theme.color.accent, margin: 0 }}>
              {superlative.line}
            </p>
          )}
        </div>

        {games.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {games.map((game) => (
              <div key={game.gameId} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <BoxArt
                  entry={boxArtFor(manifest, game.gameId)}
                  name={game.name}
                  width={288}
                  height={288}
                />
                <span
                  style={{
                    ...bodyFont,
                    fontSize: caption * 0.86,
                    color: theme.color.ink,
                    lineHeight: 1.18,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {game.name}
                </span>
                <span style={{ ...utilityFont, fontSize: caption * 0.8, color: theme.color.accent }}>
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
