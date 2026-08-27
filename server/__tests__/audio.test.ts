import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AudioError,
  addTrack,
  buildPeaks,
  decodePcm,
  findFfmpeg,
  importTrack,
  parseWavPcm16,
  readAudioManifest,
  removeTrack,
  trackIdFor,
  updateTrack,
} from '../audio';

/** A 16-bit mono WAV with a click on every beat. */
const clickWav = ({ bpm = 120, seconds = 20, offset = 0, sampleRate = 22050 } = {}): Buffer => {
  const n = Math.floor(seconds * sampleRate);
  const pcm = new Int16Array(n);
  const interval = (60 / bpm) * sampleRate;
  for (let beat = 0; ; beat += 1) {
    const start = Math.floor(offset * sampleRate + beat * interval);
    if (start >= n) break;
    const len = Math.floor(sampleRate * 0.05);
    for (let i = 0; i < len && start + i < n; i += 1) {
      const t = i / sampleRate;
      pcm[start + i] = Math.round(Math.sin(2 * Math.PI * 200 * t) * Math.exp(-t * 40) * 22000);
    }
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length * 2, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length * 2, 40);
  return Buffer.concat([header, Buffer.from(pcm.buffer)]);
};

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'bgw-audio-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('WAV parsing', () => {
  it('reads samples out of a well-formed file', () => {
    const samples = parseWavPcm16(clickWav({ seconds: 1 }));
    expect(samples.length).toBe(22050);
    expect(Math.max(...Array.from(samples).map(Math.abs))).toBeGreaterThan(0.5);
  });

  it('finds the data chunk after a metadata chunk', () => {
    // ffmpeg writes a LIST chunk before the audio, so assuming data starts at
    // byte 44 would read metadata as samples.
    const base = clickWav({ seconds: 1 });
    const list = Buffer.alloc(8 + 20);
    list.write('LIST', 0);
    list.writeUInt32LE(20, 4);
    list.write('INFOISFT', 8);
    const withList = Buffer.concat([base.subarray(0, 36), list, base.subarray(36)]);
    withList.writeUInt32LE(withList.length - 8, 4);

    expect(parseWavPcm16(withList).length).toBe(22050);
  });

  it('refuses anything that is not RIFF', () => {
    expect(() => parseWavPcm16(Buffer.from('not a wav at all'))).toThrow(AudioError);
    expect(() => parseWavPcm16(Buffer.alloc(4))).toThrow(AudioError);
  });

  it('refuses a RIFF file with no audio', () => {
    const header = Buffer.alloc(12);
    header.write('RIFF', 0);
    header.writeUInt32LE(4, 4);
    header.write('WAVE', 8);
    expect(() => parseWavPcm16(header)).toThrow(AudioError);
  });
});

describe('peaks', () => {
  it('downsamples to the requested count', () => {
    expect(buildPeaks(new Float32Array(100000), 480)).toHaveLength(480);
  });

  it('keeps the loudest sample in each bucket', () => {
    const samples = new Float32Array(1000);
    samples[500] = -0.9;
    const peaks = buildPeaks(samples, 10);
    // Absolute value, so a negative peak still registers.
    expect(Math.max(...peaks)).toBeCloseTo(0.9, 2);
  });

  it('handles an empty signal', () => {
    expect(buildPeaks(new Float32Array(0))).toEqual([]);
  });
});

describe('track ids', () => {
  it('are filesystem-safe and keep the name recognizable', () => {
    expect(trackIdFor('My Song (Final Mix).mp3')).toMatch(/^my-song-final-mix-[a-z0-9]+$/);
  });

  it('do not collide for the same name', async () => {
    const first = trackIdFor('song.mp3');
    await new Promise((r) => setTimeout(r, 2));
    expect(trackIdFor('song.mp3')).not.toBe(first);
  });

  it('survive a name with nothing usable in it', () => {
    expect(trackIdFor('♪♫.mp3')).toMatch(/^track-/);
  });
});

describe('importing', () => {
  it('rejects a format ffmpeg would not be asked to read', async () => {
    await expect(importTrack(Buffer.from('x'), 'clip.mp4', { dir })).rejects.toThrow(AudioError);
  });

  it('rejects an empty file', async () => {
    await expect(importTrack(Buffer.alloc(0), 'song.mp3', { dir })).rejects.toThrow(AudioError);
  });

  it('leaves nothing behind when the file will not decode', async () => {
    await expect(
      importTrack(Buffer.from('this is not audio'), 'broken.mp3', { dir }),
    ).rejects.toThrow(AudioError);
    // The half-written .part must be swept, not left to look like a track.
    expect(await readdir(dir)).toEqual([]);
  });
});

describe('the manifest', () => {
  const sample = (over = {}) => ({
    id: 'demo',
    file: 'demo.wav',
    name: 'Demo',
    bpm: 120,
    beatOffset: 0.2,
    confidence: 0.9,
    durationSeconds: 60,
    trimStart: 0,
    trimEnd: 60,
    license: 'CC0',
    credit: 'Someone',
    peaks: [0.1, 0.9],
    source: 'upload' as const,
    addedAt: '2026-08-27T00:00:00.000Z',
    ...over,
  });

  it('starts empty and round-trips a track', async () => {
    expect((await readAudioManifest(dir)).tracks).toEqual([]);
    await addTrack(sample(), dir);
    const manifest = await readAudioManifest(dir);
    expect(manifest.tracks).toHaveLength(1);
    expect(manifest.tracks[0].name).toBe('Demo');
  });

  it('records a licence and a credit for every track', async () => {
    // Step 8, test case 6.
    await addTrack(sample(), dir);
    for (const track of (await readAudioManifest(dir)).tracks) {
      expect(track.license).toBeTruthy();
      expect(typeof track.credit).toBe('string');
    }
  });

  it('replaces rather than duplicates on re-add', async () => {
    await addTrack(sample(), dir);
    await addTrack(sample({ name: 'Renamed' }), dir);
    const manifest = await readAudioManifest(dir);
    expect(manifest.tracks).toHaveLength(1);
    expect(manifest.tracks[0].name).toBe('Renamed');
  });

  it('updates the crop', async () => {
    await addTrack(sample(), dir);
    const updated = await updateTrack('demo', { trimStart: 8, trimEnd: 30 }, dir);
    expect(updated?.trimStart).toBe(8);
    expect(updated?.trimEnd).toBe(30);
  });

  it('refuses to let a caller rewrite identity or analysis-derived facts', async () => {
    await addTrack(sample(), dir);
    const updated = await updateTrack(
      'demo',
      { id: 'hijacked', file: 'other.wav', peaks: [], durationSeconds: 1, name: 'Fine' } as never,
      dir,
    );
    expect(updated?.id).toBe('demo');
    expect(updated?.file).toBe('demo.wav');
    expect(updated?.durationSeconds).toBe(60);
    expect(updated?.peaks).toEqual([0.1, 0.9]);
    // ...but the editable field did change.
    expect(updated?.name).toBe('Fine');
  });

  it('returns null for a track that is not there', async () => {
    expect(await updateTrack('nope', { name: 'x' }, dir)).toBeNull();
    expect(await removeTrack('nope', dir)).toBe(false);
  });

  it('removes a track and its file', async () => {
    await writeFile(path.join(dir, 'demo.wav'), clickWav({ seconds: 1 }));
    await addTrack(sample(), dir);
    expect(await removeTrack('demo', dir)).toBe(true);
    expect((await readAudioManifest(dir)).tracks).toEqual([]);
    expect(await readdir(dir)).not.toContain('demo.wav');
  });

  it('ignores a manifest from an older shape', async () => {
    await writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ version: 0, tracks: 'nope' }));
    expect((await readAudioManifest(dir)).tracks).toEqual([]);
  });
});

/**
 * These need the ffmpeg binary Remotion bundles. It is present on every
 * platform Remotion supports, but the suite should report a clear skip rather
 * than a confusing failure if it is ever missing.
 */
describe.skipIf(!findFfmpeg())('decoding through ffmpeg', () => {
  it('decodes a WAV and detects its tempo', async () => {
    const file = path.join(dir, 'click.wav');
    await writeFile(file, clickWav({ bpm: 128, seconds: 20 }));

    const samples = await decodePcm(file);
    expect(samples.length).toBeGreaterThan(20 * 22050 * 0.9);

    const track = await importTrack(clickWav({ bpm: 128, seconds: 20 }), 'Click 128.wav', { dir });
    expect(track.bpm).toBeGreaterThan(126);
    expect(track.bpm).toBeLessThan(130);
    expect(track.peaks.length).toBeGreaterThan(0);
    expect(track.durationSeconds).toBeCloseTo(20, 0);
    expect(track.trimEnd).toBeCloseTo(track.durationSeconds, 3);
  });

  it('honours a tempo supplied by hand instead of detecting one', async () => {
    const track = await importTrack(clickWav({ bpm: 128, seconds: 20 }), 'x.wav', {
      dir,
      knownBpm: 100,
    });
    expect(track.bpm).toBeCloseTo(100, 1);
  });

  it('stores the file under its track id', async () => {
    const track = await importTrack(clickWav({ seconds: 10 }), 'My Track.wav', { dir });
    expect(track.file).toBe(`${track.id}.wav`);
    expect(await readdir(dir)).toContain(track.file);
  });
});
