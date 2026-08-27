
import type { Stat } from '@/stats/types';
import type { WrappedStats } from '@/stats/types';
import { formatDay, formatNumber, formatPercent } from '@/shared/format';
import { superlativeFor } from '@/stats/superlative';
import { withAlpha } from '@/theme/color';
import { useFont, useTheme, useTypeScale } from '@/theme/ThemeContext';
import { BoxArt, BoxArtHero } from '../BoxArt';
import { CountUp, Float, Reveal, Stagger } from '../motion';
import { SignaturePlate, TallyMarks, useTally } from '../signature';
import { boxArtFor, useBoxArtManifest } from '../useBoxArt';
import { Caption, Eyebrow, Headline, SafeArea, Stack, StatBlock } from './layout';

/**
 * The ten slides of the default cut.
 *
 * Only the ones whose content is genuinely a single number use the
 * eyebrow/number/caption shape. The plan is explicit that forcing every slide
 * into it is a mistake, so the top five is a grid, the nemesis is a face-off,
 * and the top game leads with its cover.
 */

export interface SlideProps {
  stat: Stat | null;
  stats: WrappedStats;
}

/** Entry beats, in frames. Shared so every slide has the same internal rhythm. */
const BEAT = { first: 0, second: 6, third: 12 } as const;

/**
 * The box the most-played cover is fitted inside.
 *
 * Wider than it is tall would crop a portrait box; taller than the frame can
 * spare would push the caption into the quip. This is the largest box that
 * leaves room for both, and `fit="contain"` means a square cover simply sits
 * smaller inside it rather than being stretched to fill it.
 */
const HERO_W = 620;
const HERO_H = 740;

/* -------------------------------------------------------------------------- */

/**
 * Two bars, and moving throughout.
 *
 * The range slides in from the left, the name assembles a word at a time, and
 * the whole block keeps a slow drift — so even a card with three lines on it is
 * never a still frame.
 */
export const IntroSlide: React.FC<SlideProps> = ({ stats }) => {
  const { color } = useTheme();
  const bodyFont = useFont('body');
  const displayFont = useFont('display');
  const { body, display } = useTypeScale();

  return (
    <SafeArea justify="center">
      <Stack gap={16}>
        <Reveal delay={BEAT.first} direction="right" distance={60}>
          <Float amount={5} period={9}>
            {/* The year set large: it is half of what this card is telling you. */}
            <p
              style={{
                ...displayFont,
                fontSize: display * 0.36,
                color: color.accent,
                margin: 0,
                lineHeight: 1,
                letterSpacing: '-0.02em',
              }}
            >
              {stats.rangeLabel}
            </p>
          </Float>
        </Reveal>

        {/* The name drifts on its own. It carries no Reveal: KineticWords already
            assembles it a word at a time, and a second entrance on top read as a
            stutter. (The flat bottom edge on a name like "Tina" is the baseline,
            not a clip — confirmed by rendering a name with descenders.) */}
        <Float amount={7} period={11} phase={1.4}>
          <Headline maxLines={2} delay={BEAT.second}>
            {stats.playerName}
          </Headline>
        </Float>

        <Reveal delay={BEAT.third + 4} direction="right" distance={40}>
          <Float amount={5} period={8} phase={2.6}>
            <p style={{ ...bodyFont, fontSize: body, color: color.inkMuted, margin: 0 }}>
              A year at the table
            </p>
          </Float>
        </Reveal>
      </Stack>
    </SafeArea>
  );
};

export const TotalPlaysSlide: React.FC<SlideProps> = ({ stat }) => {
  const tally = useTally();
  if (stat?.id !== 'totalPlays') return null;

  return (
    <SafeArea>
      <Stack gap={28}>
        <SignaturePlate delay={BEAT.first}>
          <StatBlock
            eyebrow="Plays"
            value={<CountUp to={stat.plays} delay={BEAT.second} />}
            caption={`across ${formatNumber(stat.nights)} game nights · ${formatNumber(
              stat.distinctGames,
            )} different games`}
          />
        </SignaturePlate>
        {tally ? (
          <Reveal delay={BEAT.third} distance={0}>
            <TallyMarks count={stat.plays} delay={BEAT.third} />
          </Reveal>
        ) : null}
      </Stack>
    </SafeArea>
  );
};

export const TopGameSlide: React.FC<SlideProps> = ({ stat }) => {
  const manifest = useBoxArtManifest();
  if (stat?.id !== 'topGame') return null;
  const entry = boxArtFor(manifest, stat.game.gameId);

  return (
    <>
      {/*
        The blurred backdrop fills the frame; the cover and its caption are one
        centred group on top of it.
        
        No mask over the hero: masking the whole thing faded out the bottom half
        of the cover, which is the one thing this slide exists to show. The
        backdrop fades on its own, inside BoxArtHero. And the caption travels
        with the cover rather than being pinned to the bottom of the frame,
        which left a screen's worth of dead space between them.
      */}
      <BoxArtHero entry={entry} name={stat.game.name} width={HERO_W} height={HERO_H} showCover={false} />

      <SafeArea justify="center" align="center">
        <Stack gap={30}>
          <Reveal delay={BEAT.first} distance={26}>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Float amount={9} period={9}>
                <BoxArt
                  entry={entry}
                  name={stat.game.name}
                  width={HERO_W}
                  height={HERO_H}
                  fit="contain"
                />
              </Float>
            </div>
          </Reveal>

          <Stack gap={12}>
            <Reveal delay={BEAT.second}>
              <Eyebrow>Most played</Eyebrow>
            </Reveal>
            <Reveal delay={BEAT.second + 4}>
              <Headline maxLines={2}>{stat.game.name}</Headline>
            </Reveal>
            <Reveal delay={BEAT.third}>
              <Caption accent>
                <CountUp to={stat.plays} delay={BEAT.third} /> times
              </Caption>
            </Reveal>
          </Stack>
        </Stack>
      </SafeArea>
    </>
  );
};

export const WinRateSlide: React.FC<SlideProps> = ({ stat }) => {
  if (stat?.id !== 'winRate') return null;
  const total = stat.wins + stat.losses;

  return (
    <SafeArea>
      <Stack gap={28}>
        <SignaturePlate delay={BEAT.first}>
          <StatBlock
            eyebrow={stat.coopOnly ? 'Co-op record' : 'Win rate'}
            value={<CountUp to={Math.round(stat.ratio * 100)} delay={BEAT.second} format={(v) => `${v}%`} />}
            caption={
              stat.coopOnly
                ? `${formatNumber(stat.wins)} wins in ${formatNumber(total)} co-op plays`
                : `${formatNumber(stat.wins)} wins in ${formatNumber(total)} competitive plays`
            }
          />
        </SignaturePlate>
        <Reveal delay={BEAT.third} distance={0}>
          <WinBar ratio={stat.ratio} />
        </Reveal>
      </Stack>
    </SafeArea>
  );
};

/** A single bar. The percentage is already the headline; this just gives it a shape. */
const WinBar: React.FC<{ ratio: number }> = ({ ratio }) => {
  const { color } = useTheme();
  return (
    <div
      style={{
        height: 26,
        width: '100%',
        borderRadius: 13,
        backgroundColor: withAlpha(color.ink, 0.16),
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${Math.round(ratio * 100)}%`,
          height: '100%',
          backgroundColor: color.accent,
          borderRadius: 13,
        }}
      />
    </div>
  );
};

export const TopCoPlayerSlide: React.FC<SlideProps> = ({ stat }) => {
  const { color } = useTheme();
  const bodyFont = useFont('body');
  const utilityFont = useFont('utility');
  const { body, caption } = useTypeScale();
  if (stat?.id !== 'topCoPlayer') return null;

  // The headline names one person; the others give that number something to be
  // compared against. "180 plays together" alone says nothing about the gap.
  const rest = stat.others.filter((o) => o.playerId !== stat.playerId).slice(0, 4);
  const widest = Math.max(stat.shared, ...rest.map((o) => o.shared), 1);

  return (
    <SafeArea>
      <Stack gap={26}>
        <Reveal delay={BEAT.first}>
          <Eyebrow>Played most with</Eyebrow>
        </Reveal>
        <Reveal delay={BEAT.second}>
          <Headline>{stat.name}</Headline>
        </Reveal>
        <Reveal delay={BEAT.second + 4}>
          <Caption accent>
            <CountUp to={stat.shared} delay={BEAT.second + 4} /> plays together
          </Caption>
        </Reveal>

        {rest.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
            <Reveal delay={BEAT.third}>
              <Eyebrow>Then</Eyebrow>
            </Reveal>
            <Stagger delay={BEAT.third + 4} direction="right" distance={34}>
              {rest.map((person) => (
                <div key={person.playerId} style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                  <span
                    style={{
                      ...bodyFont,
                      fontSize: body * 0.9,
                      color: color.ink,
                      width: 300,
                      flexShrink: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {person.name}
                  </span>
                  {/* A bar rather than bare figures: the drop from first to
                      fifth is the part worth seeing. */}
                  <span
                    style={{
                      flex: 1,
                      height: 14,
                      borderRadius: 7,
                      backgroundColor: withAlpha(color.ink, 0.14),
                      overflow: 'hidden',
                    }}
                  >
                    <span
                      style={{
                        display: 'block',
                        width: `${(person.shared / widest) * 100}%`,
                        height: '100%',
                        borderRadius: 7,
                        backgroundColor: color.accentAlt,
                      }}
                    />
                  </span>
                  <span
                    style={{
                      ...utilityFont,
                      fontSize: caption,
                      color: color.inkMuted,
                      width: 88,
                      textAlign: 'right',
                      flexShrink: 0,
                    }}
                  >
                    {formatNumber(person.shared)}
                  </span>
                </div>
              ))}
            </Stagger>
          </div>
        )}
      </Stack>
    </SafeArea>
  );
};

export const NemesisSlide: React.FC<SlideProps> = ({ stat }) => {
  const { color } = useTheme();
  const bodyFont = useFont('body');
  const { body } = useTypeScale();
  if (stat?.id !== 'nemesis') return null;

  return (
    <SafeArea>
      <Stack gap={18}>
        <Reveal delay={BEAT.first}>
          <Eyebrow>Nemesis</Eyebrow>
        </Reveal>
        <Reveal delay={BEAT.second}>
          <Headline>{stat.name}</Headline>
        </Reveal>
        <Reveal delay={BEAT.third}>
          <p style={{ ...bodyFont, fontSize: body, color: color.inkMuted, margin: 0 }}>
            beat you in{' '}
            <span style={{ color: color.accent }}>
              <CountUp
                to={Math.round(stat.lossRate * 100)}
                delay={BEAT.third}
                format={(v) => `${v}%`}
              />
            </span>{' '}
            of your games — {formatNumber(stat.lossesTo)} of {formatNumber(stat.headToHead)}
          </p>
        </Reveal>
      </Stack>
    </SafeArea>
  );
};

export const GamesLearnedSlide: React.FC<SlideProps> = ({ stat }) => {
  const manifest = useBoxArtManifest();
  const { color } = useTheme();
  const bodyFont = useFont('body');
  const { body } = useTypeScale();
  if (stat?.id !== 'gamesLearned') return null;

  const shown = stat.games.slice(0, 6);

  return (
    <SafeArea>
      <Stack gap={28}>
        <SignaturePlate delay={BEAT.first}>
          <StatBlock
            eyebrow="Learned this year"
            value={<CountUp to={stat.count} delay={BEAT.second} />}
            caption={stat.count === 1 ? 'new game' : 'new games'}
          />
        </SignaturePlate>
        {shown.length > 0 ? (
          <div
            style={{
              display: 'grid',
              // Two columns so every cover sits beside its title. A bare wall of
              // box art asks you to recognise games you had never played before.
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '16px 24px',
              width: '100%',
            }}
          >
            <Stagger delay={BEAT.third} distance={26}>
              {shown.map((game) => (
                <div key={game.gameId} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <BoxArt
                    entry={boxArtFor(manifest, game.gameId)}
                    name={game.name}
                    width={104}
                    height={104}
                  />
                  <span
                    style={{
                      ...bodyFont,
                      fontSize: body * 0.76,
                      color: color.ink,
                      lineHeight: 1.2,
                      minWidth: 0,
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {game.name}
                  </span>
                </div>
              ))}
            </Stagger>
          </div>
        ) : null}
        {stat.count > shown.length ? (
          <Reveal delay={BEAT.third + 10}>
            <p style={{ ...bodyFont, fontSize: body, color: color.inkMuted, margin: 0 }}>
              and {formatNumber(stat.count - shown.length)} more
            </p>
          </Reveal>
        ) : null}
      </Stack>
    </SafeArea>
  );
};

export const TopLocationSlide: React.FC<SlideProps> = ({ stat }) => {
  if (stat?.id !== 'topLocation') return null;

  return (
    <SafeArea>
      <Stack gap={18}>
        <Reveal delay={BEAT.first}>
          <Eyebrow>Where you played most</Eyebrow>
        </Reveal>
        <Reveal delay={BEAT.second}>
          <Headline>{stat.name}</Headline>
        </Reveal>
        <Reveal delay={BEAT.third}>
          <Caption accent>
            <CountUp to={stat.nights} delay={BEAT.third} /> nights
          </Caption>
        </Reveal>
      </Stack>
    </SafeArea>
  );
};

/**
 * The outro: the top-five grid, built to be screenshotted.
 *
 * Everything a person would want in a shared screenshot is on this one frame —
 * whose year it is, the range, and the five games — and it holds still for two
 * and a half bars so there is time to take it.
 */
export const OutroSlide: React.FC<SlideProps> = ({ stats }) => {
  const manifest = useBoxArtManifest();
  const { color } = useTheme();
  const utilityFont = useFont('utility');
  const bodyFont = useFont('body');
  const displayFont = useFont('display');
  const { caption, body, display } = useTypeScale();

  const topFive = stats.stats.find((s) => s.id === 'topFive');
  // Six, so the grid below fills 3x2 without a hole in the bottom row.
  const games = topFive?.id === 'topFive' ? topFive.games.slice(0, 6) : [];
  const totals = stats.stats.find((s) => s.id === 'totalPlays');
  // Null when nothing about this year was distinctive enough to claim.
  const superlative = superlativeFor(stats);

  return (
    <SafeArea justify="center">
      <Stack gap={30}>
        <Reveal delay={BEAT.first}>
          <Stack gap={8}>
            {/* The range is the headline of a screenshot, not a caption on it:
                whoever sees this shared should read the year first. */}
            <p
              style={{
                ...displayFont,
                fontSize: display * 0.42,
                color: color.accent,
                margin: 0,
                lineHeight: 1,
              }}
            >
              {stats.rangeLabel}
            </p>
            <Headline maxLines={1}>{stats.playerName}</Headline>
            {totals?.id === 'totalPlays' ? (
              <p style={{ ...bodyFont, fontSize: body, color: color.inkMuted, margin: 0 }}>
                {formatNumber(totals.plays)} plays · {formatNumber(totals.distinctGames)} games ·{' '}
                {formatNumber(totals.nights)} nights
              </p>
            ) : null}
            {superlative ? (
              <p style={{ ...bodyFont, fontSize: body, color: color.accent, margin: '2px 0 0' }}>
                {superlative.line}
              </p>
            ) : null}
          </Stack>
        </Reveal>

        {games.length > 0 ? (
          <div
            style={{
              display: 'grid',
              // Three across, two down. Six covers fill it exactly, so the
              // bottom row is never a ragged pair.
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 18,
              width: '100%',
            }}
          >
            <Stagger delay={BEAT.second} distance={30}>
              {games.map((game) => (
                <div key={game.gameId} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <BoxArt entry={boxArtFor(manifest, game.gameId)} name={game.name} width={248} height={248} />
                  <span
                    style={{
                      ...bodyFont,
                      fontSize: caption,
                      color: color.ink,
                      lineHeight: 1.2,
                      // A screenshot has to stand alone, so the grid names its
                      // games rather than relying on the cover being recognized.
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {game.name}
                  </span>
                  <span style={{ ...utilityFont, fontSize: caption, color: color.accent }}>
                    {formatNumber(game.plays)}×
                  </span>
                </div>
              ))}
            </Stagger>
          </div>
        ) : null}
      </Stack>
    </SafeArea>
  );
};

/** Slides that have no stat of their own and read from the whole set. */
export const BOOKENDS = { intro: IntroSlide, outro: OutroSlide };

export { formatDay, formatPercent };
