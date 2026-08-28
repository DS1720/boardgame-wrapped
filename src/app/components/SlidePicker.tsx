import { useState } from 'react';
import type { SlideId, WrappedStats } from '@/stats/types';
import { CORE_SLIDES } from '@/stats/index';
import {
  ALL_SLIDES,
  DEFAULT_SLIDE_IDS,
  LINKED_PAIRS,
  SLIDE_LABELS,
  type TimelineSlideId,
} from '@/video/timeline';

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
 *
 * Rows are dragged to reorder. The arrows stay: a drag is faster for moving a
 * slide across the list, an arrow is exact for moving it one place, and the
 * arrows are the only one of the two that works from a keyboard.
 *
 * A linked pair moves as one. The leading slide of a pair is fixed in front of
 * its partner, so it is not itself movable — dragging it could only ever put it
 * back where it was. Moving the partner takes it along.
 */

interface Props {
  stats: WrappedStats | null;
  /** Ordered. */
  order: SlideId[];
  onToggle: (id: SlideId, on: boolean) => void;
  onMove: (id: SlideId, delta: number) => void;
  /** Drop `id` at position `index` in the arrangement. */
  onReorder: (id: SlideId, index: number) => void;
  /** The slide the preview is currently showing, marked in the list. */
  playing?: TimelineSlideId | null;
  onReset: () => void;
  onAll: () => void;
}

/**
 * The slide each linked pair is pinned in front of, for the note on its row.
 *
 * Narrowed to SlideId: a pair is always two stat slides, never a bookend, which
 * the timeline's wider TimelineSlideId cannot say on its own.
 */
const LINKED_TO = new Map(
  LINKED_PAIRS.map(([first, second]) => [first as SlideId, second as SlideId]),
);

export const SlidePicker: React.FC<Props> = ({
  stats,
  order,
  onToggle,
  onMove,
  onReorder,
  playing = null,
  onReset,
  onAll,
}) => {
  const available = new Set(stats?.stats.map((s) => s.id) ?? []);

  // The row being dragged, and the row it is currently over. Both are cleared
  // on drop and on dragend — a drag abandoned outside the list must not leave
  // a row looking like it is still moving.
  const [dragging, setDragging] = useState<SlideId | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const endDrag = () => {
    setDragging(null);
    setOver(null);
  };

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
          ? `${inCut.length + 2} in the cut, including the intro and outro. Drag a row to reorder, or use the arrows.`
          : 'Pick a player to see which stats they have.'}
      </p>

      <ol className="slide-order">
        <li className={`slide-fixed${playing === 'intro' ? ' is-playing' : ''}`}>
          <span className="slide-index">1</span>
          <span className="slide-name">Intro</span>
          <span className="slide-tag is-muted">always</span>
        </li>

        {order.map((id, index) => {
          const has = available.has(id);
          const linkedTo = LINKED_TO.get(id);
          // Pinned in front of its partner, and so not movable on its own.
          const pinned = linkedTo !== undefined && order.includes(linkedTo);

          const classes = [
            has ? '' : 'is-unavailable',
            playing === id ? 'is-playing' : '',
            pinned ? 'is-pinned' : '',
            dragging === id ? 'is-dragging' : '',
            over === index && dragging !== null && dragging !== id ? 'is-over' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <li
              key={id}
              className={classes}
              draggable={!pinned}
              onDragStart={(event) => {
                setDragging(id);
                event.dataTransfer.effectAllowed = 'move';
                // Firefox starts no drag at all without payload on the transfer.
                event.dataTransfer.setData('text/plain', id);
              }}
              onDragOver={(event) => {
                if (!dragging) return;
                // Without preventDefault the browser refuses the drop outright.
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setOver(index);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragging && dragging !== id) onReorder(dragging, index);
                endDrag();
              }}
              onDragEnd={endDrag}
            >
              <span className="slide-grip" aria-hidden="true">
                {pinned ? '↳' : '⠿'}
              </span>
              <span className="slide-index">{has ? inCut.indexOf(id) + 2 : '–'}</span>
              <span className="slide-name" title={SLIDE_LABELS[id]}>
                {SLIDE_LABELS[id]}
              </span>
              {!CORE_SLIDES.includes(id) && <span className="slide-tag">optional</span>}
              {stats && !has && <span className="slide-tag is-muted">no data</span>}
              {pinned && (
                <span
                  className="slide-tag is-muted"
                  title={`Always plays just before ${SLIDE_LABELS[linkedTo]}, and moves with it`}
                >
                  with {SLIDE_LABELS[linkedTo]}
                </span>
              )}

              {/* The buttons sit inside a draggable row, so a press on one
                  would otherwise start a drag instead of clicking. */}
              <span
                className="slide-move"
                draggable
                onDragStart={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                <button
                  className="icon"
                  onClick={() => onMove(id, -1)}
                  disabled={pinned || index === 0}
                  aria-label={`Move ${SLIDE_LABELS[id]} earlier`}
                  title={pinned ? `Moves with ${SLIDE_LABELS[linkedTo]}` : 'Move earlier'}
                >
                  ↑
                </button>
                <button
                  className="icon"
                  onClick={() => onMove(id, 1)}
                  disabled={pinned || index === order.length - 1}
                  aria-label={`Move ${SLIDE_LABELS[id]} later`}
                  title={pinned ? `Moves with ${SLIDE_LABELS[linkedTo]}` : 'Move later'}
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

        <li className={`slide-fixed${playing === 'outro' ? ' is-playing' : ''}`}>
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
