import { AbsoluteFill, Sequence, Series } from 'remotion';
import type { Track } from '@/shared/audio';
import { quipFor } from '@/stats/quips';
import type { SlideId, WrappedStats } from '@/stats/types';
import { FontLoader, ThemeProvider, useFont, useTheme, useTypeScale } from '@/theme/ThemeContext';
import { themeFromBoxArt } from '@/theme/generate';
import { DEFAULT_THEME } from '@/theme/starters';
import type { Theme } from '@/theme/types';
import { VIDEO } from './config';
import { SignatureBackdrop } from './signature';
import { SLIDE_COMPONENTS, SlideShell } from './slides';
import { Soundtrack } from './Soundtrack';
import { Ambient } from './Ambient';
import { LeadIn } from './slides/LeadIn';
import { Quip } from './slides/Quip';
import { Texture, Vignette } from './Texture';
import { boxArtFor, useBoxArtManifest } from './useBoxArt';
import {
  DEFAULT_BPM,
  LEAD_IN_FRAMES,
  leadInFor,
  planTimeline,
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
}

/**
 * The video.
 *
 * The ground, texture and signature live here rather than inside the slides, so
 * they persist across every cut. Only the content changes from slide to slide —
 * that is what makes ten sequences read as one video rather than ten clips.
 */
const Stage: React.FC<{ stats: WrappedStats; timeline: Timeline; track: Track | null }> = ({
  stats,
  timeline,
  track,
}) => {
  const theme = useTheme();

  return (
    <AbsoluteFill style={{ backgroundColor: theme.color.bg }}>
      {/* Above the Series, so it runs on the video's absolute frame and drifts
          straight through every cut rather than restarting at each one. */}
      <Ambient color={theme.color} />
      <Texture texture={theme.texture} color={theme.color} />
      <SignatureBackdrop />
      <Vignette color={theme.color} />
      <Soundtrack track={track} />

      <Series>
        {timeline.slides.map((slide) => {
          const Component = SLIDE_COMPONENTS[slide.id];
          if (!Component) return null;
          const lead = leadInFor(slide.id);
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
              <SlideShell durationInFrames={slide.durationInFrames}>
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
              </SlideShell>
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
