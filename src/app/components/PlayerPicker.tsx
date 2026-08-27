import type { PlayerSummary } from '@/ingest/select';
import { THIN_PLAY_THRESHOLD } from '@/stats/index';

interface Props {
  players: PlayerSummary[];
  selected: number | null;
  onSelect: (id: number) => void;
}

export const PlayerPicker: React.FC<Props> = ({ players, selected, onSelect }) => (
  <section className="panel">
    <h2>Player</h2>
    {players.length === 0 ? (
      <p className="empty">Nobody played in this range. Widen the dates.</p>
    ) : (
      <ul className="players">
        {players.map((p) => (
          <li key={p.id}>
            <button
              className={p.id === selected ? 'player is-active' : 'player'}
              onClick={() => onSelect(p.id)}
            >
              <span>{p.name}</span>
              <span className="count">
                {p.playCount}
                {p.playCount < THIN_PLAY_THRESHOLD && <em title="Too few plays for a full video"> thin</em>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    )}
  </section>
);
