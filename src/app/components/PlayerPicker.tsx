import type { PlayerSummary } from '@/ingest/select';
import { THIN_PLAY_THRESHOLD } from '@/stats/index';
import {
  isRenamed,
  MAX_PLAYER_NAME_RAW,
  overrideFor,
  type PlayerNameOverrides,
  rawFor,
} from '../state/playerNames';

interface Props {
  players: PlayerSummary[];
  selected: number | null;
  onSelect: (id: number) => void;
  /** Names typed by hand. Sparse — most players have none. */
  names: PlayerNameOverrides;
  onRename: (id: number, name: string) => void;
}

/**
 * Pick a player, and say what the video should call them.
 *
 * The name in the export is whatever somebody typed when they first added a
 * player, and the video says it in the intro, prints it on the square and puts
 * it in the filename. The field here is how that gets fixed without editing
 * the export — which is personal data the app is careful never to write to.
 *
 * The real name stays visible beside the new one rather than being replaced by
 * it. This list is also how you find somebody, and a row that showed only the
 * override would be unsearchable by the name the rest of BG Stats uses.
 */
export const PlayerPicker: React.FC<Props> = ({
  players,
  selected,
  onSelect,
  names,
  onRename,
}) => (
  <section className="panel">
    <h2>Player</h2>
    {players.length === 0 ? (
      <p className="empty">Nobody played in this range. Widen the dates.</p>
    ) : (
      <>
        <p className="panel-note">
          The video says this name. Type a different one to use it instead.
        </p>
        <ul className="players">
          {players.map((p) => {
            const renamed = isRenamed(names, p.id, p.name);
            return (
              <li key={p.id}>
                <button
                  className={p.id === selected ? 'player is-active' : 'player'}
                  onClick={() => onSelect(p.id)}
                >
                  <span className="player-name">
                    {p.name}
                    {/* The override is shown here as well as in the field, so
                        the list still says what the video will call somebody
                        when the column is too narrow to read the input. */}
                    {renamed && <em className="player-alias"> ({overrideFor(names, p.id)})</em>}
                  </span>
                  <span className="count">
                    {p.playCount}
                    {p.playCount < THIN_PLAY_THRESHOLD && (
                      <em title="Too few plays for a full video"> thin</em>
                    )}
                  </span>
                </button>
                {/* Outside the button: a text field inside one is invalid, and
                    every click in it would select the player. */}
                <input
                  className="player-rename"
                  type="text"
                  value={rawFor(names, p.id)}
                  maxLength={MAX_PLAYER_NAME_RAW}
                  // The real name in the placeholder, never as the value:
                  // seeding the box with it would make every player look
                  // renamed, and there would be no way to say "use the export's
                  // name" short of deleting the exact string back out.
                  placeholder={p.name}
                  aria-label={`Name to show in the video instead of ${p.name}`}
                  onChange={(e) => onRename(p.id, e.target.value)}
                />
              </li>
            );
          })}
        </ul>
      </>
    )}
  </section>
);
