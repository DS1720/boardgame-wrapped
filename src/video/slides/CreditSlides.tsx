import { formatNumber } from '@/shared/format';
import { useFont, useTheme, useTypeScale } from '@/theme/ThemeContext';
import { BoxArt, BoxArtHero } from '../BoxArt';
import { CountUp, Reveal, Stagger } from '../motion';
import { boxArtFor, useBoxArtManifest } from '../useBoxArt';
import { CountdownList, type CountdownRow } from './TopFive';
import type { SlideProps } from './Slides';
import { Caption, Eyebrow, Headline, SafeArea, Stack, useSpareHeight } from './layout';
import type { CreditEntry, LeadCreditStat, LeadCreditStatId } from '@/stats/types';

/**
 * The five BGG credit slides: themes, mechanics, designers, artists, publishers.
 *
 * All five are the same countdown the two game lists use, so they use the same
 * component rather than a fifth and sixth copy of that motion. What each one
 * passes in is a heading and a unit — which is the whole of the difference
 * between them.
 *
 * Each row carries a cover: the player's most-played game carrying that name.
 * It is why the name is on the list, so it earns its place on the row rather
 * than filling the space a game title used to occupy — and without it a credit
 * list is three columns of text where the slides around it have pictures.
 */

/**
 * The second line under a name: how many games the count is spread across.
 *
 * Games only, never the plays — the row already sets the play count in the
 * accent on the right, and saying it again three columns to the left made
 * every row read "6 plays · 2 games ... 6". What this adds is the axis the
 * number on the right does not have.
 */
const spread = (entry: CreditEntry): string =>
  `${entry.games} ${entry.games === 1 ? 'game' : 'games'}`;

/**
 * Rows for a credit list. Every list shows the games line.
 *
 * It was briefly gated on the counts *varying* across the list, on the argument
 * that five rows reading "2 GAMES" is a column of one word — and then off for
 * themes and mechanics, on the argument that their hero slide had already said
 * how far the leader reached. Both were wrong for the same reason: how many
 * games a credit is spread over is the one axis the play count does not carry,
 * and it is per-row information that the hero can only give for the winner.
 */
/**
 * "Top 5 designers", or "Top 3 designers" when three is all there is.
 *
 * The picker's label for these slides is a fixed catalogue name — it has to
 * read the same before anyone's stats are loaded. The headline does not, and it
 * has to be true: the eligibility filter means a full five exists for only 4 of
 * 26 players on designers, so a slide claiming five over three rows would be
 * wrong more often than right. Themes and mechanics take no filter and are
 * effectively always five.
 */
const topNHeadline = (entries: CreditEntry[], noun: string): string =>
  `Top ${entries.length} ${noun}`;

const rowsOf = (entries: CreditEntry[], detail: boolean): CountdownRow[] =>
  entries.map((entry) => ({
    key: entry.name,
    gameId: entry.topGame.gameId,
    name: entry.name,
    value: formatNumber(entry.plays),
    ...(detail ? { detail: spread(entry) } : {}),
  }));

export const TopThemesSlide: React.FC<SlideProps> = ({ stat }) => {
  if (stat?.id !== 'topThemes') return null;
  return (
    <CountdownList
      eyebrow="What your year was about"
      headline={topNHeadline(stat.entries, 'themes')}
      rows={rowsOf(stat.entries, true)}
    />
  );
};

export const TopMechanicsSlide: React.FC<SlideProps> = ({ stat }) => {
  if (stat?.id !== 'topMechanics') return null;
  return (
    <CountdownList
      eyebrow="How you like to play"
      headline={topNHeadline(stat.entries, 'mechanics')}
      rows={rowsOf(stat.entries, true)}
    />
  );
};

export const TopDesignersSlide: React.FC<SlideProps> = ({ stat }) => {
  if (stat?.id !== 'topDesigners') return null;
  return (
    <CountdownList
      eyebrow="Who designed your year"
      headline={topNHeadline(stat.entries, 'designers')}
      rows={rowsOf(stat.entries, true)}
    />
  );
};

export const TopArtistsSlide: React.FC<SlideProps> = ({ stat }) => {
  if (stat?.id !== 'topArtists') return null;
  return (
    <CountdownList
      eyebrow="Who you were looking at"
      headline={topNHeadline(stat.entries, 'artists')}
      rows={rowsOf(stat.entries, true)}
    />
  );
};

export const TopPublishersSlide: React.FC<SlideProps> = ({ stat }) => {
  if (stat?.id !== 'topPublishers') return null;
  return (
    <CountdownList
      eyebrow="Who put it on the table"
      headline={topNHeadline(stat.entries, 'publishers')}
      rows={rowsOf(stat.entries, true)}
    />
  );
};

/* -------------------------------------------------------------------------- */
/* The two hero credit slides                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Motion beats, matched to the most-played slide this one is modelled on.
 *
 * `more` is the gap *after the last cover has landed*, not a fixed offset from
 * `grid`. As a constant it was 22, which put the line on screen at frame 42
 * while the sixth cover of a slow theme was still arriving at 55 — the line
 * counts the covers under it, so it cannot precede them. The stagger step is a
 * theme's to set, so the wait has to be computed rather than written down.
 */
const BEAT = { first: 0, second: 6, third: 12, grid: 20, more: 8 } as const;

/**
 * The example grid: three across, two down.
 *
 * Six covers fill it exactly, so the bottom row is never a ragged pair — the
 * same reason the outro takes six from a top five. `EXAMPLE_BOX` is what one
 * cover is fitted inside; the content box is 840px wide, so three of these plus
 * two gaps come to 792 and the grid never touches the safe margin.
 */
const EXAMPLE_COLUMNS = 3;
const EXAMPLE_BOX = 248;
const EXAMPLE_GAP = 24;
const GRID_GAP = 34;

/**
 * When the "+N more" line arrives: after the last cover has landed.
 *
 * Pure and exported because the failure it prevents is invisible in every
 * theme but the slowest. The stagger step belongs to the theme — 3 frames on
 * Neon Night, 7 on Table Light — so a fixed offset that looks right on one is
 * a line counting covers that have not appeared yet on another.
 */
export const moreDelay = (examples: number, stagger: number): number =>
  BEAT.grid + Math.max(0, examples - 1) * stagger + BEAT.more;

/**
 * One theme or mechanic, with the games that earned it.
 *
 * Built like the most-played slide — a claim, centred, with the evidence under
 * it — because it is making the same kind of statement. What differs is that
 * the evidence is a set rather than a single cover: "Deduction, 39 plays" means
 * nothing until you can see that it was Phantom Ink and Codenames and The Gang,
 * which is the question the list slide beside it invites and cannot answer.
 *
 * The game titles are set under the covers rather than left implied. Half the
 * point of the slide is recognising the games, and a cover at 248px is a
 * thumbnail — legible if you already know the box, not if you are being told
 * about it.
 */
const LeadCreditSlide: React.FC<{
  stat: LeadCreditStat<LeadCreditStatId>;
  eyebrow: string;
  /** Finishes "across N games", so it can be "games" or something narrower. */
  unit: string;
}> = ({ stat, eyebrow, unit }) => {
  const manifest = useBoxArtManifest();
  const { color, motion } = useTheme();
  const bodyFont = useFont('body');
  const { caption, body } = useTypeScale();

  const rows = Math.ceil(stat.examples.length / EXAMPLE_COLUMNS);
  // A title is allowed two lines; below the box that is the whole cost of a row.
  const titleHeight = caption * 1.25 * 2;
  const gridHeight = rows * (EXAMPLE_BOX + 8 + titleHeight) + (rows - 1) * EXAMPLE_GAP;

  /*
    The games that did not fit.

    The grid holds six and the credit usually spans more — Hand Management is on
    24 of Tina's games. Without this the six read as the whole set, which is a
    quieter kind of wrong than a number being off: the caption above says
    "across 24 games" and the grid shows six, and nothing on the slide connects
    the two.
  */
  const more = Math.max(0, stat.games - stat.examples.length);
  const moreHeight = more > 0 ? caption * 1.3 + GRID_GAP : 0;

  /*
    The name is the one element allowed to grow, so it gets whatever the grid,
    the label and the caption leave. Without a budget a long mechanic —
    "Simultaneous Action Selection" is 29 characters — sets itself over three
    lines at headline size and pushes the top row of covers off the frame.
  */
  const nameBudget = useSpareHeight(
    gridHeight + moreHeight + GRID_GAP + caption * 1.2 + body * 1.4 + 24,
  );

  return (
    <>
      {/* The leading game's cover, blurred, as a ground for the whole card.
          `showCover` is off: the covers this slide is about are in the grid. */}
      <BoxArtHero
        entry={boxArtFor(manifest, stat.examples[0].gameId)}
        name={stat.examples[0].name}
        width={EXAMPLE_BOX}
        height={EXAMPLE_BOX}
        showCover={false}
      />

      <SafeArea justify="center" align="center">
        <Stack gap={GRID_GAP} align="center">
          <Stack gap={10} align="center">
            <Reveal delay={BEAT.first}>
              <Eyebrow>{eyebrow}</Eyebrow>
            </Reveal>
            <Reveal delay={BEAT.second}>
              <Headline maxLines={2} maxHeight={nameBudget}>
                {stat.name}
              </Headline>
            </Reveal>
            <Reveal delay={BEAT.third}>
              <Caption accent>
                <CountUp to={stat.plays} delay={BEAT.third} /> plays across {stat.games} {unit}
              </Caption>
            </Reveal>
          </Stack>

          {/*
            The covers land one at a time, a beat after the number, so the claim
            is read before the evidence rather than competing with it.

            `Stagger` renders a fragment of `Reveal`s, so it sits *inside* the
            grid and each cover becomes its own cell. Wrapping the whole grid in
            one instead would drop all six together, which is a picture rather
            than a list being counted out.
          */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${EXAMPLE_COLUMNS}, ${EXAMPLE_BOX}px)`,
              gap: EXAMPLE_GAP,
              justifyContent: 'center',
            }}
          >
            <Stagger delay={BEAT.grid} direction="up" distance={26}>
              {stat.examples.map((game) => (
                <div key={game.gameId} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/*
                    A fixed cell with the art sitting on its bottom edge.

                    `fit="contain"` gives an element the cover's own aspect
                    ratio up to the box — deliberately, so there is no letterbox
                    bar and the shadow follows the art — which means a wide box
                    like Phantom Ink is shorter than a tall one like Codenames.
                    Left to itself the titles then sit at three different
                    heights across a row. Bottom-aligned they read as boxes on a
                    shelf, and every title starts on the same line.
                  */}
                  <div
                    style={{
                      height: EXAMPLE_BOX,
                      display: 'flex',
                      alignItems: 'flex-end',
                      justifyContent: 'center',
                    }}
                  >
                    <BoxArt
                      entry={boxArtFor(manifest, game.gameId)}
                      name={game.name}
                      width={EXAMPLE_BOX}
                      height={EXAMPLE_BOX}
                      fit="contain"
                    />
                  </div>
                  <span
                    style={{
                      ...bodyFont,
                      fontSize: caption,
                      lineHeight: 1.25,
                      color: color.inkMuted,
                      textAlign: 'center',
                      // Two lines, then an ellipsis: a 56-character title would
                      // otherwise make its column taller than the two beside it.
                      display: '-webkit-box',
                      WebkitBoxOrient: 'vertical',
                      WebkitLineClamp: 2,
                      overflow: 'hidden',
                    }}
                  >
                    {game.name}
                  </span>
                </div>
              ))}
            </Stagger>
          </div>

          {/* Last of all, once the covers it is counting from have all landed. */}
          {more > 0 && (
            <Reveal delay={moreDelay(stat.examples.length, motion.stagger)}>
              <span
                style={{
                  ...bodyFont,
                  fontSize: caption * 1.05,
                  color: color.inkMuted,
                  display: 'block',
                  textAlign: 'center',
                }}
              >
                +{formatNumber(more)} more
              </span>
            </Reveal>
          )}
        </Stack>
      </SafeArea>
    </>
  );
};

export const TopThemeSlide: React.FC<SlideProps> = ({ stat }) => {
  if (stat?.id !== 'topTheme') return null;
  return <LeadCreditSlide stat={stat} eyebrow="Your year's theme" unit="games" />;
};

export const TopMechanicSlide: React.FC<SlideProps> = ({ stat }) => {
  if (stat?.id !== 'topMechanic') return null;
  return <LeadCreditSlide stat={stat} eyebrow="Top game mechanic" unit="games" />;
};
