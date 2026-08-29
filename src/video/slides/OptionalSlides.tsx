import { AbsoluteFill } from 'remotion';
import { daysBetween, formatDay, formatDays, formatDuration, formatNumber } from '@/shared/format';
import { useFont, useTheme, useTypeScale } from '@/theme/ThemeContext';
import { BoxArt } from '../BoxArt';
import { VIDEO } from '../config';
import { CountUp, Reveal } from '../motion';
import { SignaturePlate, ThemeMarks, useThemeMark } from '../signature';
import {
  CalendarTear,
  Crowd,
  DayClock,
  DayStack,
  HourDial,
  ResultRow,
  StreakChain,
} from './details';
import { boxArtFor, useBoxArtManifest } from '../useBoxArt';
import {
  Caption,
  DisplayNumber,
  Eyebrow,
  Headline,
  LABEL_SCALE,
  fitBlock,
  linesFor,
  SafeArea,
  Stack,
  StatBlock,
  useBodyMeasure,
  useSpareHeight,
} from './layout';
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
      <Stack gap={30}>
        <SignaturePlate delay={BEAT.first}>
          <StatBlock
            eyebrow="Longest win streak"
            value={<CountUp to={stat.length} delay={BEAT.second} />}
            fit={formatNumber(stat.length)}
            caption={stat.length === 1 ? 'win' : 'wins in a row'}
          />
        </SignaturePlate>
        <Reveal delay={BEAT.third} distance={0}>
          <StreakChain length={stat.length} delay={BEAT.third} />
        </Reveal>
      </Stack>
    </SafeArea>
  );
};

export const CoPlayerCountSlide: React.FC<SlideProps> = ({ stat }) => {
  if (stat?.id !== 'coPlayerCount') return null;

  return (
    <SafeArea>
      <Stack gap={26}>
        <SignaturePlate delay={BEAT.first}>
          <StatBlock
            eyebrow="Played with"
            value={<CountUp to={stat.count} delay={BEAT.second} />}
            fit={formatNumber(stat.count)}
            caption={stat.count === 1 ? 'other person' : 'different people'}
          />
        </SignaturePlate>
        {/* People drawn as people. This slide used to borrow whichever mark
            the theme owned, which on Scorepad meant the same stripes the plays
            slide had already drawn — two different facts wearing one picture. */}
        <Reveal delay={BEAT.third} distance={0}>
          <Crowd count={stat.count} delay={BEAT.third} />
        </Reveal>
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
        {/* Every other count in the video is spread across a year. This one
            happened in a day, so it piles up instead of spreading out. */}
        <Reveal delay={BEAT.third + 4} distance={0}>
          <DayStack plays={stat.plays} delay={BEAT.third + 4} />
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
        <Reveal delay={BEAT.third + 4} distance={0}>
          <HourDial peakHour={stat.peakHour} delay={BEAT.third + 4} />
        </Reveal>
      </Stack>
    </SafeArea>
  );
};

export const GroupShareSlide: React.FC<SlideProps> = ({ stat }) => {
  const marks = useThemeMark();
  if (stat?.id !== 'groupShare') return null;
  return (
    <SafeArea>
      <Stack gap={28}>
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
          fit={`${Math.round(stat.ratio * 100)}%`}
          caption={`${formatNumber(stat.attended)} of ${formatNumber(stat.total)} game nights`}
          />
        </SignaturePlate>
        {/* The one slide that still counts in the theme's own hand — dice,
            tiles or pegs. Scorepad draws nothing here on purpose: its mark is
            the tally, and the plays slide has already used it. */}
        {marks ? (
          <Reveal delay={BEAT.third} distance={0}>
            <ThemeMarks count={stat.attended} delay={BEAT.third} />
          </Reveal>
        ) : null}
      </Stack>
    </SafeArea>
  );
};

/* -------------------------------------------------------------------------- */
/* The game-shaped ones                                                        */
/* -------------------------------------------------------------------------- */

/** Shared by best and worst: the cover leads, the rate follows. */
const RATE_COVER = 380;
const RATE_GAP = 24;

/** `Caption`'s own line height, so a wrapped one can be counted. */
const CAPTION_LINE_HEIGHT = 1.3;

/**
 * How tall the row of won/lost markers comes out.
 *
 * `ResultRow` caps at 18 markers, ten to a row, at 40px with a 10px gap — so it
 * is one row or two and never more, whatever the play count.
 */
const resultRowHeight = (plays: number): number => {
  const rows = Math.min(plays, 18) > 10 ? 2 : 1;
  return rows * 40 + (rows - 1) * 10;
};

const GameRateSlide: React.FC<{
  eyebrow: string;
  game: { gameId: number; name: string };
  ratio: number;
  plays: number;
}> = ({ eyebrow, game, ratio, plays }) => {
  const manifest = useBoxArtManifest();
  const { body } = useTypeScale();
  const bodyMeasure = useBodyMeasure();

  const rateLine = `${Math.round(ratio * 100)}% in ${formatNumber(plays)} plays`;
  // Both captions counted for real. The game's name is the one that wraps —
  // this dataset has a 56-character title — and a wrapped caption used to take
  // a line out of the heading's budget without anyone knowing.
  const captionLines =
    linesFor(game.name, body, bodyMeasure) + linesFor(rateLine, body, bodyMeasure);

  // The headline sits above the cover here, so it is the cover that leaves the
  // frame when the type outgrows it.
  const claimBudget = useSpareHeight(
    RATE_COVER + RATE_GAP * 4 + body * CAPTION_LINE_HEIGHT * captionLines + resultRowHeight(plays),
  );

  return (
    <SafeArea>
      <Stack gap={RATE_GAP}>
        <Reveal delay={BEAT.first}>
          {/* The claim is the point of the slide, so it is set as a headline
              rather than a label above the real content. */}
          <Headline maxLines={2} maxHeight={claimBudget}>
            {eyebrow}
          </Headline>
        </Reveal>
        <Reveal delay={BEAT.second} distance={30}>
          <BoxArt
            entry={boxArtFor(manifest, game.gameId)}
            name={game.name}
            width={RATE_COVER}
            height={RATE_COVER}
          />
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
        {/* The plays themselves: a percentage is a fact you read, a row of
            filled and hollow markers is the same fact you can count. */}
        <Reveal delay={BEAT.third + 5} distance={0}>
          <ResultRow ratio={ratio} plays={plays} delay={BEAT.third + 5} />
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
            // Two different claims, said differently. A losing high score is a
            // fact about the scoring; a winning one is a fact about the player.
            eyebrow={stat.won ? 'Best winning score' : 'Highest score'}
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
const RECORD_COVER = { width: 300, height: 360 } as const;
const RECORD_GAP = 22;

export const GameRecordSlide: React.FC<SlideProps> = ({ stat }) => {
  const manifest = useBoxArtManifest();
  const { caption, body, display } = useTypeScale();
  const bodyMeasure = useBodyMeasure();

  // Narrowed once, up here, because the budget below needs the caption text and
  // hooks cannot run after an early return.
  const record = stat?.id === 'gameRecord' ? stat : null;
  const best = record?.highestWins ? 'highest' : 'lowest';
  const detail = record
    ? `the ${best} of ${formatNumber(record.contenders)} players${
        record.plays > 1 ? ` · over ${formatNumber(record.plays)} plays` : ''
      }`
    : '';
  const alsoLine = record
    ? `and the best score in ${formatNumber(record.otherRecords)} other ${
        record.otherRecords === 1 ? 'game' : 'games'
      }`
    : '';

  /*
    The tallest stack in the video: a cover, a label, a title, a display number
    and up to two captions. It was also the one that broke first on a wide
    display face — the title grew, everything above it was pushed up, and the
    cover left the top of the frame.

    Every term is counted rather than assumed. The number takes its full step
    rather than its fitted one, so the budget never depends on how many digits
    this player scored; the captions are measured, because "the highest of 12
    players · over 21 plays" is two lines in most of the body faces here and one
    in the narrowest, and Felt Table is one of the ones where it wraps.
  */
  const captionLines =
    linesFor(detail, body, bodyMeasure) +
    (record && record.otherRecords > 0 ? linesFor(alsoLine, body, bodyMeasure) : 0);

  const titleBudget = useSpareHeight(
    RECORD_COVER.height +
      RECORD_GAP * (record && record.otherRecords > 0 ? 4 : 3) +
      caption * LABEL_SCALE * 1.2 +
      10 +
      display * 0.95 +
      body * CAPTION_LINE_HEIGHT * captionLines,
  );

  if (!record) return null;

  return (
    <SafeArea>
      <Stack gap={RECORD_GAP}>
        <Reveal delay={BEAT.first} distance={26}>
          {/* Contained, not cropped: the slide names one game, so its box
              should be legible. A square crop took the title off the top. */}
          <BoxArt
            entry={boxArtFor(manifest, record.game.gameId)}
            name={record.game.name}
            width={RECORD_COVER.width}
            height={RECORD_COVER.height}
            fit="contain"
          />
        </Reveal>

        <Stack gap={10}>
          <Reveal delay={BEAT.second}>
            <Eyebrow>{record.shared ? 'You share the record in' : 'You hold the record in'}</Eyebrow>
          </Reveal>
          <Reveal delay={BEAT.second + 4}>
            <Headline maxLines={2} maxHeight={titleBudget}>
              {record.game.name}
            </Headline>
          </Reveal>
        </Stack>

        <Reveal delay={BEAT.third}>
          <DisplayNumber fit={formatNumber(record.score)}>
            <CountUp to={record.score} delay={BEAT.third} />
          </DisplayNumber>
        </Reveal>

        <Reveal delay={BEAT.third + 6}>
          <Caption>
            the {best} of {formatNumber(record.contenders)} players
            {record.plays > 1 ? ` · over ${formatNumber(record.plays)} plays` : ''}
          </Caption>
        </Reveal>

        {record.otherRecords > 0 && (
          <Reveal delay={BEAT.third + 10}>
            <Caption accent>
              and the best score in {formatNumber(record.otherRecords)} other{' '}
              {record.otherRecords === 1 ? 'game' : 'games'}
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
/**
 * The second line under the span, saying the same length a different way.
 *
 * A number on its own is a fact; the same number restated in a unit a person
 * lives in is a length of time. Weeks up to a season, then months — nobody
 * counts 236 days, but everybody knows how long eight months is.
 */
const gapNote = (days: number, months: number): string => {
  if (days < 14) return 'the same fortnight';
  if (days < 100) return `${Math.round(days / 7)} weeks between them`;
  return `${months} months, end to end`;
};

/** Cover, gap and the text column beside it, in the bookends slide's rows. */
const ROW_COVER = 216;
const ROW_GAP = 24;
const ROW_TEXT_WIDTH = VIDEO.width - VIDEO.safeMargin * 2 - ROW_COVER - ROW_GAP;

export const FirstAndLastPlaySlide: React.FC<SlideProps> = ({ stat }) => {
  const manifest = useBoxArtManifest();
  const { color } = useTheme();
  const bodyFont = useFont('body');
  const { body } = useTypeScale();
  const spanMeasure = useBodyMeasure();
  if (stat?.id !== 'firstAndLastPlay') return null;

  const row = (
    label: string,
    entry: { day: string; game: { gameId: number; name: string } },
    delay: number,
    // The two bookends arrive from opposite sides, because that is what they
    // are: one opened the year and one closed it, and having them slide in the
    // same direction made them read as two items in a list.
    direction: 'left' | 'right',
  ) => (
    <Reveal delay={delay} distance={56} direction={direction}>
      <div style={{ display: 'flex', alignItems: 'center', gap: ROW_GAP }}>
        <BoxArt
          entry={boxArtFor(manifest, entry.game.gameId)}
          name={entry.game.name}
          width={ROW_COVER}
          height={ROW_COVER}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          {/* Fitted to the column beside the cover, not to the frame: at the
              full label size "Started the year with" wrapped onto two lines and
              pushed the date out from under it. */}
          <Eyebrow width={ROW_TEXT_WIDTH}>{label}</Eyebrow>
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

  // Absolute month indices, so a range that crosses New Year still counts
  // forwards. "2025-11" to "2026-02" is four pages, not minus nine.
  const monthOf = (day: string) => {
    const [year, month] = day.split('-').map(Number);
    return year * 12 + (month - 1);
  };

  /*
    The span, which is the one number this slide has.

    Two covers and a torn calendar was a picture of a year without a fact in it,
    and next to slides that all lead with a figure it read as the one that had
    nothing to say. The days between the first play and the last is the thing
    the calendar is already drawing — saying it out loud costs a line and turns
    the flourish into a caption for something.
  */
  const days = daysBetween(stat.first.day, stat.last.day) ?? 0;
  const months = monthOf(stat.last.day) - monthOf(stat.first.day) + 1;

  return (
    <SafeArea>
      <Stack gap={22}>
        {row('Started the year with', stat.first, BEAT.first, 'left')}
        {/*
          The calendar sits between the two, because what it draws is the gap
          between them. It tears exactly the months the range covers — a year
          that ran January to March tears three, not twelve — so the flourish
          is the length of the span rather than a fixed piece of decoration.

          It sits in the *same two columns the rows use*: the tear where a cover
          would be, the span where a game's name would be. Set loose on the
          frame the line under it read as an orphan — indented from nothing,
          aligned to nothing, and the one piece of text on the slide that
          belonged to no row.
        */}
        <div style={{ display: 'flex', alignItems: 'center', gap: ROW_GAP }}>
          <div style={{ width: ROW_COVER, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
            <Reveal delay={BEAT.second} distance={0}>
              <CalendarTear
                fromMonth={monthOf(stat.first.day)}
                toMonth={monthOf(stat.last.day)}
                delay={BEAT.second}
              />
            </Reveal>
          </div>
          {days > 0 && (
            <Reveal delay={BEAT.second + 8}>
              {/* The span, said once. It used to be a display figure with this
                  line under it, which put a third number on a slide whose whole
                  point is the two dates already on it — and made the middle row
                  taller than the two it divides. The tear draws the length; this
                  says what it comes to. */}
              <span
                style={{
                  ...bodyFont,
                  fontSize: fitBlock({
                    text: gapNote(days, months),
                    ceiling: body,
                    maxLines: 1,
                    measure: spanMeasure,
                    width: ROW_TEXT_WIDTH,
                    floor: body * 0.7,
                  }),
                  color: color.accent,
                  whiteSpace: 'nowrap',
                }}
              >
                {gapNote(days, months)}
              </span>
            </Reveal>
          )}
        </div>
        {row('Ended it with', stat.last, BEAT.third + 6, 'right')}
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
    <>
      {/*
        The clock hangs in the top corner rather than beside the number.
        In the row it shared with the stat block it took width off the caption
        and broke "estimated from how long these games take" across more lines
        than it should — a decoration that costs the text its shape is not
        earning its place. One lap of the dial is still one day.
      */}
      <AbsoluteFill style={{ padding: VIDEO.safeMargin, alignItems: 'flex-end' }}>
        <DayClock minutes={stat.minutes} delay={BEAT.second} />
      </AbsoluteFill>

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
            // The unit is part of the value, so it is part of what gets sized:
            // "114 h" is five characters where "114" is three, and at the full
            // display step the difference is a line break before the h.
            fit={`${formatNumber(Math.round(hours))} h`}
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
    </>
  );
};
