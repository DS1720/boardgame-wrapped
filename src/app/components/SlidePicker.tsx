import { useMemo, useState } from 'react';
import type { SlideId, WrappedStats } from '@/stats/types';
import { CORE_SLIDES } from '@/stats/index';
import {
  ALL_SLIDES,
  barsFor,
  DEFAULT_SLIDE_IDS,
  LINKED_PAIRS,
  MAX_SLIDE_BARS,
  MIN_SLIDE_BARS,
  SLIDE_BARS,
  SLIDE_LABELS,
  unitsOf,
  type SlideBarOverrides,
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
 * A linked pair moves as one: grabbing either half moves both, because the
 * moves work on units rather than rows. Both halves are ordinary rows — drag
 * them, arrow them, remove them. The only thing the pairing takes away is the
 * ability to put something *between* the two, which is the point of it.
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
  /** Lengths chosen by hand. Absent ids are at their default. */
  bars: SlideBarOverrides;
  /** Set one slide's length in bars, or null to put it back to the default. */
  onBars: (id: TimelineSlideId, value: number | null) => void;
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

/**
 * How long one slide runs, in bars.
 *
 * Bars rather than seconds because the video is cut to a track: a slide lasting
 * a whole number of bars lands on a downbeat, and one lasting 3.4 seconds
 * cannot. The seconds it works out to depend on the tempo, which is why they
 * are not what you set — the readout under the player says what the whole video
 * came to.
 *
 * Two steppers rather than a free number field: the useful range is 1 to 8, and
 * every value in it is one or two clicks away. A row at its default says so
 * rather than showing a number that looks chosen.
 */
const BarStepper: React.FC<{
  id: TimelineSlideId;
  label: string;
  bars: SlideBarOverrides;
  onBars: (id: TimelineSlideId, value: number | null) => void;
}> = ({ id, label, bars, onBars }) => {
  const value = barsFor(id, bars);
  const isDefault = bars[id] === undefined;

  return (
    <span
      className="slide-bars"
      // Inside a draggable row: without this a press on a stepper starts a drag.
      draggable
      onDragStart={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <button
        className="icon"
        onClick={() => onBars(id, value - 1)}
        disabled={value <= MIN_SLIDE_BARS}
        aria-label={`Shorten ${label}`}
        title="One bar shorter"
      >
        −
      </button>
      <button
        className={`slide-bars-value${isDefault ? ' is-default' : ''}`}
        onClick={() => onBars(id, null)}
        disabled={isDefault}
        aria-label={`${label} is ${value} bars. Reset to the default.`}
        title={isDefault ? `Default: ${SLIDE_BARS[id]} bars` : 'Back to the default length'}
      >
        {value}
      </button>
      <button
        className="icon"
        onClick={() => onBars(id, value + 1)}
        disabled={value >= MAX_SLIDE_BARS}
        aria-label={`Lengthen ${label}`}
        title="One bar longer"
      >
        +
      </button>
    </span>
  );
};

export const SlidePicker: React.FC<Props> = ({
  stats,
  order,
  onToggle,
  onMove,
  onReorder,
  playing = null,
  bars,
  onBars,
  onReset,
  onAll,
}) => {
  const available = new Set(stats?.stats.map((s) => s.id) ?? []);

  // The row being dragged, and the row it is currently over. Both are cleared
  // on drop and on dragend — a drag abandoned outside the list must not leave
  // a row looking like it is still moving.
  const [dragging, setDragging] = useState<SlideId | null>(null);
  const [over, setOver] = useState<number | null>(null);

  // Blocks that move together. The arrows are disabled at the ends of the
  // *list of units*, not at the ends of the list of rows: a pair sitting last
  // has a row that is not last, and its ↓ would look live while doing nothing.
  const units = useMemo(() => unitsOf(order), [order]);
  const unitAt = (id: SlideId) => units.findIndex((unit) => unit.includes(id));

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
          ? `${inCut.length + 2} in the cut, including the intro and outro. Drag a row to reorder, or use the arrows. The number on the right is how many bars a slide runs for.`
          : 'Pick a player to see which stats they have.'}
      </p>

      <ol className="slide-order">
        {/* The bookends are not part of the selection and never move, but they
            are slides with a length like any other — and the outro is the one
            people most often want longer, because it is the screenshot. */}
        <li className={`slide-fixed${playing === 'intro' ? ' is-playing' : ''}`}>
          <span className="slide-index">1</span>
          <span className="slide-name">Intro</span>
          <span className="slide-tag is-muted">always</span>
          <BarStepper id="intro" label="the intro" bars={bars} onBars={onBars} />
        </li>

        {order.map((id, index) => {
          const has = available.has(id);
          const linkedTo = LINKED_TO.get(id);
          // Always plays directly before its partner, and travels with it.
          const linked = linkedTo !== undefined && order.includes(linkedTo);
          const unit = unitAt(id);

          const classes = [
            has ? '' : 'is-unavailable',
            playing === id ? 'is-playing' : '',
            dragging === id ? 'is-dragging' : '',
            over === index && dragging !== null && dragging !== id ? 'is-over' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <li
              key={id}
              className={classes}
              draggable
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
                ⠿
              </span>
              <span className="slide-index">{has ? inCut.indexOf(id) + 2 : '–'}</span>
              <span className="slide-name" title={SLIDE_LABELS[id]}>
                {SLIDE_LABELS[id]}
              </span>
              {!CORE_SLIDES.includes(id) && <span className="slide-tag">optional</span>}
              {stats && !has && <span className="slide-tag is-muted">no data</span>}
              {linked && (
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
                  disabled={unit === 0}
                  aria-label={`Move ${SLIDE_LABELS[id]} earlier`}
                  title="Move earlier"
                >
                  ↑
                </button>
                <button
                  className="icon"
                  onClick={() => onMove(id, 1)}
                  disabled={unit === units.length - 1}
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

              <BarStepper id={id} label={SLIDE_LABELS[id]} bars={bars} onBars={onBars} />
            </li>
          );
        })}

        <li className={`slide-fixed${playing === 'outro' ? ' is-playing' : ''}`}>
          <span className="slide-index">{inCut.length + 2}</span>
          <span className="slide-name">Outro</span>
          <span className="slide-tag is-muted">always</span>
          <BarStepper id="outro" label="the outro" bars={bars} onBars={onBars} />
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
