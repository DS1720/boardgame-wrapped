import { useMemo, useState } from 'react';
import { DropZone } from './components/DropZone';
import { PlayerPicker } from './components/PlayerPicker';
import { RangePicker } from './components/RangePicker';
import { StatsInspector } from './components/StatsInspector';
import { useDataset } from './state/useDataset';
import { allTimeRange, playersInPlays, playsInRange } from '@/ingest/select';
import { buildWrappedStats, MODULES } from '@/stats/index';
import type { DateRange } from '@/shared/types';

export const App: React.FC = () => {
  const { dataset, error, loading, load, clear } = useDataset();
  const [range, setRange] = useState<DateRange | null>(null);
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);

  const activeRange = useMemo(() => {
    if (!dataset) return null;
    return range ?? allTimeRange(dataset);
  }, [dataset, range]);

  const players = useMemo(() => {
    if (!dataset || !activeRange) return [];
    return playersInPlays(playsInRange(dataset.plays, activeRange));
  }, [dataset, activeRange]);

  const stats = useMemo(() => {
    if (!dataset || !activeRange || playerId === null) return null;
    return buildWrappedStats(dataset, playerId, activeRange, MODULES.map((m) => m.id));
  }, [dataset, activeRange, playerId]);

  if (loading) return <main className="shell" />;

  return (
    <main className="shell">
      <header>
        <h1>Board Game Wrapped</h1>
        <p>Mobile format · 1080 × 1920 · 30 fps</p>
      </header>

      {!dataset ? (
        <>
          <DropZone onFile={load} />
          {error && <p className="error">{error}</p>}
        </>
      ) : (
        <>
          <section className="panel summary">
            <p>
              {dataset.counts.plays} plays · {dataset.counts.players} players ·{' '}
              {dataset.counts.games} games
              {dataset.counts.ignored > 0 && ` · ${dataset.counts.ignored} ignored`}
            </p>
            <button className="link" onClick={clear}>
              Load a different export
            </button>
          </section>

          {activeRange && (
            <RangePicker
              dataset={dataset}
              range={activeRange}
              onChange={setRange}
              error={rangeError}
              onError={setRangeError}
            />
          )}

          <PlayerPicker players={players} selected={playerId} onSelect={setPlayerId} />

          {stats ? (
            <StatsInspector stats={stats} />
          ) : (
            <section className="panel">
              <p className="empty">Pick a player to see their stats.</p>
            </section>
          )}
        </>
      )}
    </main>
  );
};
