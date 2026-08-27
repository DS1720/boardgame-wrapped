import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prefetchBoxArt, readManifest } from '../boxart';
import { formatFromMagic, MANIFEST_FILE } from '../../src/shared/boxart';
import type { RawGame } from '../../src/shared/types';
import { fakeJpeg, solidPng } from './pngFixture';

const game = (id: number, name: string, url: string | null): RawGame => ({
  id,
  uuid: `uuid-${id}`,
  name,
  cooperative: false,
  highestWins: true,
  noPoints: false,
  usesTeams: false,
  urlImage: url ?? '',
  urlThumb: '',
  bggId: 1000 + id,
});

/** Colors chosen to be unambiguous so the extracted swatch is predictable. */
const IMAGES: Record<string, Buffer> = {
  'https://img/1.png': solidPng(231, 95, 43),
  'https://img/2.png': solidPng(43, 76, 126),
  'https://img/3.png': solidPng(208, 43, 43),
};

const GAMES: RawGame[] = [
  game(1, 'Faraway', 'https://img/1.png'),
  game(2, 'Castle Combo', 'https://img/2.png'),
  game(3, 'Phantom Ink', 'https://img/3.png'),
  game(4, '✂️ 🪨 📜', null),
];

interface Recorder {
  impl: typeof fetch;
  calls: string[];
}

/** A fetch that serves the fixtures above and records what was asked for. */
const recordingFetch = (
  overrides: Record<string, () => Response> = {},
  delayMs = 0,
): Recorder => {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (overrides[url]) return overrides[url]();
    const body = IMAGES[url];
    if (!body) return new Response('nope', { status: 404 });
    return new Response(new Uint8Array(body), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
};

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'bgw-boxart-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('prefetch', () => {
  it('downloads every cover and gives every game a manifest entry', async () => {
    const fetcher = recordingFetch();
    const summary = await prefetchBoxArt({ games: GAMES, dir, fetchImpl: fetcher.impl });

    expect(summary.downloaded).toBe(3);
    expect(summary.fallback).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.done).toBe(4);

    // Three images plus one fallback: four entries, one per game — the shape the
    // real export produces at 228 + 1 = 229.
    const manifest = await readManifest(dir);
    expect(Object.keys(manifest.entries)).toHaveLength(4);
    expect(manifest.entries['1'].file).toBe('1.png');
    expect(manifest.entries['4'].file).toBeNull();

    const files = await readdir(dir);
    expect(files.sort()).toEqual([MANIFEST_FILE, '1.png', '2.png', '3.png'].sort());
  });

  it('extracts a dominant color and its hue', async () => {
    const fetcher = recordingFetch();
    await prefetchBoxArt({ games: GAMES, dir, fetchImpl: fetcher.impl });

    const manifest = await readManifest(dir);
    const faraway = manifest.entries['1'];
    expect(faraway.dominant).toMatch(/^#[0-9a-f]{6}$/i);
    expect(faraway.hue).toBeGreaterThanOrEqual(0);
    expect(faraway.hue).toBeLessThan(360);
    // A solid orange cover has to yield an orange-ish hue, not a grey one.
    expect(faraway.hue).toBeLessThan(45);

    // The art-less game gets an entry with no color, so slides can tell
    // "no art" from "not looked at yet".
    expect(manifest.entries['4'].dominant).toBeNull();
    expect(manifest.entries['4'].swatches).toBeNull();
  });

  it('stores files whose bytes really are images', async () => {
    await prefetchBoxArt({ games: GAMES, dir, fetchImpl: recordingFetch().impl });
    const files = (await readdir(dir)).filter((f) => f !== MANIFEST_FILE);
    expect(files).toHaveLength(3);
    for (const file of files) {
      const bytes = await readFile(path.join(dir, file));
      expect(formatFromMagic(bytes)).toBe(path.extname(file).slice(1));
    }
  });

  it('re-running downloads nothing', async () => {
    await prefetchBoxArt({ games: GAMES, dir, fetchImpl: recordingFetch().impl });

    const second = recordingFetch();
    const summary = await prefetchBoxArt({ games: GAMES, dir, fetchImpl: second.impl });

    expect(second.calls).toEqual([]);
    expect(summary.downloaded).toBe(0);
    expect(summary.skipped).toBe(3);
    expect(summary.fallback).toBe(1);
  });

  it('re-uses the images but re-extracts color when the manifest is lost', async () => {
    await prefetchBoxArt({ games: GAMES, dir, fetchImpl: recordingFetch().impl });
    const before = await readManifest(dir);
    await rm(path.join(dir, MANIFEST_FILE));

    const second = recordingFetch();
    const summary = await prefetchBoxArt({ games: GAMES, dir, fetchImpl: second.impl });

    // A deleted manifest is cheap to rebuild; the downloads are the expensive
    // part, so losing it must not cost 228 fetches.
    expect(second.calls).toEqual([]);
    expect(summary.downloaded).toBe(0);
    expect(summary.skipped).toBe(3);

    const after = await readManifest(dir);
    expect(after.entries['1'].dominant).toBe(before.entries['1'].dominant);
  });

  it('re-downloads when a game points at different art', async () => {
    await prefetchBoxArt({ games: GAMES, dir, fetchImpl: recordingFetch().impl });

    const moved = [game(1, 'Faraway', 'https://img/3.png'), ...GAMES.slice(1)];
    const second = recordingFetch();
    const summary = await prefetchBoxArt({ games: moved, dir, fetchImpl: second.impl });

    expect(second.calls).toEqual(['https://img/3.png']);
    expect(summary.downloaded).toBe(1);

    const manifest = await readManifest(dir);
    expect(manifest.entries['1'].source).toBe('https://img/3.png');
  });
});

describe('interruption', () => {
  it('leaves no partial files behind and resumes on the next run', async () => {
    const controller = new AbortController();
    const slow = recordingFetch({}, 30);

    const running = prefetchBoxArt({
      games: GAMES,
      dir,
      concurrency: 1,
      fetchImpl: slow.impl,
      signal: controller.signal,
      onProgress: (p) => {
        // Kill it as soon as the first cover has landed.
        if (p.done === 1) controller.abort();
      },
    });
    await running;

    const midway = await readdir(dir);
    expect(midway.some((f) => f.endsWith('.part'))).toBe(false);

    // Every image that did survive has to be complete, not truncated.
    for (const file of midway.filter((f) => f !== MANIFEST_FILE)) {
      const bytes = await readFile(path.join(dir, file));
      expect(formatFromMagic(bytes)).not.toBeNull();
    }

    const second = recordingFetch();
    const summary = await prefetchBoxArt({ games: GAMES, dir, fetchImpl: second.impl });
    expect(summary.failed).toBe(0);
    expect(summary.downloaded + summary.skipped).toBe(3);

    const manifest = await readManifest(dir);
    expect(Object.keys(manifest.entries)).toHaveLength(4);
  });

  it('sweeps stale .part files from a hard kill', async () => {
    // Simulates a process killed between writing the temp file and renaming it.
    await writeFile(path.join(dir, '1.png.part'), Buffer.from('half an image'));

    await prefetchBoxArt({ games: GAMES, dir, fetchImpl: recordingFetch().impl });

    const files = await readdir(dir);
    expect(files.some((f) => f.endsWith('.part'))).toBe(false);
    expect(formatFromMagic(await readFile(path.join(dir, '1.png')))).toBe('png');
  });
});

describe('bad responses', () => {
  it('records a failure and stores nothing when the host returns an error page', async () => {
    const fetcher = recordingFetch({
      'https://img/2.png': () =>
        new Response('<!doctype html>not found', {
          status: 200,
          headers: { 'content-type': 'image/png' },
        }),
    });

    const summary = await prefetchBoxArt({ games: GAMES, dir, fetchImpl: fetcher.impl });

    expect(summary.failed).toBe(1);
    expect(summary.errors[0].name).toBe('Castle Combo');
    // Nothing that is not an image is allowed to reach the disk.
    expect(await readdir(dir)).not.toContain('2.png');
  });

  it('retries a transient failure before giving up', async () => {
    let attempts = 0;
    const fetcher = recordingFetch({
      'https://img/2.png': () => {
        attempts += 1;
        if (attempts < 2) return new Response('boom', { status: 503 });
        return new Response(new Uint8Array(IMAGES['https://img/2.png']), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      },
    });

    const summary = await prefetchBoxArt({ games: GAMES, dir, fetchImpl: fetcher.impl });
    expect(attempts).toBe(2);
    expect(summary.failed).toBe(0);
    expect(summary.downloaded).toBe(3);
  });

  it('keeps a 404 from stopping the rest of the run', async () => {
    const withMissing = [...GAMES, game(5, 'Ghost', 'https://img/missing.png')];
    const summary = await prefetchBoxArt({ games: withMissing, dir, fetchImpl: recordingFetch().impl });

    expect(summary.failed).toBe(1);
    expect(summary.downloaded).toBe(3);
    expect(summary.fallback).toBe(1);
  });

  it('names a real image correctly even when the header lies', async () => {
    const fetcher = recordingFetch({
      'https://img/1.png': () =>
        new Response(new Uint8Array(IMAGES['https://img/1.png']), {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        }),
    });

    await prefetchBoxArt({ games: GAMES, dir, fetchImpl: fetcher.impl });

    const files = await readdir(dir);
    expect(files).toContain('1.png');
    expect(files).not.toContain('1.jpg');
  });

  it('stores a jpeg as .jpg', async () => {
    const fetcher = recordingFetch({
      'https://img/1.png': () =>
        new Response(new Uint8Array(fakeJpeg()), {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        }),
    });

    await prefetchBoxArt({ games: GAMES, dir, fetchImpl: fetcher.impl });
    expect(await readdir(dir)).toContain('1.jpg');
  });
});
