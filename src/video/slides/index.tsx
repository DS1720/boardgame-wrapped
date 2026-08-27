import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { useTheme } from '@/theme/ThemeContext';
import type { TimelineSlideId } from '../timeline';
import {
  GamesLearnedSlide,
  IntroSlide,
  NemesisSlide,
  OutroSlide,
  TopCoPlayerSlide,
  TopFiveSlide,
  TopGameSlide,
  TopLocationSlide,
  TotalPlaysSlide,
  WinRateSlide,
  type SlideProps,
} from './Slides';
import {
  BestGameSlide,
  BusiestDaySlide,
  CoPlayerCountSlide,
  FirstAndLastPlaySlide,
  GroupShareSlide,
  HighestScoreSlide,
  LongestWinStreakSlide,
  NightOwlSlide,
  TimePlayedSlide,
  WorstGameSlide,
} from './OptionalSlides';

/**
 * The slide registry.
 *
 * `timeline.ts` decides what appears and for how long; this decides what draws
 * it. A stat id absent from here cannot reach the screen, which is what keeps
 * the default cut and the components from drifting apart.
 */
export const SLIDE_COMPONENTS: Record<TimelineSlideId, React.FC<SlideProps>> = {
  intro: IntroSlide,
  totalPlays: TotalPlaysSlide,
  timePlayed: TimePlayedSlide,
  topGame: TopGameSlide,
  topFive: TopFiveSlide,
  winRate: WinRateSlide,
  topCoPlayer: TopCoPlayerSlide,
  nemesis: NemesisSlide,
  gamesLearned: GamesLearnedSlide,
  topLocation: TopLocationSlide,
  outro: OutroSlide,

  // Off by default, on when the UI asks for them.
  longestWinStreak: LongestWinStreakSlide,
  bestGame: BestGameSlide,
  worstGame: WorstGameSlide,
  highestScore: HighestScoreSlide,
  coPlayerCount: CoPlayerCountSlide,
  busiestDay: BusiestDaySlide,
  nightOwl: NightOwlSlide,
  firstAndLastPlay: FirstAndLastPlaySlide,
  groupShare: GroupShareSlide,
};

/** Frames a slide spends leaving. Short — the exit is punctuation, not an event. */
export const EXIT_FRAMES = 10;

/**
 * The single transition, reused on every slide.
 *
 * The plan is blunt about this: a different effect per slide is the clearest
 * tell of an assembled video. So there is exactly one — content rises in on the
 * theme's spring and lifts away on the same spring — and the ground, texture
 * and signature never move between slides. What changes is the content; the
 * room it sits in does not.
 */
export const SlideShell: React.FC<{ durationInFrames: number; children: React.ReactNode }> = ({
  durationInFrames,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { motion } = useTheme();

  const exit = spring({
    frame: frame - (durationInFrames - EXIT_FRAMES),
    fps,
    config: { stiffness: motion.stiffness, damping: motion.damping },
    durationInFrames: EXIT_FRAMES,
  });

  return (
    <AbsoluteFill
      style={{
        opacity: interpolate(exit, [0, 1], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        transform: `translateY(${-exit * 34}px)`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

export * from './Slides';
export * from './OptionalSlides';
export * from './layout';
