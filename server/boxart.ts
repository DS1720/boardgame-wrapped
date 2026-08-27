/**
 * Box art prefetch engine (Node only).
 *
 * Downloads every game's cover into public/boxart, extracts its dominant color,
 * and writes a manifest the slides read at render time. Run once per export.
 *
 * The invariant that matters: after this finishes, rendering never touches the
 * network. Everything a video needs is on disk.
 */
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RawGame } from '../src/shared/types';
import {
  emptyManifest,
  fileNameFor,
  hueOf,
  MANIFEST_FILE,
  MANIFEST_VERSION,
  pickDominant,
  rejectionReason,
  resolveFormat,
  type BoxArtFormat,
  type BoxArtEntry,
  type BoxArtManifest,
  type Swatches,
} from '../src/shared/boxart';

export interface PrefetchProgress {
  done: number;
  total: number;
  downloaded: number;
  skipped: number;
  fallback: number;
  failed: number;
  /** Name of the game just finished, for a status line in the UI. */
  current: string | null;
}

export interface PrefetchSummary extends Omit<PrefetchProgress, 'current'> {
  bytes: number;
  errors: Array<{ gameId: number; name: string; message: string }>;
  manifestPath: string;
}

export interface PrefetchOptions {
  games: RawGame[];
  /** Defaults to <repo>/public/boxart. */
  dir?: string;
  /** Parallel downloads. BGG is fine with a handful; do not raise this casually. */
  concurrency?: number;
  onProgress?: (p: PrefetchProgress) => void;
  signal?: AbortSignal;
  /** Re-download every cover even if it is already on disk. Use after art changes upstream. */
  force?: boolean;
  /** Injected in tests so the suite never hits the network. */
  fetchImpl?: typeof fetch;
}

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DIR = path.resolve(here, '..', 'public', 'boxart');

const RETRIES = 2;
const RETRY_DELAY_MS = 400;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/* -------------------------------------------------------------------------- */
/* Manifest I/O                                                                */
/* -------------------------------------------------------------------------- */

export const readManifest = async (dir: string): Promise<BoxArtManifest> => {
  try {
    const raw = await readFile(path.join(dir, MANIFEST_FILE), 'utf8');
    const parsed = JSON.parse(raw) as BoxArtManifest;
    // A manifest from an older shape is not worth migrating; the images on disk
    // are the expensive part and they get re-used regardless.
    if (parsed?.version !== MANIFEST_VERSION || typeof parsed.entries !== 'object') {
      return emptyManifest();
    }
    return parsed;
  } catch {
    return emptyManifest();
  }
};

export const writeManifest = async (dir: string, manifest: BoxArtManifest): Promise<string> => {
  const file = path.join(dir, MANIFEST_FILE);
  manifest.generatedAt = new Date().toISOString();
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return file;
};

/* -------------------------------------------------------------------------- */
/* Color extraction                                                            */
/* -------------------------------------------------------------------------- */

interface VibrantModule {
  Vibrant: {
    from: (src: Buffer | string) => {
      getPalette: () => Promise<Record<string, { hex: string } | null>>;
    };
  };
}

let vibrantPromise: Promise<VibrantModule> | null = null;

const loadVibrant = (): Promise<VibrantModule> => {
  // Loaded lazily and once: it pulls in an image decoder that costs more to
  // import than the rest of the server put together.
  vibrantPromise ??= import('node-vibrant/node') as unknown as Promise<VibrantModule>;
  return vibrantPromise;
};

export const swatchesFrom = async (src: Buffer | string): Promise<Swatches | null> => {
  try {
    const { Vibrant } = await loadVibrant();
    const palette = await Vibrant.from(src).getPalette();
    const hex = (key: string) => palette[key]?.hex ?? null;
    return {
      vibrant: hex('Vibrant'),
      darkVibrant: hex('DarkVibrant'),
      lightVibrant: hex('LightVibrant'),
      muted: hex('Muted'),
      darkMuted: hex('DarkMuted'),
      lightMuted: hex('LightMuted'),
    };
  } catch {
    // A cover we cannot quantize is not a reason to fail the run; the slide
    // falls back to the theme's own accent.
    return null;
  }
};

/* -------------------------------------------------------------------------- */
/* Prefetch                                                                    */
/* -------------------------------------------------------------------------- */

const fallbackEntry = (game: RawGame): BoxArtEntry => ({
  gameId: game.id,
  name: game.name,
  bggId: game.bggId,
  file: null,
  source: null,
  bytes: null,
  swatches: null,
  dominant: null,
  hue: null,
});

const entryFor = (
  game: RawGame,
  file: string,
  source: string,
  bytes: number,
  swatches: Swatches | null,
): BoxArtEntry => {
  const dominant = pickDominant(swatches);
  return {
    gameId: game.id,
    name: game.name,
    bggId: game.bggId,
    file,
    source,
    bytes,
    swatches,
    dominant,
    hue: dominant ? hueOf(dominant) : null,
  };
};

const FORMATS: BoxArtFormat[] = ['png', 'jpg', 'webp', 'gif'];

/**
 * Which file on disk, if any, this game can re-use instead of downloading.
 *
 * A manifest entry is authoritative: if it names a different source URL, the
 * art has genuinely changed and must be fetched again. With *no* entry we fall
 * back to whatever `<gameId>.<ext>` is sitting there, which is what makes a
 * deleted manifest cheap to rebuild. The trade is that a manifest-less run
 * cannot notice changed art — that is what `force` is for.
 */
const reusableFile = (
  gameId: number,
  url: string,
  cached: BoxArtEntry | undefined,
  onDisk: Set<string>,
): string | null => {
  if (cached) {
    return cached.file && onDisk.has(cached.file) && cached.source === url ? cached.file : null;
  }
  return FORMATS.map((ext) => `${gameId}.${ext}`).find((name) => onDisk.has(name)) ?? null;
};

/**
 * Download one cover and store it atomically.
 *
 * Writes to `<id>.<ext>.part` and renames only once the bytes are complete and
 * verified as an image. A killed run therefore leaves partial files that are
 * obviously partial, never a truncated `.png` that a later run counts as a hit.
 */
const download = async (
  game: RawGame,
  dir: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<{ file: string; bytes: Buffer }> => {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    if (signal?.aborted) throw new Error('aborted');
    try {
      const res = await fetchImpl(game.urlImage, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      const format = resolveFormat(bytes);
      if (!format) throw new Error(rejectionReason(res.headers.get('content-type'), bytes));

      const file = fileNameFor(game.id, format);
      const partPath = path.join(dir, `${file}.part`);
      await writeFile(partPath, bytes);
      await rename(partPath, path.join(dir, file));
      return { file, bytes };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (signal?.aborted || attempt === RETRIES) break;
      await sleep(RETRY_DELAY_MS * (attempt + 1));
    }
  }
  throw lastError ?? new Error('download failed');
};

export const prefetchBoxArt = async ({
  games,
  dir = DEFAULT_DIR,
  concurrency = 6,
  onProgress,
  signal,
  force = false,
  fetchImpl = fetch,
}: PrefetchOptions): Promise<PrefetchSummary> => {
  await mkdir(dir, { recursive: true });

  const manifest = await readManifest(dir);
  const onDisk = new Set(await readdir(dir).catch(() => [] as string[]));

  // Sweep leftovers from a previous run that was killed mid-download.
  await Promise.all(
    [...onDisk]
      .filter((name) => name.endsWith('.part'))
      .map(async (name) => {
        await unlink(path.join(dir, name)).catch(() => {});
        onDisk.delete(name);
      }),
  );

  const state = { done: 0, downloaded: 0, skipped: 0, fallback: 0, failed: 0, bytes: 0 };
  const errors: PrefetchSummary['errors'] = [];
  const total = games.length;

  const report = (current: string | null) => onProgress?.({ ...state, total, current });

  const handle = async (game: RawGame): Promise<void> => {
    if (signal?.aborted) return;
    try {
      const url = typeof game.urlImage === 'string' ? game.urlImage.trim() : '';
      if (!url) {
        // Games with no cover still get an entry, so a slide can look one up by
        // id and get an explicit "render the fallback tile" answer.
        manifest.entries[game.id] = fallbackEntry(game);
        state.fallback += 1;
        return;
      }

      const cached = manifest.entries[String(game.id)];
      const reusable = force ? null : reusableFile(game.id, url, cached, onDisk);

      if (reusable) {
        if (cached?.swatches && cached.file === reusable) {
          state.skipped += 1;
          return;
        }
        // The image is already here but its color was never extracted — an
        // interrupted run, or a manifest that was deleted. Re-quantize it from
        // disk rather than paying for the download again.
        const swatches = await swatchesFrom(path.join(dir, reusable));
        const bytes = cached?.bytes ?? (await stat(path.join(dir, reusable))).size;
        manifest.entries[game.id] = entryFor(game, reusable, url, bytes, swatches);
        state.skipped += 1;
        return;
      }

      const { file, bytes } = await download(game, dir, fetchImpl, signal);
      onDisk.add(file);
      const swatches = await swatchesFrom(bytes);
      manifest.entries[game.id] = entryFor(game, file, url, bytes.length, swatches);
      state.downloaded += 1;
      state.bytes += bytes.length;
    } catch (err) {
      state.failed += 1;
      errors.push({
        gameId: game.id,
        name: game.name,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      state.done += 1;
      report(game.name);
    }
  };

  // A small fixed pool rather than Promise.all over 229 URLs: it keeps memory
  // flat (covers run to ~1MB each) and stays polite to the image host.
  const queue = [...games];
  const workerCount = Math.max(1, Math.min(concurrency, queue.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (queue.length > 0) {
        if (signal?.aborted) return;
        const game = queue.shift();
        if (!game) return;
        await handle(game);
      }
    }),
  );

  const manifestPath = await writeManifest(dir, manifest);
  return { ...state, total, errors, manifestPath };
};
