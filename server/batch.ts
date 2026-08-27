/**
 * Batch rendering (Node only).
 *
 * A sequential queue around `startRender`. Sequential because Remotion opens a
 * browser per render and saturates the CPU: two at once finish later than two
 * in a row, and are far likelier to exhaust memory partway through a set of
 * fifty.
 */
import { outputFileName, startRender, type RenderInput } from './render';

export type BatchItemStatus = 'queued' | 'rendering' | 'done' | 'failed' | 'skipped';

export interface BatchRequestItem extends RenderInput {
  playerId: number;
  /** Plays in range, used for the minimum-plays skip. */
  plays: number;
}

export interface BatchItem {
  playerId: number;
  playerName: string;
  plays: number;
  status: BatchItemStatus;
  file: string | null;
  bytes: number | null;
  /** Why it failed, or why it was skipped. */
  reason: string | null;
  durationMs: number | null;
}

export interface BatchSummary {
  total: number;
  rendered: number;
  failed: number;
  skipped: number;
  bytes: number;
  durationMs: number;
}

export interface BatchState {
  running: boolean;
  items: BatchItem[];
  /** Index of the item being rendered, or -1. */
  currentIndex: number;
  /** Frame progress of the item in flight, 0-1. */
  currentProgress: number;
  summary: BatchSummary | null;
  startedAt: number;
}

export interface BatchJob {
  state: BatchState;
  cancel: () => void;
  done: Promise<void>;
}

export interface BatchOptions {
  items: BatchRequestItem[];
  /** Players with fewer plays than this are skipped without rendering. */
  minPlays?: number;
}

const summarise = (items: BatchItem[], durationMs: number): BatchSummary => ({
  total: items.length,
  rendered: items.filter((i) => i.status === 'done').length,
  failed: items.filter((i) => i.status === 'failed').length,
  skipped: items.filter((i) => i.status === 'skipped').length,
  bytes: items.reduce((sum, i) => sum + (i.bytes ?? 0), 0),
  durationMs,
});

/**
 * Render a list of players one after another.
 *
 * A failure marks its item and the queue carries on. Fifty videos are half an
 * hour of work; aborting the lot because the fourth one had no box art would
 * be the wrong trade every time.
 */
export const startBatch = ({ items: requested, minPlays = 0 }: BatchOptions): BatchJob => {
  const items: BatchItem[] = requested.map((item) => ({
    playerId: item.playerId,
    playerName: item.stats.playerName,
    plays: item.plays,
    status: item.plays < minPlays ? 'skipped' : 'queued',
    file: null,
    bytes: null,
    reason:
      item.plays < minPlays
        ? `only ${item.plays} ${item.plays === 1 ? 'play' : 'plays'}, below the minimum of ${minPlays}`
        : null,
    durationMs: null,
  }));

  const state: BatchState = {
    running: true,
    items,
    currentIndex: -1,
    currentProgress: 0,
    summary: null,
    startedAt: Date.now(),
  };

  let cancelled = false;
  let cancelCurrent: (() => void) | null = null;

  const done = (async () => {
    for (let index = 0; index < requested.length; index += 1) {
      if (cancelled) break;
      const item = items[index];
      if (item.status === 'skipped') continue;

      state.currentIndex = index;
      state.currentProgress = 0;
      item.status = 'rendering';
      const startedAt = Date.now();

      try {
        const job = startRender(requested[index]);
        cancelCurrent = job.cancel;

        // Poll the job's own progress object rather than threading a callback
        // through: `startRender` already keeps it up to date.
        const poll = setInterval(() => {
          state.currentProgress = job.progress.progress;
        }, 200);

        await job.done;
        clearInterval(poll);
        cancelCurrent = null;

        if (job.progress.phase === 'done') {
          item.status = 'done';
          item.file = job.progress.outputFile;
          item.bytes = job.progress.bytes;
        } else if (job.progress.phase === 'cancelled') {
          item.status = 'skipped';
          item.reason = 'cancelled';
        } else {
          item.status = 'failed';
          // The real reason, attached to the player it belongs to, so the
          // summary can name both.
          item.reason = job.progress.error ?? 'unknown error';
        }
      } catch (err) {
        item.status = 'failed';
        item.reason = err instanceof Error ? err.message : String(err);
      } finally {
        item.durationMs = Date.now() - startedAt;
        // Drop the reference to this item's stats now it is rendered. Fifty
        // players' worth of stats and themes held to the end of the run is the
        // one place this queue could grow without bound.
        requested[index] = null as unknown as BatchRequestItem;
      }
    }

    // Anything still queued when a cancel lands is reported, not left dangling.
    for (const item of items) {
      if (item.status === 'queued' || item.status === 'rendering') {
        item.status = 'skipped';
        item.reason = 'cancelled';
      }
    }

    state.currentIndex = -1;
    state.running = false;
    state.summary = summarise(items, Date.now() - state.startedAt);
  })();

  return {
    state,
    cancel: () => {
      cancelled = true;
      cancelCurrent?.();
    },
    done,
  };
};

/** The filename an item will produce, for showing the plan before it runs. */
export const plannedFileName = (item: BatchRequestItem): string => outputFileName(item);
