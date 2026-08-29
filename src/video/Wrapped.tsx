import { AbsoluteFill, Easing, interpolate, Sequence, Series, useCurrentFrame } from 'remotion';
import type { Track } from '@/shared/audio';
import { quipFor } from '@/stats/quips';
import type { SlideId, WrappedStats } from '@/stats/types';
import { FontLoader, ThemeProvider, useFont, useTheme, useTypeScale } from '@/theme/ThemeContext';
import { themeFromBoxArt } from '@/theme/generate';
import { blendPalettes, slidePalettes } from '@/theme/palette';
import { DEFAULT_THEME } from '@/theme/starters';
import type { Theme, ThemeColor } from '@/theme/types';
import { CARD_FADE_FRAMES, VIDEO } from './config';
import { SignatureBackdrop } from './signature';
import { SLIDE_COMPONENTS, SlideShell } from './slides';
import { Soundtrack } from './Soundtrack';
import { Ambient } from './Ambient';
import { LeadIn } from './slides/LeadIn';
import { Quip, QuipSpace } from './slides/Quip';
import { Texture, Vignette } from './Texture';
import { boxArtFor, useBoxArtManifest } from './useBoxArt';
import {
  DEFAULT_BPM,
  LEAD_IN_FRAMES,
  planTimeline,
  slideIndexAt,
  type SlideBarOverrides,
  type Timeline,
  type TimelineSlideId,
} from './timeline';

export interface WrappedProps {
  stats?: WrappedStats | null;
  theme?: Theme | null;
  /** Recolor each slide around its own box art. Step 6's fourth theme mode. */
  boxArtMode?: boolean;
  /**
   * The soundtrack. Its detected tempo drives the slide grid, so passing a
   * track re-times the whole video — a slower song makes a longer one.
   */
  track?: Track | null;
  /** Overrides the track's tempo. Ignored when a track is supplied. */
  bpm?: number;
  /** Which slides to include, in order. Defaults to the plan's ten-slide cut. */
  cut?: TimelineSlideId[] | null;
  /** Per-slide lengths chosen in the UI. Absent ids keep their default. */
  bars?: SlideBarOverrides | null;
}

/**
 * The video.
 *
 * The ground, texture and signature live here rather than inside the slides, so
 * a slide never has to draw its own — but the *colour* of all three is now the
 * slide's rather than the video's. `slidePalettes` gives each one a palette from
 * the theme's cycle, and it changes on the cut with no transition at all: the
 * snap between two grounds is the effect, and fading between them would turn
 * six cards back into one long one.
 *
 * The slides themselves are untouched by this. Each sequence is wrapped in a
 * provider carrying its own palette, so a slide still asks `useTheme()` and
 * still never names a colour.
 */

/**
 * The palette at a frame, part way from the card before it if it has just
 * turned over.
 *
 * One function, used twice: `Stage` calls it for the backdrop layers, which sit
 * outside the `<Series>` and only know the absolute frame, and `SlideColors`
 * calls it inside each sequence, where the frame has already been rebased. Two
 * places computing this separately is two places to disagree about what colour
 * the card is, and they would disagree exactly during the transition.
 */
const paletteAt = (palettes: ThemeColor[], index: number, localFrame: number): ThemeColor => {
  const to = palettes[index] ?? palettes[0];
  const from = palettes[index - 1] ?? to;
  /*
    Eased through the middle, not linear.

    Two saturated grounds have a muddy midpoint — lime to magenta passes through
    amber — and there is no mixing curve that avoids it. What can be avoided is
    *dwelling* there: an ease-in-out is slow at both ends and quick through the
    centre, so the card spends its time looking like one colour or the other and
    only a frame or two looking like neither.
  */
  const t = interpolate(localFrame, [0, CARD_FADE_FRAMES], [0, 1], {
    easing: Easing.inOut(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return blendPalettes(from, to, t);
};

/** Carries one slide's palette, arriving from the card before it. */
const SlideColors: React.FC<{
  palettes: ThemeColor[];
  index: number;
  children: React.ReactNode;
}> = ({ palettes, index, children }) => {
  // Rebased by `Series.Sequence`, so this is frames since the cut.
  const frame = useCurrentFrame();
  const theme = useTheme();
  return (
    <ThemeProvider theme={{ ...theme, color: paletteAt(palettes, index, frame) }}>
      {children}
    </ThemeProvider>
  );
};
const Stage: React.FC<{ stats: WrappedStats; timeline: Timeline; track: Track | null }> = ({
  stats,
  timeline,
  track,
}) => {
  const theme = useTheme();
  const frame = useCurrentFrame();

  const palettes = slidePalettes(theme, timeline.slides.length);
  // The backdrop layers sit outside the `<Series>`, so they cannot read the
  // sequence's provider — they take the palette of whichever slide the video is
  // on. Same array, same index, so the ground under the content and the content
  // itself can never disagree about what colour this card is.
  const index = slideIndexAt(timeline, frame);
  const current = {
    ...theme,
    color: paletteAt(palettes, index, frame - (timeline.slides[index]?.from ?? 0)),
  };

  return (
    <AbsoluteFill style={{ backgroundColor: current.color.bg }}>
      <ThemeProvider theme={current}>
        {/* Above the Series, so it runs on the video's absolute frame and drifts
            straight through every cut rather than restarting at each one. It is
            recoloured on the cut but never repositioned, so the drift carries
            across the snap instead of resetting with it. */}
        <Ambient color={current.color} />
        <Texture texture={current.texture} color={current.color} />
        <SignatureBackdrop />
        <Vignette color={current.color} />
      </ThemeProvider>
      <Soundtrack track={track} />

      <Series>
        {timeline.slides.map((slide, index) => {
          const Component = SLIDE_COMPONENTS[slide.id];
          if (!Component) return null;
          const lead = slide.leadIn;
          // The bookends are not data slides; an aside under them would be a
          // remark about nothing.
          const quip =
            slide.id === 'intro' || slide.id === 'outro'
              ? null
              : quipFor(slide.id as SlideId, stats);

          return (
            <Series.Sequence
              key={`${slide.id}-${slide.from}`}
              durationInFrames={slide.durationInFrames}
            >
              <SlideColors palettes={palettes} index={index}>
                <SlideShell durationInFrames={slide.durationInFrames}>
                  <QuipSpace has={quip !== null}>
                    {lead ? (
                      <>
                        <LeadIn text={lead} />
                        {/* Offsetting with a Sequence rather than passing a delay
                            means the slide's own frame still starts at zero, so
                            every BEAT inside it keeps working unchanged — and the
                            aside is cued from the content, not from the line. */}
                        <Sequence from={LEAD_IN_FRAMES} layout="none">
                          <Component stat={slide.stat} stats={stats} />
                          <Quip text={quip} />
                        </Sequence>
                      </>
                    ) : (
                      <>
                        <Component stat={slide.stat} stats={stats} />
                        <Quip text={quip} />
                      </>
                    )}
                  </QuipSpace>
                </SlideShell>
              </SlideColors>
            </Series.Sequence>
          );
        })}
      </Series>
    </AbsoluteFill>
  );
};

/** Shown in the Studio and the preview before an export is loaded. */
const Empty: React.FC = () => {
  const theme = useTheme();
  const displayFont = useFont('display');
  const bodyFont = useFont('body');
  const { display, body } = useTypeScale();

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.color.bg,
        padding: VIDEO.safeMargin,
        justifyContent: 'center',
      }}
    >
      <Texture texture={theme.texture} color={theme.color} />
      <SignatureBackdrop />
      <h1 style={{ ...displayFont, fontSize: display * 0.5, color: theme.color.ink, margin: 0 }}>
        Board Game Wrapped
      </h1>
      <p style={{ ...bodyFont, fontSize: body, color: theme.color.accent, marginTop: 20 }}>
        Drop an export to begin
      </p>
    </AbsoluteFill>
  );
};

export const Wrapped: React.FC<WrappedProps> = ({
  stats = null,
  theme = null,
  boxArtMode = false,
  track = null,
  bpm = DEFAULT_BPM,
  cut = null,
  bars = null,
}) => {
  const base = theme ?? DEFAULT_THEME;
  const manifest = useBoxArtManifest();

  // Box-art mode colors the video from the top game's cover — the one game that
  // characterizes the whole year.
  const topGame = stats?.stats.find((s) => s.id === 'topGame');
  const dominant = topGame?.id === 'topGame' ? boxArtFor(manifest, topGame.game.gameId)?.dominant : null;
  const resolved = boxArtMode ? themeFromBoxArt(base, dominant) : base;

  // The track's tempo wins: the point of step 8 is that the video is cut to the
  // music, not that the music is stretched to the video.
  const timeline = planTimeline(stats, {
    bpm: track?.bpm ?? bpm,
    ...(cut ? { cut } : {}),
    ...(bars ? { bars } : {}),
  });

  return (
    <ThemeProvider theme={resolved}>
      <FontLoader theme={resolved}>
        {stats && timeline.slides.length > 0 ? (
          <Stage stats={stats} timeline={timeline} track={track} />
        ) : (
          <Empty />
        )}
      </FontLoader>
    </ThemeProvider>
  );
};
