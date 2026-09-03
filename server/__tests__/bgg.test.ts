import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { entryFromItem, fetchableGames, prefetchBgg, readBggManifest } from '../bgg';
import { BGG_MANIFEST_FILE } from '../../src/shared/bgg';
import type { RawGame } from '../../src/shared/types';

const game = (id: number, name: string, bggId: number): RawGame => ({
  id,
  uuid: `uuid-${id}`,
  name,
  cooperative: false,
  highestWins: true,
  noPoints: false,
  usesTeams: false,
  urlImage: '',
  urlThumb: '',
  bggId,
});

/** One game's worth of the shape `api.geekdo.com` actually returns. */
const item = (name: string, links: Record<string, string[]>) => ({
  item: {
    name,
    links: Object.fromEntries(
      Object.entries(links).map(([key, values]) => [key, values.map((value) => ({ name: value }))]),
    ),
  },
});

const RESPONSES: Record<string, unknown> = {
  '385761': item('Faraway', {
    boardgamemechanic: ['Hand Management', 'Open Drafting'],
    boardgamecategory: ['Card Game', 'Fantasy'],
    boardgamedesigner: ['Johannes Goupy', 'Corentin Lebrat'],
    boardgameartist: ['Maxime Morin'],
    // Twenty-four in reality. Only the first must survive.
    boardgamepublisher: ['Catch Up Games', 'Across the Board', 'Blackrock Games'],
  }),
  '420087': item('Flip 7', {
    boardgamemechanic: ['Push Your Luck'],
    boardgamecategory: ['Card Game'],
    boardgamedesigner: ['Eric Olsen'],
    boardgameartist: ["O'Neil Mabile"],
    boardgamepublisher: ['The Op Games', '999 Games'],
  }),
};

const GAMES: RawGame[] = [
  game(1, 'Faraway', 385761),
  game(2, 'Flip 7', 420087),
  // No BGG match: there is nothing to ask for.
  game(3, '✂️ 🪨 📜', 0),
];

interface Recorder {
  impl: typeof fetch;
  calls: string[];
}

/** A fetch that serves the fixtures above and records what was asked for. */
const recordingFetch = (overrides: Record<string, () => Response> = {}): Recorder => {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const id = new URL(url).searchParams.get('objectid') ?? '';
    const override = overrides[id];
    if (override) return override();
    const body = RESPONSES[id];
    if (!body) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
};

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'bgw-bgg-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('fetchableGames', () => {
  it('skips games with no BGG id and dedupes shared ids', () => {
    const dupes = [...GAMES, game(4, 'Faraway (copy)', 385761)];
    expect(fetchableGames(dupes).map((g) => g.bggId)).toEqual([385761, 420087]);
  });
});

describe('entryFromItem', () => {
  it('keeps only the original publisher', () => {
    /*
      BGG lists every localization partner — 13.7 per game across the real
      library — so a raw tally ranks whoever translates the most games. The
      narrowing happens here, at fetch time, so the long list never reaches the
      stats layer at all.
    */
    const entry = entryFromItem(385761, (RESPONSES['385761'] as ReturnType<typeof item>).item);
    expect(entry.publisher).toBe('Catch Up Games');
  });

  it('survives a response with no links at all', () => {
    const entry = entryFromItem(1, { name: 'Mystery' });
    expect(entry.mechanics).toEqual([]);
    expect(entry.publisher).toBeNull();
  });

  it('ignores link entries that are not named', () => {
    // Undocumented JSON API: the shape is not a promise anyone made us.
    const entry = entryFromItem(1, {
      name: 'x',
      links: { boardgamedesigner: [{ name: 'Real' }, {}, { name: 42 }] as never },
    });
    expect(entry.designers).toEqual(['Real']);
  });
});

describe('prefetch', () => {
  it('fetches every matched game and writes a manifest', async () => {
    const { impl, calls } = recordingFetch();
    const summary = await prefetchBgg({ games: GAMES, dir, fetchImpl: impl });

    expect(summary.total).toBe(2);
    expect(summary.fetched).toBe(2);
    expect(summary.failed).toBe(0);
    // The game with no bggId was never asked about.
    expect(calls).toHaveLength(2);

    const manifest = await readBggManifest(dir);
    expect(Object.keys(manifest.entries).sort()).toEqual(['385761', '420087']);
    expect(manifest.entries['385761'].designers).toEqual(['Johannes Goupy', 'Corentin Lebrat']);
    expect(manifest.entries['420087'].publisher).toBe('The Op Games');
  });

  it('reuses a cached entry and does not ask again', async () => {
    const first = recordingFetch();
    await prefetchBgg({ games: GAMES, dir, fetchImpl: first.impl });

    const second = recordingFetch();
    const summary = await prefetchBgg({ games: GAMES, dir, fetchImpl: second.impl });

    expect(second.calls).toHaveLength(0);
    expect(summary.skipped).toBe(2);
    expect(summary.fetched).toBe(0);
  });

  it('re-fetches everything with force', async () => {
    const first = recordingFetch();
    await prefetchBgg({ games: GAMES, dir, fetchImpl: first.impl });

    const second = recordingFetch();
    await prefetchBgg({ games: GAMES, dir, force: true, fetchImpl: second.impl });
    expect(second.calls).toHaveLength(2);
  });

  it('records a failure rather than dropping the game, and retries it next run', async () => {
    const failing = recordingFetch({
      '420087': () => new Response('nope', { status: 500 }),
    });
    const summary = await prefetchBgg({ games: GAMES, dir, fetchImpl: failing.impl });

    expect(summary.failed).toBe(1);
    expect(summary.errors[0].name).toBe('Flip 7');

    const manifest = await readBggManifest(dir);
    // Kept with its reason: a re-run must know to try this one again, and the
    // stats layer must not count it as "fetched, no credits".
    expect(manifest.entries['420087'].error).toContain('500');

    const retry = recordingFetch();
    const second = await prefetchBgg({ games: GAMES, dir, fetchImpl: retry.impl });
    expect(retry.calls).toHaveLength(1);
    expect(second.fetched).toBe(1);
  });

  it('keeps one failure from stopping the rest of the run', async () => {
    const { impl } = recordingFetch({ '385761': () => new Response('x', { status: 404 }) });
    const summary = await prefetchBgg({ games: GAMES, dir, fetchImpl: impl });
    expect(summary.failed).toBe(1);
    expect(summary.fetched).toBe(1);
  });

  it('answers an empty manifest for a directory with nothing in it', async () => {
    const manifest = await readBggManifest(dir);
    expect(manifest.entries).toEqual({});
  });

  it('discards a manifest written by an older version', async () => {
    await writeFile(
      path.join(dir, BGG_MANIFEST_FILE),
      JSON.stringify({ version: 0, entries: { '1': {} } }),
      'utf8',
    );
    expect((await readBggManifest(dir)).entries).toEqual({});
  });

  it('writes the manifest atomically and leaves no .part behind', async () => {
    const { impl } = recordingFetch();
    await prefetchBgg({ games: GAMES, dir, fetchImpl: impl });
    // A truncated manifest a later run parsed as complete is the failure this
    // guards against.
    await expect(readFile(path.join(dir, `${BGG_MANIFEST_FILE}.part`))).rejects.toThrow();
    const raw = await readFile(path.join(dir, BGG_MANIFEST_FILE), 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('stops when cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const { impl, calls } = recordingFetch();
    const summary = await prefetchBgg({
      games: GAMES,
      dir,
      signal: controller.signal,
      fetchImpl: impl,
    });
    expect(calls).toHaveLength(0);
    expect(summary.done).toBe(0);
  });
});
