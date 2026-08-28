import { formatDay, formatDays, formatDuration, formatNumber } from '@/shared/format';
import { useFont, useTheme, useTypeScale } from '@/theme/ThemeContext';
import { BoxArt } from '../BoxArt';
import { CountUp, Reveal } from '../motion';
import { CountMarks, SignaturePlate, useCountMarks } from '../signature';
import { boxArtFor, useBoxArtManifest } from '../useBoxArt';
import { Caption, DisplayNumber, Eyebrow, Headline, SafeArea, Stack, StatBlock } from './layout';
import type { SlideProps } from './Slides';

/**
 * The optional slides.
 *
 * These are off by default — the plan's default cut is ten slides — but each is
 * a real slide, not a placeholder, so turning one on in the UI produces
 * something worth watching rather than a gap with a number in it.
 *
 * Most are genuinely a single number and use `StatBlock`. The two game-shaped
 * ones lead with the cover, and first-and-last is a pair, because forcing those
 * into the number shape is exactly what the plan warns against.
 */

const BEAT = { first: 0, second: 6, third: 12 } as const;

/** 21 → "21:00". BG Stats records local wall-clock hours. */
const formatHour = (hour: number): string => `${String(hour).padStart(2, '0')}:00`;

export const LongestWinStreakSlide: React.FC<SlideProps> = ({ stat }) => {
  if (stat?.id !== 'longestWinStreak') return null;
  return (
    <SafeArea>
      <SignaturePlate delay={BEAT.first}>
        <StatBlock
          eyebrow="Longest win streak"
          value={<CountUp to={stat.length} delay={BEAT.second} />}
          caption={stat.length === 1 ? 'win' : 'wins in a row'}
        />
      </SignaturePlate>
    </SafeArea>
  );
};

export const CoPlayerCountSlide: React.FC<SlideProps> = ({ stat }) => {
  // Where a theme counts in its own hand: Scorepad's strokes, Felt Table's
  // dice, Meadow's tiles, Peg Board's pegs. The plays slide is stripes for
  // everyone, so this is the slide that tells the six designs apart.
  const marks = useCountMarks();
  if (stat?.id !== 'coPlayerCount') return null;

  return (
    <SafeArea>
      <Stack gap={26}>
        <SignaturePlate delay={BEAT.first}>
          <StatBlock
            eyebrow="Played with"
            value={<CountUp to={stat.count} delay={BEAT.second} />}
            caption={stat.count === 1 ? 'other person' : 'different people'}
          />
        </SignaturePlate>
        {marks ? (
          <Reveal delay={BEAT.third} distance={0}>
            <CountMarks count={stat.count} delay={BEAT.third} />
          </Reveal>
        ) : null}
      </Stack>
    </SafeArea>
  );
};

export const BusiestDaySlide: React.FC<SlideProps> = ({ stat }) => {
  if (stat?.id !== 'busiestDay') return null;
  return (
    <SafeArea>
      <Stack gap={18}>
        <Reveal delay={BEAT.first}>
          <Eyebrow>Busiest day</Eyebrow>
        </Reveal>
        <Reveal delay={BEAT.second}>
          <Headline>{formatDay(stat.day)}</Headline>
        </Reveal>
        <Reveal delay={BEAT.third}>
          <Caption accent>
            <CountUp to={stat.plays} delay={BEAT.third} /> plays in one day
          </Caption>
        </Reveal>
      </Stack>
    </SafeArea>
  );
};

/**
 * The hour most plays start at, and how much of the year runs late.
 *
 * The label used to read "You play latest at", which was wrong twice over:
 * `peakHour` is the most common hour, not the latest, and the caption claimed
 * a 20:00 threshold while `lateShare` has always measured 22:00 to 04:00.
 */
export const NightOwlSlide: React.FC<SlideProps> = ({ stat }) => {
  if (stat?.id !== 'nightOwl') return null;
  return (
    <SafeArea>
      <Stack gap={18}>
        <Reveal delay={BEAT.first}>
          <Eyebrow>Most games start at</Eyebrow>
        </Reveal>
        <Reveal delay={BEAT.second}>
          <Headline>{formatHour(stat.peakHour)}</Headline>
        </Reveal>
        <Reveal delay={BEAT.third}>
          <Caption accent>
            {formatNumber(stat.playsAtPeak)} plays started then ·{' '}
            {Math.round(stat.lateShare * 100)}% of your games began after 22:00
          </Caption>
        </Reveal>
      </Stack>
    </SafeArea>
  );
};

export const GroupShareSlide: React.FC<SlideProps> = ({ stat }) => {
  if (stat?.id !== 'groupShare') return null;
  return (
    <SafeArea>
      <SignaturePlate delay={BEAT.first}>
        <StatBlock
          eyebrow="Nights you made it to"
          value={
            <CountUp
              to={Math.round(stat.ratio * 100)}
              delay={BEAT.second}
              format={(v) => `${v}%`}
            />
          }
          caption={`${formatNumber(stat.attended)} of ${formatNumber(stat.total)} game nights`}
        />
      </SignaturePlate>
    </SafeArea>
  );
};

/* -------------------------------------------------------------------------- */
/* The game-shaped ones                                                        */
/* -------------------------------------------------------------------------- */

/** Shared by best and worst: the cover leads, the rate follows. */
const GameRateSlide: React.FC<{
  eyebrow: string;
  game: { gameId: number; name: string };
  ratio: number;
  plays: number;
}> = ({ eyebrow, game, ratio, plays }) => {
  const manifest = useBoxArtManifest();
  return (
    <SafeArea>
      <Stack gap={24}>
        <Reveal delay={BEAT.first}>
          {/* The claim is the point of the slide, so it is set as a headline
              rather than a label above the real content. */}
          <Headline maxLines={2}>{eyebrow}</Headline>
        </Reveal>
        <Reveal delay={BEAT.second} distance={30}>
          <BoxArt entry={boxArtFor(manifest, game.gameId)} name={game.name} width={380} height={380} />
        </Reveal>
        <Reveal delay={BEAT.second + 4}>
          <Caption>{game.name}</Caption>
        </Reveal>
        <Reveal delay={BEAT.third}>
          <Caption accent>
            <CountUp to={Math.round(ratio * 100)} delay={BEAT.third} format={(v) => `${v}%`} /> in{' '}
            {formatNumber(plays)} plays
          </Caption>
        </Reveal>
      </Stack>
    </SafeArea>
  );
};

export const BestGameSlide: React.FC<SlideProps> = ({ stat }) => {
  if (stat?.id !== 'bestGame') return null;
  return (
    <GameRateSlide eyebrow="You win most at" game={stat.game} ratio={stat.ratio} plays={stat.plays} />
  );
};

export const WorstGameSlide: React.FC<SlideProps> = ({ stat }) => {
  if (stat?.id !== 'worstGame') return null;
  return (
    <GameRateSlide eyebrow="Your worst game" game={stat.game} ratio={stat.ratio} plays={stat.plays} />
  );
};

export const HighestScoreSlide: React.FC<SlideProps> = ({ stat }) => {
  const manifest = useBoxArtManifest();
  if (stat?.id !== 'highestScore') return null;
  return (
    <SafeArea>
      <Stack gap={26}>
        <SignaturePlate delay={BEAT.first}>
          <StatBlock
            eyebrow="Highest score"
            value={<CountUp to={stat.score} delay={BEAT.second} />}
            // Sized against the final value: six figures at the full display
            // step ran off the right edge of the frame.
            fit={formatNumber(stat.score)}
            caption={`${stat.game.name} · ${formatDay(stat.day)}`}
          />
        </SignaturePlate>
        <Reveal delay={BEAT.third} distance={26}>
          <BoxArt
            entry={boxArtFor(manifest, stat.game.gameId)}
            name={stat.game.name}
            width={280}
            height={280}
          />
        </Reveal>
      </Stack>
    </SafeArea>
  );
};

/**
 * A record this player holds.
 *
 * Cover-led rather than number-led: the game is the subject, and the score only
 * means something once you know which game it is in. The line under it is what
 * turns a number into a claim — "best of five" — and the count of other records
 * is what stops one record reading as a fluke.
 */
export const GameRecordSlide: React.FC<SlideProps> = ({ stat }) => {
  const manifest = useBoxArtManifest();
  if (stat?.id !== 'gameRecord') return null;

  const best = stat.highestWins ? 'highest' : 'lowest';

  return (
    <SafeArea>
      <Stack gap={22}>
        <Reveal delay={BEAT.first} distance={26}>
          {/* Contained, not cropped: the slide names one game, so its box
              should be legible. A square crop took the title off the top. */}
          <BoxArt
            entry={boxArtFor(manifest, stat.game.gameId)}
            name={stat.game.name}
            width={300}
            height={360}
            fit="contain"
          />
        </Reveal>

        <Stack gap={10}>
          <Reveal delay={BEAT.second}>
            <Eyebrow>{stat.shared ? 'You share the record in' : 'You hold the record in'}</Eyebrow>
          </Reveal>
          <Reveal delay={BEAT.second + 4}>
            <Headline maxLines={2}>{stat.game.name}</Headline>
          </Reveal>
        </Stack>

        <Reveal delay={BEAT.third}>
          <DisplayNumber fit={formatNumber(stat.score)}>
            <CountUp to={stat.score} delay={BEAT.third} />
          </DisplayNumber>
        </Reveal>

        <Reveal delay={BEAT.third + 6}>
          <Caption>
            the {best} of {formatNumber(stat.contenders)} players
            {stat.plays > 1 ? ` · over ${formatNumber(stat.plays)} plays` : ''}
          </Caption>
        </Reveal>

        {stat.otherRecords > 0 && (
          <Reveal delay={BEAT.third + 10}>
            <Caption accent>
              and the best score in {formatNumber(stat.otherRecords)} other{' '}
              {stat.otherRecords === 1 ? 'game' : 'games'}
            </Caption>
          </Reveal>
        )}
      </Stack>
    </SafeArea>
  );
};

/**
 * First and last play of the range: a pair, not a number. It is the one slide
 * that gives the year a shape — where it started and where it ended up.
 */
export const FirstAndLastPlaySlide: React.FC<SlideProps> = ({ stat }) => {
  const manifest = useBoxArtManifest();
  const { color } = useTheme();
  const bodyFont = useFont('body');
  const { body } = useTypeScale();
  if (stat?.id !== 'firstAndLastPlay') return null;

  const row = (label: string, entry: { day: string; game: { gameId: number; name: string } }, delay: number) => (
    <Reveal delay={delay} distance={34}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <BoxArt
          entry={boxArtFor(manifest, entry.game.gameId)}
          name={entry.game.name}
          width={180}
          height={180}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <Eyebrow>{label}</Eyebrow>
          <span
            style={{
              ...bodyFont,
              fontSize: body,
              color: color.ink,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {entry.game.name}
          </span>
          <span style={{ ...bodyFont, fontSize: body * 0.8, color: color.accent }}>
            {formatDay(entry.day)}
          </span>
        </div>
      </div>
    </Reveal>
  );

  return (
    <SafeArea>
      <Stack gap={34}>
        {row('Started the year with', stat.first, BEAT.first)}
        {row('Ended it with', stat.last, BEAT.third)}
      </Stack>
    </SafeArea>
  );
};

/**
 * Estimated time at the table.
 *
 * The one slide whose number is not measured but inferred, so it says so: the
 * eyebrow calls it an estimate and the caption names where it came from.
 * Presenting it as a hard figure would be the most dishonest thing in the
 * video, since BG Stats never recorded how long anything took.
 */
export const TimePlayedSlide: React.FC<SlideProps> = ({ stat }) => {
  const manifest = useBoxArtManifest();
  const { color } = useTheme();
  const bodyFont = useFont('body');
  const { body } = useTypeScale();
  if (stat?.id !== 'timePlayed') return null;

  const hours = stat.minutes / 60;
  const top = stat.topGame;

  return (
    <SafeArea>
      <Stack gap={26}>
        <SignaturePlate delay={BEAT.first}>
          <StatBlock
            eyebrow="Roughly this long at the table"
            value={
              <CountUp
                to={Math.round(hours)}
                delay={BEAT.second}
                format={(v) => `${formatNumber(v)} h`}
              />
            }
            caption={`about ${formatDays(stat.minutes)} days · estimated from how long these games take`}
          />
        </SignaturePlate>

        {top && (
          <Reveal delay={BEAT.third} distance={30}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
              <BoxArt
                entry={boxArtFor(manifest, top.gameId)}
                name={top.name}
                width={168}
                height={168}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                <Eyebrow>Most of it on</Eyebrow>
                <span
                  style={{
                    ...bodyFont,
                    fontSize: body,
                    color: color.ink,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {top.name}
                </span>
                <span style={{ ...bodyFont, fontSize: body * 0.82, color: color.accent }}>
                  {formatDuration(top.minutes)} across {formatNumber(top.plays)}{' '}
                  {top.plays === 1 ? 'play' : 'plays'}
                </span>
              </div>
            </div>
          </Reveal>
        )}
      </Stack>
    </SafeArea>
  );
};
