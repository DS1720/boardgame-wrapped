import { describe, expect, it } from 'vitest';
import {
  analyzeBeats,
  bpmToLag,
  combScore,
  ENVELOPE_RATE,
  estimatePhase,
  estimateTempo,
  FALLBACK_BPM,
  foldTempo,
  lagToBpm,
  normalizeEnvelope,
  onsetEnvelope,
  refineLag,
} from '../analyze';

const SAMPLE_RATE = 22050;

/**
 * A click track: a short decaying burst on every beat, silence between.
 * This is the signal the detector should be best at, so it is the floor.
 */
const clickTrack = ({
  bpm,
  seconds = 20,
  offset = 0,
  accentEvery = 0,
  noise = 0,
  sampleRate = SAMPLE_RATE,
}: {
  bpm: number;
  seconds?: number;
  offset?: number;
  /** Make every Nth click louder, to create a downbeat. */
  accentEvery?: number;
  noise?: number;
  sampleRate?: number;
}): Float32Array => {
  const samples = new Float32Array(Math.floor(seconds * sampleRate));
  if (noise > 0) {
    // Deterministic pseudo-noise, so a failure is reproducible.
    let seed = 12345;
    for (let i = 0; i < samples.length; i += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      samples[i] += ((seed / 2 ** 32) * 2 - 1) * noise;
    }
  }

  const interval = (60 / bpm) * sampleRate;
  const burst = Math.floor(sampleRate * 0.03);
  for (let beat = 0; ; beat += 1) {
    const start = Math.floor(offset * sampleRate + beat * interval);
    if (start + burst >= samples.length) break;
    const gain = accentEvery > 0 && beat % accentEvery === 0 ? 1 : 0.5;
    for (let i = 0; i < burst; i += 1) {
      const decay = Math.exp(-i / (sampleRate * 0.006));
      samples[start + i] += Math.sin((2 * Math.PI * 1000 * i) / sampleRate) * decay * gain;
    }
  }
  return samples;
};

describe('onset envelope', () => {
  it('spikes on each click and stays flat between', () => {
    const envelope = normalizeEnvelope(onsetEnvelope(clickTrack({ bpm: 120 }), SAMPLE_RATE));
    // 120 BPM over 20s is 40 clicks; peaks should be sparse, not everywhere.
    const loud = Array.from(envelope).filter((v) => v > 0.3).length;
    expect(loud).toBeGreaterThan(10);
    expect(loud).toBeLessThan(envelope.length / 4);
  });

  it('is empty for a signal shorter than one frame', () => {
    expect(onsetEnvelope(new Float32Array(4), SAMPLE_RATE)).toHaveLength(0);
  });

  it('produces nothing for silence', () => {
    const envelope = onsetEnvelope(new Float32Array(SAMPLE_RATE * 5), SAMPLE_RATE);
    expect(Array.from(envelope).every((v) => v === 0)).toBe(true);
  });
});

describe('lag and bpm', () => {
  it('round-trip', () => {
    for (const bpm of [90, 120, 128, 174]) {
      expect(lagToBpm(bpmToLag(bpm))).toBeCloseTo(bpm, 6);
    }
  });

  it('folds a tempo into the range a person would tap', () => {
    expect(foldTempo(60)).toBeCloseTo(120);
    expect(foldTempo(75)).toBeCloseTo(150);
    expect(foldTempo(240)).toBeCloseTo(120);
    expect(foldTempo(128)).toBeCloseTo(128);
    expect(foldTempo(90)).toBeCloseTo(90);
  });

  it('terminates on degenerate input rather than looping', () => {
    expect(Number.isFinite(foldTempo(0.0001))).toBe(true);
    expect(Number.isFinite(foldTempo(100000))).toBe(true);
  });
});

describe('tempo detection', () => {
  it.each([90, 100, 120, 128, 140, 160, 174])('finds %i BPM in a click track', (bpm) => {
    const result = analyzeBeats(clickTrack({ bpm, seconds: 24 }), SAMPLE_RATE);
    expect(result.bpm).toBeGreaterThan(bpm - 2);
    expect(result.bpm).toBeLessThan(bpm + 2);
  });

  it.each([100, 124, 128])('is accurate enough not to drift audibly at %i BPM', (bpm) => {
    // The bar that matters: half a second of drift across a 60-second video
    // would be plainly visible as slides falling off the beat.
    const result = analyzeBeats(clickTrack({ bpm, seconds: 30 }), SAMPLE_RATE);
    const driftSeconds = (Math.abs(result.bpm - bpm) / bpm) * 60;
    expect(driftSeconds).toBeLessThan(0.5);
  });

  it('survives noise over the clicks', () => {
    const result = analyzeBeats(clickTrack({ bpm: 128, seconds: 24, noise: 0.05 }), SAMPLE_RATE);
    expect(result.bpm).toBeGreaterThan(126);
    expect(result.bpm).toBeLessThan(130);
  });

  it('reports high confidence for a steady pulse', () => {
    expect(analyzeBeats(clickTrack({ bpm: 120, seconds: 24 }), SAMPLE_RATE).confidence).toBeGreaterThan(0.3);
  });

  it('reports low confidence for noise with no pulse', () => {
    let seed = 99;
    const noise = new Float32Array(SAMPLE_RATE * 20);
    for (let i = 0; i < noise.length; i += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      noise[i] = (seed / 2 ** 32) * 2 - 1;
    }
    // The bpm returned here is a guess; the confidence is what says so.
    expect(analyzeBeats(noise, SAMPLE_RATE).confidence).toBeLessThan(0.3);
  });
});

describe('phase detection', () => {
  it('finds where the beats fall', () => {
    const offset = 0.25;
    const samples = clickTrack({ bpm: 120, seconds: 24, offset, accentEvery: 4 });
    const { beatOffset, bpm } = analyzeBeats(samples, SAMPLE_RATE);

    expect(bpm).toBeCloseTo(120, 0);
    // The offset must land on a real beat: within a beat-width of a multiple
    // of the beat period from the true first beat.
    const period = 60 / 120;
    const error = Math.abs(((beatOffset - offset) % period) + period) % period;
    expect(Math.min(error, period - error)).toBeLessThan(0.06);
  });

  it('locates the phase directly', () => {
    const samples = clickTrack({ bpm: 120, seconds: 20, offset: 0.3 });
    const envelope = normalizeEnvelope(onsetEnvelope(samples, SAMPLE_RATE));
    const estimate = estimateTempo(envelope);
    expect(estimate).not.toBeNull();

    const expectedBin = Math.round(0.3 * ENVELOPE_RATE);
    const phase = estimatePhase(envelope, estimate!.lag);
    expect(Math.abs(phase - expectedBin)).toBeLessThanOrEqual(3);
  });

  it('the fine search lands the phase exactly', () => {
    const samples = clickTrack({ bpm: 120, seconds: 20, offset: 0.3 });
    const envelope = normalizeEnvelope(onsetEnvelope(samples, SAMPLE_RATE));
    const coarse = estimateTempo(envelope)!;
    const refined = refineLag(envelope, coarse.lag);

    // The coarse lag is a whole number of bins, so its phase drifts across the
    // track; refining the period against the envelope pulls it back onto the hit.
    expect(refined.phase).toBe(Math.round(0.3 * ENVELOPE_RATE));
    expect(combScore(envelope, refined.lag, refined.phase)).toBeGreaterThan(
      combScore(envelope, coarse.lag, estimatePhase(envelope, coarse.lag)),
    );
  });

  it('offset is never negative and never a whole bar or more', () => {
    for (const offset of [0, 0.1, 0.75, 1.4]) {
      const result = analyzeBeats(clickTrack({ bpm: 120, seconds: 20, offset }), SAMPLE_RATE);
      expect(result.beatOffset).toBeGreaterThanOrEqual(0);
      expect(result.beatOffset).toBeLessThan((60 / result.bpm) * 4);
    }
  });
});

describe('degenerate input', () => {
  it('returns the fallback for silence rather than NaN', () => {
    const result = analyzeBeats(new Float32Array(SAMPLE_RATE * 10), SAMPLE_RATE);
    expect(result.bpm).toBe(FALLBACK_BPM);
    expect(result.confidence).toBe(0);
    expect(result.beatOffset).toBe(0);
  });

  it('returns the fallback for a clip too short to analyse', () => {
    const result = analyzeBeats(new Float32Array(200), SAMPLE_RATE);
    expect(result.bpm).toBe(FALLBACK_BPM);
    expect(Number.isFinite(result.durationSeconds)).toBe(true);
  });

  it('always reports a finite tempo and offset', () => {
    for (const samples of [new Float32Array(0), new Float32Array(10), clickTrack({ bpm: 120, seconds: 2 })]) {
      const result = analyzeBeats(samples, SAMPLE_RATE);
      expect(Number.isFinite(result.bpm)).toBe(true);
      expect(Number.isFinite(result.beatOffset)).toBe(true);
      expect(result.bpm).toBeGreaterThan(0);
    }
  });

  it('honours a known tempo instead of searching', () => {
    const samples = clickTrack({ bpm: 120, seconds: 20, offset: 0.2 });
    // A person overriding the detector must get exactly what they typed.
    expect(analyzeBeats(samples, SAMPLE_RATE, { knownBpm: 96 }).bpm).toBeCloseTo(96, 1);
  });
});
