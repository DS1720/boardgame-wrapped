import { daysBetween, formatNumber } from '@/shared/format';
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

/** Days in the month a day key falls in. */
const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

/** `[year, month, day]` from a `"YYYY-MM-DD"` day key. */
const partsOf = (day: string) => day.split('-').map(Number);

/**
 * The period the wrapped covers, worded to finish a sentence.
 *
 * "...everyone who played it **this year**" is only right for a year, and this
 * app happily takes a month, a quarter, or an arbitrary pair of dates. Saying
 * "this year" over a six-week range would be the one kind of wrong that nobody
 * checks.
 *
 * **"This year" means a calendar year, and nothing else.** September to
 * September is twelve months, but it is not a year anybody refers to as "this
 * year" — it is the last twelve months, and that is what it says. Same rule one
 * unit down: "this month" is the first to the last of one month, and a span
 * that merely happens to be about a month long is counted in weeks.
 *
 * Everything that is not one of those two is phrased as "in the last N ..." and
 * counted in the largest unit that does not round to one, so the sentence never
 * lands on "in the last 1 months". Past twelve months it switches to years,
 * rounded to the nearest — eighteen months is two years, thirteen is one.
 *
 * Derived from the dates rather than from `rangeLabel`, because the label is
 * renameable — someone can call a range "Spring in Vienna" — and a phrase built
 * from a name the user typed is not a phrase about time.
 */
export const rangePhrase = (stats: WrappedStats): string => {
  const [fromYear, fromMonth, fromDay] = partsOf(stats.rangeFrom);
  const [toYear, toMonth, toDay] = partsOf(stats.rangeTo);

  const wholeMonth =
    fromYear === toYear &&
    fromMonth === toMonth &&
    fromDay === 1 &&
    toDay === daysInMonth(toYear, toMonth);

  if (fromYear === toYear && fromMonth === 1 && fromDay === 1 && toMonth === 12 && toDay === 31) {
    return 'this year';
  }
  if (wholeMonth) return 'this month';

  const days = rangeDays(stats);
  if (days <= 1) return 'today';
  if (days <= 13) return `in the last ${days} days`;
  // Under two months, weeks are the unit that still divides into more than one.
  if (days < 60) return `in the last ${Math.round(days / 7)} weeks`;

  // The average Gregorian month, so twelve of them is a year rather than 360
  // days. September to September has to come out as 12, not 11.
  const months = Math.round(days / 30.44);
  if (months <= 12) return `in the last ${months} months`;

  // Past twelve months nobody counts in months any more — "in the last 19
  // months" is arithmetic, not a period. Rounded to the nearest year, so 18
  // months is two and 13 months is one.
  const years = Math.round(days / 365.25);
  // "in the last 1 years" is the obvious failure and "in the last 1 year"
  // is barely better; a single year is just "the last year".
  return years <= 1 ? 'in the last year' : `in the last ${years} years`;
};

/**
 * The player's standing in their top game, as a "top N%".
 *
 * Rounded **up**, because rounding the other way overstates the result: a rank
 * of 2 in 12 is 16.7%, and calling that "top 16%" claims a place the player
 * does not hold. Null above half the field — "top 67%" is not a compliment,
 * and a line that lands as one is worse than no line at all.
 */
export const MAX_STANDING_SHARE = 50;

export const topGameShare = (
  standing: { rank: number; players: number } | null,
): number | null => {
  if (!standing || standing.players <= 0) return null;
  const share = Math.ceil((standing.rank / standing.players) * 100);
  return share > MAX_STANDING_SHARE ? null : share;
};

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
      const share = topGameShare(top.standing);
      if (share !== null) {
        return `You were in the top ${share}% of everyone who played it ${rangePhrase(stats)}.`;
      }
      // No usable pool: the group is too small for a percentage to say
      // anything, so fall back to the rate rather than invent a ranking.
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

    // `topFiveByTime` has no line. It used to carry the play-count five's
    // remark in this slide's unit — "Five games, and 26% of your time at the
    // table" — which was a third way of saying what the five durations beside
    // the games already say. The slide is centred rather than bottom-anchored,
    // so it does not need the aside's band reserved to sit where it should.

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

    /*
      The one slide that always gets a line.

      Everywhere else a missing quip is the right answer — a slide with no
      remark beats one with a limp remark. This slide is the exception because
      the *layout* depends on it: a slide with an aside gives up `QUIP_BAND` of
      height for it, and without one the content drops to the bottom of the
      frame. So "People played with" sat in a visibly different place depending
      on how many people somebody had played with, which is a number they have
      no control over.

      The count is at least 1 whenever the stat exists — `coPlayerCount`
      returns null for a solo-only year — so the tiers below cover every case
      the slide can be shown for.
    */
    case 'coPlayerCount': {
      const count = find(stats, 'coPlayerCount');
      if (!count) return null;
      if (count.count >= 10) return `That is a lot of people to explain rules to.`;
      // Each line is true of its own band and of no other: one person is a
      // pair, four others still fit one table, nine do not.
      if (count.count >= 5) return 'More than one table between you.';
      if (count.count >= 2) return 'Everybody fits around one table.';
      return 'Just the two of you, all year.';
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
      // A high score in a game you lost is not a boast, so it does not get the
      // boasting line.
      return score.won
        ? 'Still bringing it up at parties.'
        : 'A lot of points, and somebody else still won.';
    }

    case 'firstAndLastPlay': {
      const ends = find(stats, 'firstAndLastPlay');
      if (!ends) return null;
      const span = daysBetween(ends.first.day, ends.last.day);
      // A single evening in range has no span to remark on, and "0 days" is a
      // worse line than none.
      if (span === null || span < 7) return null;

      // The best line this slide has, and it costs nothing to check: opening
      // and closing a year with the same game is a real thing about a person,
      // and it says more than any number the slide is already showing.
      if (ends.first.game.gameId === ends.last.game.gameId) {
        return `You opened and closed with ${ends.first.game.name}. Full circle.`;
      }

      // Second best: the year had a first game and a last one, and everything
      // in between is what the rest of the video was about.
      if (total && total.distinctGames >= 10) {
        return `${formatNumber(total.distinctGames)} different games happened in between.`;
      }
      if (total && total.nights >= 10) {
        return `${formatNumber(total.nights)} evenings between those two.`;
      }
      return `${formatNumber(span)} days, bookended.`;
    }

    case 'gameRecord': {
      const record = find(stats, 'gameRecord');
      if (!record) return null;
      /*
        Reordered when the "the highest of 12 players · over 21 plays" caption
        came off this slide.

        Two consequences. The other-records count is now the caption under the
        number, so a quip counting it again is the same fact twice — the `>= 5`
        branch keeps the flourish and drops the figure, and the `>= 1` branch is
        gone entirely. And the contenders count and the highest/lowest rule left
        the slide with that caption, so the branches carrying them come first:
        this is the only place either can still be said.
      */
      if (!record.highestWins) return 'Lower is better in this one. Nobody went lower.';
      if (record.shared) return 'Somebody matched it exactly. Nobody has beaten it.';
      if (record.contenders >= 5) return `${record.contenders} people tried. One succeeded.`;
      if (record.otherRecords >= 5) return 'Somebody check the score sheets.';
      return 'The number to beat.';
    }

    case 'groupShare': {
      const share = find(stats, 'groupShare');
      if (!share) return null;
      if (share.ratio >= 0.6) return 'Barely missed a night.';
      return null;
    }

    /*
      The credit slides.

      Each line is about the shape of its own list — how far the leader is
      ahead, or how far it reaches — because the five names and five numbers
      already say everything a restatement could. Where the list is flat there
      is nothing to remark on, and these return null rather than reaching.
    */

    case 'topThemes': {
      const themes = find(stats, 'topThemes');
      if (!themes || themes.entries.length < 3) return null;
      const [first, second] = themes.entries;
      // A leader well clear of second place is a taste; a photo finish is not.
      if (first.plays >= second.plays * 2) return 'You have a type.';
      if (first.games >= 8) return `${first.name} kept turning up. You did not go looking for it.`;
      return null;
    }

    case 'topMechanics': {
      const mech = find(stats, 'topMechanics');
      if (!mech || mech.entries.length < 3) return null;
      const first = mech.entries[0];
      if (first.games < 6) return null;
      return `${first.name}, over and over. You did not pick that by accident.`;
    }

    /*
      None of the five restate the games count. Every credit row carries it
      under the name now, so a line beneath the list repeating row one's number
      is the same fact told twice — and the second telling is what reads as
      filler. The name is fair game; the number is not.
    */

    case 'topDesigners': {
      const people = find(stats, 'topDesigners');
      if (!people) return null;
      const first = people.entries[0];
      // The whole point of the games filter: this is somebody they came back
      // to across different boxes, not the credits of their most-played game.
      if (first.games >= 3) return 'You keep picking the same designer. Probably not by accident.';
      if (people.entries.length >= 5) return 'None of them know you exist.';
      return null;
    }

    case 'topArtists': {
      const artists = find(stats, 'topArtists');
      if (!artists) return null;
      if (artists.entries[0].games < 4) return null;
      return 'You have been looking at one person’s work all year.';
    }

    case 'topPublishers': {
      const pubs = find(stats, 'topPublishers');
      if (!pubs || pubs.entries.length < 2) return null;
      const [first, second] = pubs.entries;
      /*
        Two tiers, because one left this slide bare.

        It used to need three entries *and* a leader twice the runner-up, which
        measured on the real export is 1 player in 9 — the other eight ended
        the slide on a list with nothing under it. The three-entry guard was
        the worse half: a two-name list is still a contest, and one player was
        losing the line on a 12-to-2 lead purely for being short.

        Neither tier states a number. The rows already carry the plays and the
        games, and the second telling is what reads as filler — so the wide
        lead is described and the narrow one is named. "Just ahead of" is only
        ever said below 2x, where it is true.
      */
      if (first.plays >= second.plays * 2) return `${first.name} had a very good year at your table.`;
      return `${first.name}, just ahead of ${second.name}.`;
    }

    default:
      return null;
  }
};
