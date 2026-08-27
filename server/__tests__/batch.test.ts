import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WrappedStats } from '@/stats/types';
import { STARTERS } from '@/theme/starters';
import type { BatchRequestItem } from '../batch';

/**
 * The queue is tested against a stubbed `startRender`. A real render is a
 * minute of CPU; fifty of them is not a unit test. What matters here is the
 * queue's behaviour around failures, skips and cancellation, and that is all
 * observable without producing a single frame.
 */
const renderCalls: string[] = [];
let behaviour: (name: string) => 'done' | 'failed' | 'cancelled' | 'throw' = () => 'done';
let renderDelayMs = 0;

vi.mock('../render', () => ({
  outputFileName: (input: { stats: { playerName: string } }) =>
    `${input.stats.playerName.toLowerCase()}.mp4`,
  startRender: (input: { stats: { playerName: string } }) => {
    const name = input.stats.playerName;
    renderCalls.push(name);
    const progress = {
      phase: 'rendering' as string,
      progress: 0,
      renderedFrames: 0,
      encodedFrames: 0,
      totalFrames: 100,
      outputFile: null as string | null,
      bytes: null as number | null,
      error: null as string | null,
    };

    const done = (async () => {
      if (renderDelayMs) await new Promise((r) => setTimeout(r, renderDelayMs));
      const outcome = behaviour(name);
      if (outcome === 'throw') throw new Error(`exploded rendering ${name}`);
      progress.phase = outcome;
      progress.progress = 1;
      if (outcome === 'done') {
        progress.outputFile = `/out/${name.toLowerCase()}.mp4`;
        progress.bytes = 1_000_000;
      }
      if (outcome === 'failed') progress.error = `no box art for ${name}`;
    })();

    return { id: name, progress, cancel: () => {}, done };
  },
}));

const { startBatch } = await import('../batch');

const stats = (playerName: string): WrappedStats => ({
  playerId: 1,
  playerName,
  rangeLabel: '2026',
  rangeFrom: '2026-01-01',
  rangeTo: '2026-12-31',
  stats: [],
  thin: false,
});

const item = (playerId: number, playerName: string, plays = 50): BatchRequestItem => ({
  playerId,
  plays,
  stats: stats(playerName),
  theme: STARTERS[2],
  track: null,
  slides: null,
});

beforeEach(() => {
  renderCalls.length = 0;
  behaviour = () => 'done';
  renderDelayMs = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('a clean batch', () => {
  // Step 11, test case 1.
  it('renders every player, in order', async () => {
    const names = ['Tina', 'Dario', 'Paulina', 'Axel', 'Dominik'];
    const job = startBatch({ items: names.map((n, i) => item(i + 1, n)) });
    await job.done;

    expect(renderCalls).toEqual(names);
    expect(job.state.items.every((i) => i.status === 'done')).toBe(true);
    expect(job.state.summary?.rendered).toBe(5);
    expect(new Set(job.state.items.map((i) => i.file)).size).toBe(5);
  });

  it('reports a summary with sizes and a duration', async () => {
    const job = startBatch({ items: [item(1, 'Tina'), item(2, 'Dario')] });
    await job.done;

    expect(job.state.summary).toMatchObject({ total: 2, rendered: 2, failed: 0, skipped: 0 });
    expect(job.state.summary?.bytes).toBe(2_000_000);
    expect(job.state.summary?.durationMs).toBeGreaterThanOrEqual(0);
    expect(job.state.running).toBe(false);
  });

  it('leaves no item still marked as running', async () => {
    const job = startBatch({ items: [item(1, 'Tina')] });
    await job.done;
    expect(job.state.currentIndex).toBe(-1);
    expect(job.state.items.some((i) => i.status === 'rendering')).toBe(false);
  });
});

describe('failures', () => {
  // Step 11, test cases 2 and 3.
  it('carries on after one player fails, and names the reason', async () => {
    behaviour = (name) => (name === 'Paulina' ? 'failed' : 'done');
    const names = ['Tina', 'Dario', 'Paulina', 'Axel', 'Dominik'];
    const job = startBatch({ items: names.map((n, i) => item(i + 1, n)) });
    await job.done;

    // Every player was attempted; the failure did not abort the queue.
    expect(renderCalls).toEqual(names);
    expect(job.state.summary?.rendered).toBe(4);
    expect(job.state.summary?.failed).toBe(1);

    const failed = job.state.items.find((i) => i.status === 'failed');
    expect(failed?.playerName).toBe('Paulina');
    expect(failed?.reason).toBe('no box art for Paulina');
  });

  it('treats a thrown error the same as a reported one', async () => {
    behaviour = (name) => (name === 'Dario' ? 'throw' : 'done');
    const job = startBatch({ items: [item(1, 'Tina'), item(2, 'Dario'), item(3, 'Axel')] });
    await job.done;

    expect(renderCalls).toEqual(['Tina', 'Dario', 'Axel']);
    const failed = job.state.items.find((i) => i.status === 'failed');
    expect(failed?.playerName).toBe('Dario');
    expect(failed?.reason).toContain('exploded rendering Dario');
  });

  it('survives every single player failing', async () => {
    behaviour = () => 'failed';
    const job = startBatch({ items: [item(1, 'A'), item(2, 'B')] });
    await job.done;
    expect(job.state.summary?.failed).toBe(2);
    expect(job.state.running).toBe(false);
  });
});

describe('the minimum-plays threshold', () => {
  it('skips players below it without rendering them', async () => {
    const job = startBatch({
      items: [item(1, 'Tina', 233), item(2, 'Ghost', 1), item(3, 'Dario', 500)],
      minPlays: 3,
    });
    await job.done;

    // The skipped player never reached the renderer at all.
    expect(renderCalls).toEqual(['Tina', 'Dario']);
    const skipped = job.state.items.find((i) => i.playerName === 'Ghost');
    expect(skipped?.status).toBe('skipped');
    expect(skipped?.reason).toContain('below the minimum');
  });

  it('says how many plays a skipped player actually had', async () => {
    const job = startBatch({ items: [item(1, 'Ghost', 1)], minPlays: 5 });
    await job.done;
    expect(job.state.items[0].reason).toBe('only 1 play, below the minimum of 5');
  });

  it('renders everyone when the threshold is zero', async () => {
    const job = startBatch({ items: [item(1, 'A', 0), item(2, 'B', 1)], minPlays: 0 });
    await job.done;
    expect(renderCalls).toEqual(['A', 'B']);
  });
});

describe('cancelling', () => {
  it('stops the queue and reports what never ran', async () => {
    renderDelayMs = 30;
    const job = startBatch({
      items: [item(1, 'A'), item(2, 'B'), item(3, 'C'), item(4, 'D')],
    });

    await new Promise((r) => setTimeout(r, 45));
    job.cancel();
    await job.done;

    // Some rendered, the rest are accounted for rather than left dangling.
    expect(renderCalls.length).toBeLessThan(4);
    expect(job.state.items.some((i) => i.status === 'skipped')).toBe(true);
    expect(job.state.items.every((i) => i.status !== 'queued')).toBe(true);
    expect(job.state.running).toBe(false);
    expect(job.state.summary).not.toBeNull();
  });
});

describe('memory', () => {
  // Step 11, test case 5, at the level a unit test can reach.
  it('releases each item payload once it has been rendered', async () => {
    const items = [item(1, 'A'), item(2, 'B'), item(3, 'C')];
    const job = startBatch({ items });
    await job.done;

    // Fifty players' worth of stats held to the end of a run is the one place
    // this queue could grow without bound, so the payloads are dropped as it
    // goes. The reported items, which are small, survive.
    expect(items.every((entry) => entry === null)).toBe(true);
    expect(job.state.items).toHaveLength(3);
    expect(job.state.items.every((i) => i.playerName)).toBe(true);
  });

  it('handles a batch the size of the real group', async () => {
    const many = Array.from({ length: 53 }, (_, i) => item(i + 1, `Player ${i + 1}`));
    const job = startBatch({ items: many });
    await job.done;

    expect(job.state.summary?.total).toBe(53);
    expect(job.state.summary?.rendered).toBe(53);
    expect(renderCalls).toHaveLength(53);
  });
});
