/**
 * Local render service. Step 1 provided the route and the bundle cache; step 10
 * fills in renderMedia(). Step 5 added the box art prefetch, which has to live
 * here rather than in the browser because it writes files to public/boxart.
 *
 * Nothing here talks to the network except the prefetch, which fetches covers
 * from the image host and then never needs the network again.
 */
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_DIR, prefetchBoxArt, readManifest, type PrefetchProgress, type PrefetchSummary } from './boxart';
import {
  AudioError,
  addTrack,
  importTrack,
  MAX_UPLOAD_BYTES,
  readAudioManifest,
  reanalyzeTrack,
  removeTrack,
  scanForNewTracks,
  updateTrack,
} from './audio';
import {
  outputFileName,
  revealInFolder,
  startRender,
  type RenderInput,
  type RenderJob,
} from './render';
import { startBatch, type BatchJob, type BatchRequestItem } from './batch';
import type { RawGame } from '../src/shared/types';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(dirname, '..', 'out');
const PORT = 4000;

const app = express();
// Covers run to ~1MB each and the games[] array of a large export is chunky.
app.use(express.json({ limit: '32mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, outDir: OUT_DIR });
});

/* -------------------------------------------------------------------------- */
/* Box art                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * One run at a time. The UI polls /boxart/progress rather than holding a
 * request open for the length of a 229-cover download.
 */
interface RunState {
  progress: PrefetchProgress;
  summary: PrefetchSummary | null;
  error: string | null;
  controller: AbortController;
}

let run: RunState | null = null;

app.get('/boxart/manifest', async (_req, res) => {
  res.json(await readManifest(DEFAULT_DIR));
});

app.get('/boxart/progress', (_req, res) => {
  if (!run) {
    res.json({ running: false, progress: null, summary: null, error: null });
    return;
  }
  res.json({
    running: run.summary === null && run.error === null,
    progress: run.progress,
    summary: run.summary,
    error: run.error,
  });
});

app.post('/boxart/prefetch', (req, res) => {
  if (run && run.summary === null && run.error === null) {
    res.status(409).json({ error: 'A prefetch is already running.' });
    return;
  }

  const games = (req.body?.games ?? []) as RawGame[];
  if (!Array.isArray(games) || games.length === 0) {
    res.status(400).json({ error: 'Send { games: RawGame[] } from the loaded export.' });
    return;
  }

  const controller = new AbortController();
  const state: RunState = {
    progress: { done: 0, total: games.length, downloaded: 0, skipped: 0, fallback: 0, failed: 0, current: null },
    summary: null,
    error: null,
    controller,
  };
  run = state;

  // Kicked off without awaiting: the response returns immediately and the UI
  // follows along by polling.
  void prefetchBoxArt({
    games,
    signal: controller.signal,
    onProgress: (p) => {
      state.progress = p;
    },
  })
    .then((summary) => {
      state.summary = summary;
    })
    .catch((err: unknown) => {
      state.error = err instanceof Error ? err.message : String(err);
    });

  res.status(202).json({ started: true, total: games.length });
});

app.post('/boxart/cancel', (_req, res) => {
  if (!run || run.summary !== null || run.error !== null) {
    res.status(409).json({ error: 'Nothing to cancel.' });
    return;
  }
  run.controller.abort();
  res.json({ cancelled: true });
});

/* -------------------------------------------------------------------------- */
/* Soundtrack                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Uploads arrive as a raw body rather than multipart: there is exactly one file
 * and one filename, and a multipart parser would be a dependency to do less.
 */
const rawAudio = express.raw({ type: 'application/octet-stream', limit: MAX_UPLOAD_BYTES });

app.get('/audio/manifest', async (_req, res) => {
  res.json(await readAudioManifest());
});

app.post('/audio/upload', rawAudio, async (req, res) => {
  const name = String(req.query.name ?? 'track.mp3');
  const bpm = req.query.bpm ? Number(req.query.bpm) : undefined;

  try {
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ error: 'Send the audio file as the raw request body.' });
      return;
    }
    const track = await importTrack(body, name, {
      knownBpm: Number.isFinite(bpm) && bpm! > 0 ? bpm : undefined,
      license: typeof req.query.license === 'string' ? req.query.license : undefined,
      credit: typeof req.query.credit === 'string' ? req.query.credit : undefined,
    });
    await addTrack(track);
    res.status(201).json({ track });
  } catch (err) {
    // A bad file is the user's problem to see, not a 500.
    const message = err instanceof Error ? err.message : String(err);
    res.status(err instanceof AudioError ? 400 : 500).json({ error: message });
  }
});

/** Crop, rename, credit. The analysis-derived fields are not editable here. */
app.patch('/audio/track/:id', async (req, res) => {
  const updated = await updateTrack(req.params.id, req.body ?? {});
  if (!updated) {
    res.status(404).json({ error: 'No such track.' });
    return;
  }
  res.json({ track: updated });
});

/** Re-run detection, optionally forcing a tempo the user typed in. */
app.post('/audio/track/:id/analyze', async (req, res) => {
  const manifest = await readAudioManifest();
  const track = manifest.tracks.find((t) => t.id === req.params.id);
  if (!track) {
    res.status(404).json({ error: 'No such track.' });
    return;
  }

  try {
    const bpm = req.body?.bpm ? Number(req.body.bpm) : undefined;
    const analysis = await reanalyzeTrack(track, Number.isFinite(bpm) && bpm! > 0 ? bpm : undefined);
    const updated = await updateTrack(track.id, {
      bpm: analysis.bpm,
      beatOffset: Math.round(analysis.beatOffset * 1000) / 1000,
      confidence: Math.round(analysis.confidence * 100) / 100,
    });
    res.json({ track: updated });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.delete('/audio/track/:id', async (req, res) => {
  const removed = await removeTrack(req.params.id);
  res.status(removed ? 200 : 404).json({ removed });
});

/** Pick up tracks dropped into public/audio by hand. */
app.post('/audio/scan', async (_req, res) => {
  try {
    res.json({ added: await scanForNewTracks() });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/* -------------------------------------------------------------------------- */
/* Render                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One render at a time.
 *
 * Remotion opens a browser per render and saturates the CPU; two at once take
 * longer than two in sequence and are far more likely to run out of memory.
 * Step 11 turns this into a proper queue.
 */
let job: RenderJob | null = null;

const isRunning = (current: RenderJob | null): current is RenderJob =>
  current !== null &&
  current.progress.phase !== 'done' &&
  current.progress.phase !== 'failed' &&
  current.progress.phase !== 'cancelled';

app.post('/render', (req, res) => {
  if (isRunning(job)) {
    res.status(409).json({ error: 'A render is already running.' });
    return;
  }

  const body = req.body as Partial<RenderInput> | undefined;
  if (!body?.stats?.playerName) {
    res.status(400).json({ error: 'Send { stats, theme, track, slides } with a playerName.' });
    return;
  }

  const input: RenderInput = {
    stats: body.stats,
    theme: body.theme ?? null,
    track: body.track ?? null,
    slides: body.slides ?? null,
  };

  job = startRender(input);
  // Nothing awaits the render: the response returns now and the UI polls.
  void job.done;
  res.status(202).json({ started: true, file: outputFileName(input) });
});

app.get('/render/progress', (_req, res) => {
  if (!job) {
    res.json({ running: false, progress: null });
    return;
  }
  res.json({ running: isRunning(job), progress: job.progress });
});

app.post('/render/cancel', (_req, res) => {
  if (!isRunning(job)) {
    res.status(409).json({ error: 'Nothing to cancel.' });
    return;
  }
  job.cancel();
  res.json({ cancelled: true });
});

/* -------------------------------------------------------------------------- */
/* Batch                                                                       */
/* -------------------------------------------------------------------------- */

let batch: BatchJob | null = null;

app.post('/batch', (req, res) => {
  if (batch?.state.running || isRunning(job)) {
    res.status(409).json({ error: 'A render is already running.' });
    return;
  }

  const items = (req.body?.items ?? []) as BatchRequestItem[];
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'Send { items: [...] } with at least one player.' });
    return;
  }
  const bad = items.find((item) => !item?.stats?.playerName);
  if (bad) {
    res.status(400).json({ error: 'Every item needs stats with a playerName.' });
    return;
  }

  batch = startBatch({ items, minPlays: Number(req.body?.minPlays ?? 0) || 0 });
  void batch.done;
  res.status(202).json({ started: true, total: items.length });
});

app.get('/batch/progress', (_req, res) => {
  if (!batch) {
    res.json({ running: false, state: null });
    return;
  }
  res.json({ running: batch.state.running, state: batch.state });
});

app.post('/batch/cancel', (_req, res) => {
  if (!batch?.state.running) {
    res.status(409).json({ error: 'Nothing to cancel.' });
    return;
  }
  batch.cancel();
  res.json({ cancelled: true });
});

/** Reveal the finished file in the OS file manager. */
app.post('/render/reveal', async (_req, res) => {
  // Falls back to the last file a batch produced, so the button works after
  // either kind of render.
  const file =
    job?.progress.outputFile ??
    [...(batch?.state.items ?? [])].reverse().find((i) => i.file)?.file ??
    null;
  if (!file) {
    res.status(409).json({ error: 'Nothing has been rendered yet.' });
    return;
  }
  await revealInFolder(file);
  res.json({ opened: true });
});

app.listen(PORT, () => {
  console.log(`Render service on http://localhost:${PORT}`);
});
