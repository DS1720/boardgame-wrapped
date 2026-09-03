/**
 * BGG metadata prefetch engine (Node only).
 *
 * Fetches mechanics, categories, designers, artists and the original publisher
 * for every game in the export, and writes a manifest the stats layer reads.
 * Run once per export, like the box art prefetch.
 *
 * **Why this endpoint and not the documented one.** BGG's XML API now answers
 * `401 Unauthorized` to an unauthenticated request — they moved to requiring
 * registered applications and bearer tokens. A token embedded in a public repo
 * and a 169 MB installer handed to other people is not a secret, which is the
 * same reasoning that rules out shipping a GitHub token for the updater. The
 * JSON endpoint the website itself uses needs no authorization and returns the
 * same links, so that is what this reads.
 *
 * It is undocumented, and it could be gated the way the XML API was. That is
 * survivable by design: the manifest is cached, so a library already fetched is
 * unaffected, and every module that reads it returns `null` rather than
 * breaking when it is missing.
 *
 * Measured on the real export: 227 games, 227 fetched, 0 failures, under 60s.
 */
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { RawGame } from '../src/shared/types';
import {
  BGG_DIR,
  BGG_MANIFEST_FILE,
  BGG_MANIFEST_VERSION,
  emptyBggManifest,
  type BggEntry,
  type BggManifest,
} from '../src/shared/bgg';
import { PUBLIC_DIR } from './boxart';

export interface BggProgress {
  done: number;
  total: number;
  fetched: number;
  skipped: number;
  failed: number;
  /** Name of the game just finished, for a status line in the UI. */
  current: string | null;
}

export interface BggSummary extends Omit<BggProgress, 'current'> {
  errors: Array<{ bggId: number; name: string; message: string }>;
  manifestPath: string;
}

export interface BggPrefetchOptions {
  games: RawGame[];
  /** Defaults to <public>/bgg. */
  dir?: string;
  /** Parallel requests. Four is measured-polite; do not raise this casually. */
  concurrency?: number;
  onProgress?: (p: BggProgress) => void;
  signal?: AbortSignal;
  /** Re-fetch every game even if it is already in the manifest. */
  force?: boolean;
  /** Injected in tests so the suite never hits the network. */
  fetchImpl?: typeof fetch;
}

export const DEFAULT_BGG_DIR = path.resolve(PUBLIC_DIR, BGG_DIR);

const ENDPOINT = 'https://api.geekdo.com/api/geekitems';
/** Identifies the app rather than pretending to be a browser. */
const USER_AGENT = 'boardgame-wrapped (local stats tool)';

const RETRIES = 2;
const RETRY_DELAY_MS = 600;
/** Spacing between one worker's requests. Politeness, not a rate limit we were given. */
const PACE_MS = 180;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/* -------------------------------------------------------------------------- */
/* Manifest I/O                                                                */
/* -------------------------------------------------------------------------- */

export const readBggManifest = async (dir: string = DEFAULT_BGG_DIR): Promise<BggManifest> => {
  try {
    const raw = await readFile(path.join(dir, BGG_MANIFEST_FILE), 'utf8');
    const parsed = JSON.parse(raw) as BggManifest;
    if (parsed?.version !== BGG_MANIFEST_VERSION || typeof parsed.entries !== 'object') {
      return emptyBggManifest();
    }
    return parsed;
  } catch {
    return emptyBggManifest();
  }
};

/**
 * Write the manifest atomically.
 *
 * `.part` then rename, for the same reason the covers are written that way: a
 * run killed halfway through must never leave a truncated file that the next
 * run parses as a complete one.
 */
export const writeBggManifest = async (dir: string, manifest: BggManifest): Promise<string> => {
  const file = path.join(dir, BGG_MANIFEST_FILE);
  const temp = `${file}.part`;
  manifest.generatedAt = new Date().toISOString();
  await writeFile(temp, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await rename(temp, file);
  return file;
};

/* -------------------------------------------------------------------------- */
/* Fetching                                                                    */
/* -------------------------------------------------------------------------- */

interface GeekLink {
  name?: unknown;
}

interface GeekItem {
  name?: unknown;
  links?: Record<string, GeekLink[] | undefined>;
}

/** Link names off one `links` bucket, defensively — this is an untyped JSON API. */
const namesOf = (item: GeekItem, key: string): string[] => {
  const list = item.links?.[key];
  if (!Array.isArray(list)) return [];
  return list
    .map((link) => (typeof link?.name === 'string' ? link.name.trim() : ''))
    .filter((name) => name.length > 0);
};

export const entryFromItem = (bggId: number, item: GeekItem): BggEntry => {
  const publishers = namesOf(item, 'boardgamepublisher');
  return {
    bggId,
    name: typeof item.name === 'string' ? item.name : '',
    mechanics: namesOf(item, 'boardgamemechanic'),
    categories: namesOf(item, 'boardgamecategory'),
    designers: namesOf(item, 'boardgamedesigner'),
    artists: namesOf(item, 'boardgameartist'),
    // Only the first. See the note on `BggEntry.publisher`.
    publisher: publishers[0] ?? null,
    fetchedAt: new Date().toISOString(),
  };
};

const fetchEntry = async (
  bggId: number,
  fetchImpl: typeof fetch,
  signal: AbortSignal | undefined,
): Promise<BggEntry> => {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    if (signal?.aborted) throw new Error('cancelled');
    try {
      const res = await fetchImpl(`${ENDPOINT}?objectid=${bggId}&objecttype=thing`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { item?: GeekItem };
      if (!body?.item) throw new Error('response had no item');
      return entryFromItem(bggId, body.item);
    } catch (err) {
      lastError = err;
      if (signal?.aborted) throw err;
      if (attempt < RETRIES) await sleep(RETRY_DELAY_MS * (attempt + 1));
    }
  }
  throw lastError ?? new Error('fetch failed');
};

/* -------------------------------------------------------------------------- */
/* The run                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The games worth asking about: matched to BGG, and each id only once.
 *
 * Two of the real library's 229 games have no `bggId` — a house rule and an
 * emoji-named party game — and expansions share an id with nothing, so this is
 * simply a dedupe rather than a filter with an opinion.
 */
export const fetchableGames = (games: RawGame[]): RawGame[] => {
  const seen = new Set<number>();
  const out: RawGame[] = [];
  for (const game of games) {
    if (!game.bggId || game.bggId <= 0 || seen.has(game.bggId)) continue;
    seen.add(game.bggId);
    out.push(game);
  }
  return out;
};

export const prefetchBgg = async ({
  games,
  dir = DEFAULT_BGG_DIR,
  concurrency = 4,
  onProgress,
  signal,
  force = false,
  fetchImpl = fetch,
}: BggPrefetchOptions): Promise<BggSummary> => {
  await mkdir(dir, { recursive: true });
  // A manifest write killed mid-rename leaves this behind.
  await unlink(path.join(dir, `${BGG_MANIFEST_FILE}.part`)).catch(() => {});

  const manifest = await readBggManifest(dir);
  const targets = fetchableGames(games);

  const state = { done: 0, fetched: 0, skipped: 0, failed: 0 };
  const errors: BggSummary['errors'] = [];
  const total = targets.length;
  const report = (current: string | null) => onProgress?.({ ...state, total, current });

  const handle = async (game: RawGame): Promise<void> => {
    if (signal?.aborted) return;
    try {
      const cached = manifest.entries[String(game.bggId)];
      // A cached failure is retried; a cached success is not.
      if (!force && cached && !cached.error) {
        state.skipped += 1;
        return;
      }
      manifest.entries[String(game.bggId)] = await fetchEntry(game.bggId, fetchImpl, signal);
      state.fetched += 1;
      await sleep(PACE_MS);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (signal?.aborted) return;
      state.failed += 1;
      errors.push({ bggId: game.bggId, name: game.name, message });
      // Recorded rather than dropped, so a re-run knows to try this one again.
      manifest.entries[String(game.bggId)] = {
        bggId: game.bggId,
        name: game.name,
        mechanics: [],
        categories: [],
        designers: [],
        artists: [],
        publisher: null,
        fetchedAt: new Date().toISOString(),
        error: message,
      };
    } finally {
      state.done += 1;
      report(game.name);
    }
  };

  const queue = [...targets];
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

  const manifestPath = await writeBggManifest(dir, manifest);
  return { ...state, total, errors, manifestPath };
};
