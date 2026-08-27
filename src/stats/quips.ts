import { formatNumber } from '@/shared/format';
import type { SlideId } from './types';
import type { Stat, WrappedStats } from './types';

/**
 * The small line that arrives a beat after a stat has landed.
 *
 * Every one is derived from the number it sits under, so it is a remark about
 * *this* year rather than filler that would fit anyone's. That is the whole
 * point: a generic quip under a specific number makes the number feel generic
 * too.
 *
 * Returns null wherever there is nothing worth saying — a slide with no line is
 * better than a slide with a limp one, and not every stat gets one.
 */

const find = <T extends Stat['id']>(stats: WrappedStats, id: T) =>
  stats.stats.find((s) => s.id === id) as Extract<Stat, { id: T }> | undefined;

/** Days in the range, for "once every N days" style remarks. */
const rangeDays = (stats: WrappedStats): number => {
  const from = new Date(`${stats.rangeFrom}T00:00:00`).getTime();
  const to = new Date(`${stats.rangeTo}T00:00:00`).getTime();
  const days = Math.round((to - from) / 86_400_000) + 1;
  return Number.isFinite(days) && days > 0 ? days : 365;
};

/** The extended Lord of the Rings trilogy, in minutes. A unit everyone knows. */
const LOTR_MINUTES = 726;

export const quipFor = (slideId: SlideId, stats: WrappedStats | null): string | null => {
  if (!stats) return null;
  const days = rangeDays(stats);
  const total = find(stats, 'totalPlays');

  switch (slideId) {
    case 'totalPlays': {
      if (!total) return null;
      const perWeek = total.plays / (days / 7);
      if (perWeek >= 1) return `That is ${perWeek.toFixed(1)} a week. Every week.`;
      return `Roughly one every ${Math.round(days / Math.max(1, total.plays))} days.`;
    }

    case 'timePlayed': {
      const time = find(stats, 'timePlayed');
      if (!time) return null;
      const trilogies = time.minutes / LOTR_MINUTES;
      if (trilogies >= 2) {
        return `You could have watched all of Lord of the Rings ${Math.floor(trilogies)} times.`;
      }
      return 'And not one minute of it wasted.';
    }

    case 'topGame': {
      const top = find(stats, 'topGame');
      if (!top || top.plays < 3) return null;
      const every = Math.round(days / top.plays);
      return `Once every ${every} days, on average. Nobody is surprised.`;
    }

    case 'topFive': {
      const five = find(stats, 'topFive');
      if (!five || !total || five.games.length < 5) return null;
      const share = five.games.slice(0, 5).reduce((sum, g) => sum + g.plays, 0) / total.plays;
      return `Five games out of ${formatNumber(total.distinctGames)} — and ${Math.round(
        share * 100,
      )}% of your year.`;
    }

    case 'winRate': {
      const rate = find(stats, 'winRate');
      if (!rate || rate.coopOnly) return null;
      if (rate.ratio >= 0.5) return 'People have started checking the rules.';
      if (rate.ratio >= 0.33) return 'Respectable. Not suspicious.';
      return 'Somebody has to lose. You were very generous about it.';
    }

    case 'topCoPlayer': {
      const co = find(stats, 'topCoPlayer');
      if (!co || !total) return null;
      const share = Math.round((co.shared / total.plays) * 100);
      if (share >= 80) return `${share}% of your games. At this point it is a duo.`;
      return `That is ${share}% of everything you played.`;
    }

    case 'nemesis': {
      const nem = find(stats, 'nemesis');
      if (!nem) return null;
      return 'And you keep inviting them back.';
    }

    case 'gamesLearned': {
      const learned = find(stats, 'gamesLearned');
      if (!learned || learned.count < 4) return null;
      const every = Math.round(days / learned.count);
      return `A brand new rulebook every ${every} days.`;
    }

    case 'topLocation': {
      const loc = find(stats, 'topLocation');
      if (!loc || loc.nights < 5) return null;
      return 'You could find the coasters blindfolded.';
    }

    case 'coPlayerCount': {
      const count = find(stats, 'coPlayerCount');
      if (!count || count.count < 10) return null;
      return `That is a lot of people to explain rules to.`;
    }

    case 'busiestDay': {
      const day = find(stats, 'busiestDay');
      if (!day || day.plays < 4) return null;
      return `${formatNumber(day.plays)} in one day. Somebody cancelled their plans.`;
    }

    case 'nightOwl': {
      const owl = find(stats, 'nightOwl');
      if (!owl) return null;
      if (owl.lateShare >= 0.5) return 'Sleep is for people with fewer games.';
      return 'A reasonable hour, mostly.';
    }

    case 'longestWinStreak': {
      const streak = find(stats, 'longestWinStreak');
      if (!streak || streak.length < 3) return null;
      return 'Then somebody finally stopped you.';
    }

    case 'bestGame': {
      const best = find(stats, 'bestGame');
      if (!best) return null;
      return 'Suggest it more often. Nobody will notice.';
    }

    case 'worstGame': {
      const worst = find(stats, 'worstGame');
      if (!worst) return null;
      return `${worst.plays} attempts. Admirable, really.`;
    }

    case 'highestScore': {
      const score = find(stats, 'highestScore');
      if (!score) return null;
      return 'Still bringing it up at parties.';
    }

    case 'groupShare': {
      const share = find(stats, 'groupShare');
      if (!share) return null;
      if (share.ratio >= 0.6) return 'Barely missed a night.';
      return null;
    }

    default:
      return null;
  }
};
