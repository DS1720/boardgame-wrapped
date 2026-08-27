/**
 * Soundtrack storage and analysis (Node only).
 *
 * Uploaded tracks land in public/audio, get decoded to mono PCM, analysed for
 * tempo and downbeat, and recorded in a manifest the renderer reads. Same shape
 * as box art and fonts: the browser triggers it, the server owns the files.
 */
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { analyzeBeats, type BeatAnalysis } from '../src/audio/analyze';
import {
  AUDIO_MANIFEST_FILE,
  AUDIO_MANIFEST_VERSION,
  emptyAudioManifest,
  extensionOf,
  isSupportedAudio,
  type AudioManifest,
  type Track,
} from '../src/shared/audio';

const execFileAsync = promisify(execFile);
const require_ = createRequire(import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
export const AUDIO_DIR = path.resolve(here, '..', 'public', 'audio');

/** Analysis rate. Plenty for onset detection and four times faster than 44.1k. */
const ANALYSIS_SAMPLE_RATE = 22050;

/** How many peaks the crop UI gets. Enough to see structure at 1000px wide. */
const PEAK_COUNT = 480;

/** Uploads are capped so a dropped video file cannot fill the disk. */
export const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;

/**
 * Remotion ships an ffmpeg binary for its own rendering; reusing it means no
 * second dependency and no assumption that the user has ffmpeg on PATH.
 */
export const findFfmpeg = (): string | null => {
  for (const pkg of [
    '@remotion/compositor-win32-x64-msvc',
    '@remotion/compositor-darwin-arm64',
    '@remotion/compositor-darwin-x64',
    '@remotion/compositor-linux-x64-gnu',
    '@remotion/compositor-linux-arm64-gnu',
  ]) {
    try {
      const dir = path.dirname(require_.resolve(`${pkg}/package.json`));
      const binary = path.join(dir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
      return binary;
    } catch {
      // Not the platform package for this machine; try the next.
    }
  }
  return null;
};

export class AudioError extends Error {}

/**
 * Pull mono float samples out of a 16-bit PCM WAV.
 *
 * The `data` chunk is located by walking the RIFF chunk list rather than
 * assuming it starts at byte 44: ffmpeg writes a `LIST` metadata chunk before
 * it, so the fixed-offset shortcut reads metadata as audio.
 */
export const parseWavPcm16 = (buffer: Buffer): Float32Array => {
  if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF') {
    throw new AudioError('Decoded output is not a RIFF file.');
  }

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === 'data') {
      const end = Math.min(start + size, buffer.length);
      const count = (end - start) >> 1;
      const samples = new Float32Array(count);
      for (let i = 0; i < count; i += 1) {
        samples[i] = buffer.readInt16LE(start + i * 2) / 32768;
      }
      return samples;
    }
    // Chunks are word-aligned, so an odd size is followed by a pad byte.
    offset = start + size + (size % 2);
  }
  throw new AudioError('Decoded output has no audio data.');
};

/**
 * Decode any audio file to mono float samples.
 *
 * Goes through ffmpeg rather than parsing formats here: mp3, m4a, ogg and flac
 * by hand would be a project of its own, and the binary is already on disk for
 * Remotion's own rendering.
 *
 * Note the route: a temporary 16-bit WAV, not raw float on stdout. Remotion's
 * bundled ffmpeg is built lean — it has only the `wav` muxer and only the
 * `pcm_s16le` encoder, so `-f f32le` fails with "format not known". 16-bit is
 * well beyond what onset detection needs.
 */
export const decodePcm = async (
  file: string,
  sampleRate = ANALYSIS_SAMPLE_RATE,
): Promise<Float32Array> => {
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) throw new AudioError('No bundled ffmpeg found for this platform.');

  const scratch = path.join(tmpdir(), `bgw-decode-${process.pid}-${Date.now()}.wav`);
  try {
    await execFileAsync(ffmpeg, [
      '-y',
      '-v', 'error',
      '-i', file,
      '-acodec', 'pcm_s16le',
      '-ac', '1',
      '-ar', String(sampleRate),
      scratch,
    ]);
    return parseWavPcm16(await readFile(scratch));
  } catch (err) {
    if (err instanceof AudioError) throw err;
    // ffmpeg's failure is a full command line and a stack of absolute paths.
    // None of that helps someone who dragged in the wrong file, and it puts
    // this machine's directory layout on screen.
    throw new AudioError('That file could not be decoded as audio.');
  } finally {
    await unlink(scratch).catch(() => {});
  }
};

/** Absolute peaks, downsampled for drawing. */
export const buildPeaks = (samples: Float32Array, count = PEAK_COUNT): number[] => {
  if (samples.length === 0) return [];
  const bucket = Math.max(1, Math.floor(samples.length / count));
  const peaks: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const start = i * bucket;
    if (start >= samples.length) break;
    const end = Math.min(start + bucket, samples.length);
    let peak = 0;
    for (let j = start; j < end; j += 1) {
      const value = Math.abs(samples[j]);
      if (value > peak) peak = value;
    }
    peaks.push(Math.round(peak * 1000) / 1000);
  }
  return peaks;
};

/* -------------------------------------------------------------------------- */
/* Manifest                                                                    */
/* -------------------------------------------------------------------------- */

export const readAudioManifest = async (dir = AUDIO_DIR): Promise<AudioManifest> => {
  try {
    const parsed = JSON.parse(
      await readFile(path.join(dir, AUDIO_MANIFEST_FILE), 'utf8'),
    ) as AudioManifest;
    if (parsed?.version !== AUDIO_MANIFEST_VERSION || !Array.isArray(parsed.tracks)) {
      return emptyAudioManifest();
    }
    return parsed;
  } catch {
    return emptyAudioManifest();
  }
};

export const writeAudioManifest = async (
  manifest: AudioManifest,
  dir = AUDIO_DIR,
): Promise<string> => {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, AUDIO_MANIFEST_FILE);
  manifest.generatedAt = new Date().toISOString();
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return file;
};

/* -------------------------------------------------------------------------- */
/* Import                                                                      */
/* -------------------------------------------------------------------------- */

/** Filesystem-safe, collision-resistant, still recognizable in a directory listing. */
export const trackIdFor = (originalName: string): string => {
  const base = originalName
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 48);
  return `${base || 'track'}-${Date.now().toString(36)}`;
};

export interface ImportOptions {
  dir?: string;
  /** Skip detection and use this tempo, for a track whose bpm is already known. */
  knownBpm?: number;
  license?: string;
  credit?: string;
  name?: string;
}

/**
 * Store an uploaded file and analyse it.
 *
 * Written to a `.part` file and renamed once complete, the same rule as box art:
 * a half-written track must never appear in the directory as a usable one.
 */
export const importTrack = async (
  bytes: Buffer,
  originalName: string,
  { dir = AUDIO_DIR, knownBpm, license = 'User supplied', credit = '', name }: ImportOptions = {},
): Promise<Track> => {
  if (!isSupportedAudio(originalName)) {
    throw new AudioError(`Unsupported audio format: .${extensionOf(originalName) || '?'}`);
  }
  if (bytes.length === 0) throw new AudioError('That file is empty.');
  if (bytes.length > MAX_UPLOAD_BYTES) {
    throw new AudioError(`That file is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`);
  }

  await mkdir(dir, { recursive: true });
  const id = trackIdFor(originalName);
  const file = `${id}.${extensionOf(originalName)}`;
  const finalPath = path.join(dir, file);
  const partPath = `${finalPath}.part`;

  await writeFile(partPath, bytes);
  try {
    const samples = await decodePcm(partPath);
    const analysis = analyzeBeats(samples, ANALYSIS_SAMPLE_RATE, { knownBpm });
    await rename(partPath, finalPath);

    return {
      id,
      file,
      name: name?.trim() || originalName.replace(/\.[^.]+$/, ''),
      bpm: analysis.bpm,
      beatOffset: Math.round(analysis.beatOffset * 1000) / 1000,
      confidence: Math.round(analysis.confidence * 100) / 100,
      durationSeconds: Math.round(analysis.durationSeconds * 1000) / 1000,
      trimStart: 0,
      trimEnd: Math.round(analysis.durationSeconds * 1000) / 1000,
      license,
      credit,
      peaks: buildPeaks(samples),
      source: 'upload',
      addedAt: new Date().toISOString(),
    };
  } catch (err) {
    await unlink(partPath).catch(() => {});
    if (err instanceof AudioError) throw err;
    throw new AudioError('That file could not be read as audio.');
  }
};

/** Re-run detection on a stored track, optionally with a tempo supplied by hand. */
export const reanalyzeTrack = async (
  track: Track,
  knownBpm?: number,
  dir = AUDIO_DIR,
): Promise<BeatAnalysis> => {
  const samples = await decodePcm(path.join(dir, track.file));
  return analyzeBeats(samples, ANALYSIS_SAMPLE_RATE, { knownBpm });
};

export const addTrack = async (track: Track, dir = AUDIO_DIR): Promise<AudioManifest> => {
  const manifest = await readAudioManifest(dir);
  manifest.tracks = [track, ...manifest.tracks.filter((t) => t.id !== track.id)];
  await writeAudioManifest(manifest, dir);
  return manifest;
};

export const updateTrack = async (
  id: string,
  patch: Partial<Track>,
  dir = AUDIO_DIR,
): Promise<Track | null> => {
  const manifest = await readAudioManifest(dir);
  const index = manifest.tracks.findIndex((t) => t.id === id);
  if (index === -1) return null;

  // Identity and analysis-derived facts are not the caller's to rewrite; the
  // crop, the name and the credit are.
  const { id: _id, file: _file, peaks: _peaks, durationSeconds: _duration, ...editable } = patch;
  const updated = { ...manifest.tracks[index], ...editable };
  manifest.tracks[index] = updated;
  await writeAudioManifest(manifest, dir);
  return updated;
};

export const removeTrack = async (id: string, dir = AUDIO_DIR): Promise<boolean> => {
  const manifest = await readAudioManifest(dir);
  const track = manifest.tracks.find((t) => t.id === id);
  if (!track) return false;

  manifest.tracks = manifest.tracks.filter((t) => t.id !== id);
  await writeAudioManifest(manifest, dir);
  // The manifest is the record of what exists, so it is updated first; a file
  // that fails to unlink is orphaned rather than half-referenced.
  await unlink(path.join(dir, track.file)).catch(() => {});
  return true;
};

/**
 * Adopt audio files sitting in public/audio that the manifest does not know
 * about — tracks downloaded by hand from Pixabay or the YouTube library.
 */
export const scanForNewTracks = async (dir = AUDIO_DIR): Promise<Track[]> => {
  await mkdir(dir, { recursive: true });
  const manifest = await readAudioManifest(dir);
  const known = new Set(manifest.tracks.map((t) => t.file));
  const files = (await readdir(dir).catch(() => [] as string[])).filter(
    (f) => isSupportedAudio(f) && !known.has(f) && !f.endsWith('.part'),
  );

  const added: Track[] = [];
  for (const file of files) {
    try {
      const full = path.join(dir, file);
      const samples = await decodePcm(full);
      const analysis = analyzeBeats(samples, ANALYSIS_SAMPLE_RATE);
      added.push({
        id: trackIdFor(file),
        file,
        name: file.replace(/\.[^.]+$/, ''),
        bpm: analysis.bpm,
        beatOffset: Math.round(analysis.beatOffset * 1000) / 1000,
        confidence: Math.round(analysis.confidence * 100) / 100,
        durationSeconds: Math.round(analysis.durationSeconds * 1000) / 1000,
        trimStart: 0,
        trimEnd: Math.round(analysis.durationSeconds * 1000) / 1000,
        license: 'Unknown — set this before publishing',
        credit: '',
        peaks: buildPeaks(samples),
        source: 'bundled',
        addedAt: new Date().toISOString(),
      });
    } catch {
      // A file that will not decode is simply not a track.
    }
  }

  if (added.length > 0) {
    manifest.tracks = [...manifest.tracks, ...added];
    await writeAudioManifest(manifest, dir);
  }
  return added;
};
