import type { WrappedStats } from '@/stats/types';
import { formatDay, formatDays, formatDuration, formatNumber, formatPercent } from '@/shared/format';

/**
 * Step 4 verification surface: shows what each module computed, in slide order,
 * so numbers can be checked against the BG Stats app before any slide exists.
 * Step 9 replaces this with the Remotion player preview.
 */
const describe = (stat: WrappedStats['stats'][number]): string => {
  switch (stat.id) {
    case 'totalPlays':
      return `${formatNumber(stat.plays)} plays · ${stat.nights} nights · ${stat.distinctGames} games`;
    case 'timePlayed':
      return (
        `~${formatDuration(stat.minutes)} (${formatDays(stat.minutes)} days), ` +
        `estimated from ${formatNumber(stat.playsCounted)} plays` +
        (stat.playsMissing > 0 ? ` · ${stat.playsMissing} with no known length` : '') +
        (stat.topGame ? ` · most on ${stat.topGame.name}` : '')
      );
    case 'topFiveByTime':
      return stat.games
        .map((g) => `${g.name} ${formatDuration(g.minutes)}`)
        .join(' · ');
    case 'distinctGames':
      return `${formatNumber(stat.count)} games: ${stat.games.map((g) => g.name).join(', ')}`;
    case 'topGame':
      return (
        `${stat.game.name} — ${stat.plays}×` +
        // The standing is what the quip under this slide is built on, so it is
        // worth being able to see it without rendering the video.
        (stat.standing
          ? ` · rank ${stat.standing.rank} of ${stat.standing.players} who played it`
          : '')
      );
    case 'topFive':
      return stat.games.map((g) => `${g.name} (${g.plays})`).join(' · ');
    case 'winRate':
      return `${stat.wins}W / ${stat.losses}L — ${formatPercent(stat.ratio)}${stat.coopOnly ? ' (coop only)' : ''}`;
    case 'topCoPlayer':
      return `${stat.name} — ${stat.shared} shared plays`;
    case 'nemesis':
      return `${stat.name} beat them ${stat.lossesTo}× in ${stat.headToHead} games`;
    case 'gamesLearned':
      return `${stat.count}: ${stat.games.map((g) => g.name).join(', ')}`;
    case 'topLocation':
      return `${stat.name} — ${stat.nights} nights`;
    case 'bestGame':
      return `${stat.game.name} — ${formatPercent(stat.ratio)} of ${stat.plays}`;
    case 'worstGame':
      return `${stat.game.name} — ${formatPercent(stat.ratio)} of ${stat.plays}`;
    case 'longestWinStreak':
      return `${stat.length} in a row`;
    case 'busiestDay':
      return `${formatDay(stat.day)} — ${stat.plays} plays`;
    case 'coPlayerCount':
      return `${stat.count} different people`;
    case 'firstAndLastPlay':
      return `${formatDay(stat.first.day)} ${stat.first.game.name} → ${formatDay(stat.last.day)} ${stat.last.game.name}`;
    case 'nightOwl':
      return `Peak ${String(stat.peakHour).padStart(2, '0')}:00 · ${formatPercent(stat.lateShare)} after 22:00`;
    case 'groupShare':
      return `${formatPercent(stat.ratio)} of all ${stat.total} plays`;
    case 'gameRecord':
      return [
        `${stat.game.name} — ${formatNumber(stat.score)}`,
        `${stat.highestWins ? 'highest' : 'lowest'} of ${stat.contenders} players`,
        `${stat.plays} plays`,
        stat.shared ? 'shared' : null,
        stat.otherRecords > 0 ? `+${stat.otherRecords} other records` : null,
      ]
        .filter(Boolean)
        .join(' · ');

    case 'highestScore':
      return `${formatNumber(stat.score)} in ${stat.game.name}${stat.won ? ' (won)' : ' (best of any result)'}`;

    // The five credit slides share one shape, so they share one line. Coverage
    // is shown because it is the guard that decides whether they appear at all.
    case 'topThemes':
    case 'topMechanics':
    case 'topDesigners':
    case 'topArtists':
    case 'topPublishers':
      return (
        stat.entries.map((e) => `${e.name} ${e.plays}× / ${e.games}g`).join(' · ') +
        ` — ${formatPercent(stat.coverage)} of plays matched`
      );

    // The two hero credit slides: the leader, and the games it is shown with.
    case 'topTheme':
    case 'topMechanic':
      return (
        `${stat.name} — ${stat.plays}× across ${stat.games} games: ` +
        stat.examples.map((g) => `${g.name} (${g.plays})`).join(', ')
      );
    default:
      return '';
  }
};

export const StatsInspector: React.FC<{ stats: WrappedStats }> = ({ stats }) => (
  <section className="panel">
    <h2>
      {stats.playerName} · {stats.rangeLabel}
    </h2>
    {stats.thin && (
      <p className="warn">
        Fewer than 3 plays in this range. The video will be thin — widen the dates.
      </p>
    )}
    {stats.stats.length === 0 ? (
      <p className="empty">No stats could be computed. Pick another player or range.</p>
    ) : (
      <ol className="stats">
        {stats.stats.map((stat) => (
          <li key={stat.id}>
            <span className="stat-id">
              {stat.id}
              {!stat.core && <em> optional</em>}
            </span>
            <span className="stat-value">{describe(stat)}</span>
          </li>
        ))}
      </ol>
    )}
  </section>
);
