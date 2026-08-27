import type { SlideId, WrappedStats } from '@/stats/types';
import { CORE_SLIDES } from '@/stats/index';
import { ALL_SLIDES, DEFAULT_SLIDE_IDS, SLIDE_LABELS } from '@/video/timeline';

/**
 * Which slides are in the cut, and in what order.
 *
 * Two lists rather than one grid of checkboxes: the slides that are in, in
 * play order and movable, and the ones that are out. That split is what makes
 * the arrangement visible — a checkbox grid can say *whether* a slide is in but
 * never *where*.
 *
 * A stat the player has no data for is shown disabled rather than hidden, so
 * "no nemesis slide" reads as a fact about their year rather than a missing
 * feature.
 */

interface Props {
  stats: WrappedStats | null;
  /** Ordered. */
  order: SlideId[];
  onToggle: (id: SlideId, on: boolean) => void;
  onMove: (id: SlideId, delta: number) => void;
  onReset: () => void;
  onAll: () => void;
}

export const SlidePicker: React.FC<Props> = ({ stats, order, onToggle, onMove, onReset, onAll }) => {
  const available = new Set(stats?.stats.map((s) => s.id) ?? []);

  const inCut = order.filter((id) => available.has(id));
  const outOfCut = ALL_SLIDES.filter(
    (id): id is SlideId =>
      id !== 'intro' && id !== 'outro' && !order.includes(id as SlideId),
  );

  return (
    <section className="panel">
      <h2>Slides</h2>

      <p className="panel-note">
        {stats
          ? `${inCut.length + 2} in the cut, including the intro and outro. Drag order with the arrows.`
          : 'Pick a player to see which stats they have.'}
      </p>

      <ol className="slide-order">
        <li className="slide-fixed">
          <span className="slide-index">1</span>
          <span className="slide-name">Intro</span>
          <span className="slide-tag is-muted">always</span>
        </li>

        {order.map((id, index) => {
          const has = available.has(id);
          return (
            <li key={id} className={has ? '' : 'is-unavailable'}>
              <span className="slide-index">{has ? inCut.indexOf(id) + 2 : '–'}</span>
              <span className="slide-name" title={SLIDE_LABELS[id]}>
                {SLIDE_LABELS[id]}
              </span>
              {!CORE_SLIDES.includes(id) && <span className="slide-tag">optional</span>}
              {stats && !has && <span className="slide-tag is-muted">no data</span>}

              <span className="slide-move">
                <button
                  className="icon"
                  onClick={() => onMove(id, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${SLIDE_LABELS[id]} earlier`}
                  title="Move earlier"
                >
                  ↑
                </button>
                <button
                  className="icon"
                  onClick={() => onMove(id, 1)}
                  disabled={index === order.length - 1}
                  aria-label={`Move ${SLIDE_LABELS[id]} later`}
                  title="Move later"
                >
                  ↓
                </button>
                <button
                  className="icon"
                  onClick={() => onToggle(id, false)}
                  aria-label={`Remove ${SLIDE_LABELS[id]}`}
                  title="Remove from the cut"
                >
                  ✕
                </button>
              </span>
            </li>
          );
        })}

        <li className="slide-fixed">
          <span className="slide-index">{inCut.length + 2}</span>
          <span className="slide-name">Outro</span>
          <span className="slide-tag is-muted">always</span>
        </li>
      </ol>

      {outOfCut.length > 0 && (
        <>
          <p className="panel-note slide-out-heading">Not in the cut</p>
          <ul className="slide-pool">
            {outOfCut.map((id) => {
              const has = available.has(id);
              return (
                <li key={id}>
                  <button
                    className="slide-add"
                    onClick={() => onToggle(id, true)}
                    disabled={stats !== null && !has}
                    title={
                      stats !== null && !has
                        ? 'This player has no data for that slide'
                        : 'Add to the cut'
                    }
                  >
                    + {SLIDE_LABELS[id]}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="slide-actions">
        <button className="link" onClick={onReset}>
          Reset to the default cut
        </button>
        <button className="link" onClick={onAll}>
          Add everything available
        </button>
      </div>
    </section>
  );
};

/** The default arrangement, for a fresh session. */
export const defaultSlideSelection = (): SlideId[] => [...DEFAULT_SLIDE_IDS];
