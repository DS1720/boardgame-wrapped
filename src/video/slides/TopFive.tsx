import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { formatDuration, formatNumber } from '@/shared/format';
import { withAlpha } from '@/theme/color';
import { useFont, useTheme, useTypeScale } from '@/theme/ThemeContext';
import { BoxArt } from '../BoxArt';
import { boxArtFor, useBoxArtManifest } from '../useBoxArt';
import { Eyebrow, Headline, SafeArea, Stack } from './layout';
import type { SlideProps } from './Slides';

/**
 * A ranked five, counted down from five to one.
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

/**
 * How the place numbers are sized, as a fraction of their type step.
 *
 * First place is set from the *headline* step and the rest from the caption
 * step, which is what makes it the one number on the slide you read as an
 * answer rather than as an index. It was 0.62 of the headline and that was
 * shouting: at 0.48 it is still comfortably twice the size of the places under
 * it — every starter's headline step is at least four times its caption, so the
 * two can never converge — without taking the row over from the cover and the
 * title beside it.
 */
const FIRST_PLACE = 0.48;
const OTHER_PLACES = 1.15;

/** One row of the countdown: a game, and whatever is being counted. */
interface CountdownRow {
  gameId: number;
  name: string;
  /** Already formatted — the list does not know what unit it is showing. */
  value: string;
}

/**
 * The countdown itself, shared by the two slides that use it.
 *
 * Extracted rather than copied when the time list arrived. The motion is the
 * recognisable part of this slide — five to one, filling upward, first place
 * landing last on a plate — and two copies of it would drift apart the first
 * time either was touched. What differs between the two is the heading and the
 * number on the right, so that is all either one passes in.
 */
const CountdownList: React.FC<{
  eyebrow: string;
  headline: string;
  rows: CountdownRow[];
  /**
   * Where the block sits in the frame.
   *
   * Bottom by default, like every other slide. The time list centres instead:
   * its rows are a fixed height whatever the numbers say, so there is nothing
   * for the bottom anchor to earn, and centred it sits where the play-count
   * list does rather than 400px lower.
   */
  justify?: React.CSSProperties['justifyContent'];
}> = ({ eyebrow, headline: title, rows, justify }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const manifest = useBoxArtManifest();
  const { color, motion } = useTheme();
  const bodyFont = useFont('body');
  const displayFont = useFont('display');
  const utilityFont = useFont('utility');
  const { body, caption, headline } = useTypeScale();

  const games = rows.slice(0, ROWS);

  return (
    <SafeArea {...(justify ? { justify } : {})}>
      <Stack gap={24}>
        <Stack gap={6}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <Headline maxLines={1}>{title}</Headline>
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
                    fontSize: isFirst ? headline * FIRST_PLACE : caption * OTHER_PLACES,
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
                  {game.value}
                </span>
              </div>
            );
          })}
        </div>
      </Stack>
    </SafeArea>
  );
};

export const TopFiveSlide: React.FC<SlideProps> = ({ stat }) => {
  if (stat?.id !== 'topFive') return null;
  return (
    <CountdownList
      eyebrow="The year in five"
      headline="Most played"
      // The stat carries six for the outro grid; this slide is a top five.
      rows={stat.games.map((game) => ({
        gameId: game.gameId,
        name: game.name,
        value: formatNumber(game.plays),
      }))}
    />
  );
};

/**
 * The same countdown, ranked by time rather than by plays.
 *
 * It sits directly after the time slide and is deliberately the same shape as
 * the play count list, because the point is that they are *different lists*:
 * the game you played most often is usually not the one you spent most of the
 * year inside. Shown in a different form, that contrast would read as two
 * unrelated facts.
 */
export const TopFiveByTimeSlide: React.FC<SlideProps> = ({ stat }) => {
  if (stat?.id !== 'topFiveByTime') return null;
  return (
    <CountdownList
      eyebrow="Where the time went"
      headline="Most time"
      justify="center"
      rows={stat.games.map((game) => ({
        gameId: game.gameId,
        name: game.name,
        value: formatDuration(game.minutes),
      }))}
    />
  );
};
