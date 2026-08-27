import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { formatNumber } from '@/shared/format';
import { withAlpha } from '@/theme/color';
import { useFont, useTheme, useTypeScale } from '@/theme/ThemeContext';
import { BoxArt } from '../BoxArt';
import { boxArtFor, useBoxArtManifest } from '../useBoxArt';
import { Eyebrow, Headline, SafeArea, Stack } from './layout';
import type { SlideProps } from './Slides';

/**
 * The top five, counted down from five to one.
 *
 * Each place arrives on its own beat, and the list fills upward — five appears
 * at the bottom, one lands last at the top. Revealing them together made the
 * ranking something you had to read; counting down makes it something you
 * watch, and it puts the weight on first place where it belongs.
 *
 * The rows hold their final positions from the start, invisible until their
 * turn. Laying them out as they arrive would shift every row already on screen
 * each time a new one appeared.
 */

/** Frames between one place and the next. */
const STEP = 18;

/** Frames before the countdown starts, leaving room for the heading. */
const START = 10;

const ROWS = 5;

export const TopFiveSlide: React.FC<SlideProps> = ({ stat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const manifest = useBoxArtManifest();
  const { color, motion } = useTheme();
  const bodyFont = useFont('body');
  const displayFont = useFont('display');
  const utilityFont = useFont('utility');
  const { body, caption, headline } = useTypeScale();

  if (stat?.id !== 'topFive') return null;
  // The stat carries six for the outro grid; this slide is a top five.
  const games = stat.games.slice(0, ROWS);

  return (
    <SafeArea>
      <Stack gap={24}>
        <Stack gap={6}>
          <Eyebrow>The year in five</Eyebrow>
          <Headline maxLines={1}>Most played</Headline>
        </Stack>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
          {games.map((game, index) => {
            const place = index + 1;
            // Last place first: place 5 is revealed at step 0, place 1 last.
            const order = ROWS - place;
            const delay = START + order * STEP;

            const enter = spring({
              frame: frame - delay,
              fps,
              config: { stiffness: motion.stiffness, damping: motion.damping },
            });
            const opacity = interpolate(frame - delay, [0, 7], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });

            // First place gets a moment of its own: it arrives slightly larger
            // and settles, so the countdown has somewhere to land.
            const isFirst = place === 1;
            const settle = isFirst
              ? interpolate(frame - delay, [0, 26], [1.08, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                })
              : 1;

            return (
              <div
                key={game.gameId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 20,
                  opacity,
                  transform: `translateX(${(1 - enter) * 56}px) scale(${settle})`,
                  transformOrigin: 'left center',
                  // The winner sits on a plate so it reads as the answer rather
                  // than the last row of a list.
                  background: isFirst ? withAlpha(color.ink, 0.06) : 'transparent',
                  borderRadius: 12,
                  padding: isFirst ? '10px 14px' : '10px 14px 10px 0',
                }}
              >
                <span
                  style={{
                    ...(isFirst ? displayFont : utilityFont),
                    fontSize: isFirst ? headline * 0.62 : caption * 1.15,
                    color: isFirst ? color.accent : color.inkMuted,
                    width: 62,
                    flexShrink: 0,
                    lineHeight: 1,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {place}
                </span>

                <BoxArt
                  entry={boxArtFor(manifest, game.gameId)}
                  name={game.name}
                  width={isFirst ? 148 : 120}
                  height={isFirst ? 148 : 120}
                />

                <span
                  style={{
                    ...bodyFont,
                    fontSize: isFirst ? body * 1.1 : body * 0.92,
                    color: color.ink,
                    flex: 1,
                    minWidth: 0,
                    // Five rows of wrapped titles would overflow the frame.
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {game.name}
                </span>

                <span
                  style={{
                    ...bodyFont,
                    fontSize: isFirst ? body * 1.1 : body * 0.92,
                    color: color.accent,
                    flexShrink: 0,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatNumber(game.plays)}
                </span>
              </div>
            );
          })}
        </div>
      </Stack>
    </SafeArea>
  );
};
