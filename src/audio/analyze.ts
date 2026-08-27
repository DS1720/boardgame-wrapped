/**
 * Tempo and beat detection.
 *
 * Pure: takes mono PCM samples and returns a tempo and a downbeat offset.
 * Decoding lives in `server/audio.ts`, so this can be tested against synthetic
 * click tracks with no files and no ffmpeg.
 *
 * The approach is the standard one — onset envelope, autocorrelation for the
 * period, then a phase search for where the beats actually fall. It is not a
 * research-grade tracker, and it does not try to follow a tempo that changes.
 * For the steady, beat-driven tracks this is pointed at, that is the right
 * trade: a wrong answer is always correctable by hand in the UI.
 */

/**
 * Onset envelope resolution, in bins per second. 5ms per bin.
 *
 * 100 was not enough: at ~124 BPM it left the tempo 0.7 BPM out, which is nine
 * frames of drift across a 52-second video — visible as slides sliding off the
 * beat by the outro. Doubling it halves the quantisation and costs nothing that
 * matters, since analysis runs once per track.
 */
export const ENVELOPE_RATE = 200;

/**
 * The tempo range worth searching.
 *
 * Beyond this, detection reliably finds a harmonic rather than the pulse a
 * person taps. Results are folded into `PREFERRED` afterwards.
 */
export const BPM_RANGE = { min: 60, max: 190 } as const;

/** Where a human hears "the" tempo when several octaves are defensible. */
const PREFERRED = { min: 88, max: 176 } as const;

export interface BeatAnalysis {
  bpm: number;
  /** Seconds from the start of the file to the first downbeat. */
  beatOffset: number;
  /** 0–1. Low means the track has no steady pulse and the bpm is a guess. */
  confidence: number;
  durationSeconds: number;
}

/* -------------------------------------------------------------------------- */
/* Envelope                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * An onset-strength envelope: how much louder each moment is than the one
 * before it. Percussive hits produce spikes; sustained tones produce almost
 * nothing, which is exactly the discrimination beat detection needs.
 */
export const onsetEnvelope = (
  samples: Float32Array,
  sampleRate: number,
  envelopeRate = ENVELOPE_RATE,
): Float32Array => {
  const hop = Math.max(1, Math.round(sampleRate / envelopeRate));
  const frames = Math.floor(samples.length / hop);
  if (frames < 2) return new Float32Array(0);

  const energy = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    let sum = 0;
    const start = i * hop;
    const end = Math.min(start + hop, samples.length);
    for (let j = start; j < end; j += 1) sum += samples[j] * samples[j];
    // Log scale: a hit over a loud passage should count as much as the same hit
    // over a quiet one.
    energy[i] = Math.log1p(Math.sqrt(sum / Math.max(1, end - start)) * 1000);
  }

  const onset = new Float32Array(frames);
  for (let i = 1; i < frames; i += 1) {
    onset[i] = Math.max(0, energy[i] - energy[i - 1]);
  }
  return onset;
};

/**
 * Subtract a local average so a loud chorus does not outvote a quiet verse.
 * Everything below the local average is flattened to zero.
 */
export const normalizeEnvelope = (onset: Float32Array, window = 50): Float32Array => {
  const out = new Float32Array(onset.length);
  let peak = 0;
  for (let i = 0; i < onset.length; i += 1) {
    const start = Math.max(0, i - window);
    const end = Math.min(onset.length, i + window + 1);
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += onset[j];
    const local = sum / (end - start);
    out[i] = Math.max(0, onset[i] - local);
    if (out[i] > peak) peak = out[i];
  }
  if (peak > 0) for (let i = 0; i < out.length; i += 1) out[i] /= peak;
  return out;
};

/* -------------------------------------------------------------------------- */
/* Tempo                                                                       */
/* -------------------------------------------------------------------------- */

export const lagToBpm = (lag: number, envelopeRate = ENVELOPE_RATE): number =>
  (60 * envelopeRate) / lag;

export const bpmToLag = (bpm: number, envelopeRate = ENVELOPE_RATE): number =>
  (60 * envelopeRate) / bpm;

/**
 * Fold a tempo into the range a person would tap.
 *
 * Autocorrelation cannot tell 75 BPM from 150 — both explain the same spikes.
 * Doubling or halving until the answer lands in the preferred band picks the
 * octave a listener would name.
 */
export const foldTempo = (bpm: number): number => {
  let out = bpm;
  let guard = 0;
  while (out < PREFERRED.min && guard < 8) {
    out *= 2;
    guard += 1;
  }
  while (out > PREFERRED.max && guard < 16) {
    out /= 2;
    guard += 1;
  }
  return out;
};

export interface TempoEstimate {
  /** Fractional — see `refinePeak`. */
  lag: number;
  bpm: number;
  confidence: number;
}

/**
 * Refine a peak to sub-bin precision by fitting a parabola through it and its
 * two neighbours.
 *
 * Without this the lag is a whole number of 10ms bins, which quantises tempo
 * badly: at ~124 BPM the nearest bin is 125 BPM, and that 1 BPM error
 * accumulates into a third of a second of drift across a 45-second track — far
 * enough that the phase search fits the middle of the song rather than its
 * start, and enough to hear slides fall off the beat by the outro.
 */
export const refinePeak = (scores: number[], index: number): number => {
  if (index <= 0 || index >= scores.length - 1) return index;
  const [left, mid, right] = [scores[index - 1], scores[index], scores[index + 1]];
  const denominator = left - 2 * mid + right;
  if (denominator === 0) return index;
  const shift = (0.5 * (left - right)) / denominator;
  // A parabola fitted to noise can put the vertex far from the sample; a true
  // peak is always within half a bin of the one that won.
  return Math.abs(shift) <= 0.5 ? index + shift : index;
};

/**
 * Find the beat period by autocorrelating the onset envelope.
 *
 * Each candidate period is scored with its own harmonics folded in: a true beat
 * period also has energy at two and four times the lag, while a spurious peak
 * usually does not. That is what stops the detector from locking onto an
 * eighth-note pulse.
 */
export const estimateTempo = (
  envelope: Float32Array,
  envelopeRate = ENVELOPE_RATE,
): TempoEstimate | null => {
  const minLag = Math.floor(bpmToLag(BPM_RANGE.max, envelopeRate));
  const maxLag = Math.ceil(bpmToLag(BPM_RANGE.min, envelopeRate));
  if (envelope.length < maxLag * 2) return null;

  const correlate = (lag: number): number => {
    if (lag <= 0 || lag >= envelope.length) return 0;
    let sum = 0;
    for (let i = 0; i + lag < envelope.length; i += 1) sum += envelope[i] * envelope[i + lag];
    return sum / (envelope.length - lag);
  };

  const scores: number[] = [];
  const fundamental: number[] = [];
  let best = { lag: minLag, score: -Infinity };
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    const base = correlate(lag);
    const score = base + 0.5 * correlate(lag * 2) + 0.25 * correlate(lag * 4);
    fundamental.push(base);
    scores.push(score);
    if (score > best.score) best = { lag, score };
  }

  // A flat envelope — silence, or a drone with no transients — correlates
  // equally at every lag. Returning the first lag scanned would be a confident
  // -looking answer built from nothing, so say there is no tempo instead.
  if (best.score <= 0) return null;

  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  // How far the winner stands above the field. A flat field means no pulse.
  const confidence = mean > 0 ? Math.min(1, Math.max(0, (best.score / mean - 1) / 2)) : 0;

  // The harmonic sum picks *which* peak is the beat; the plain correlation
  // says exactly where it is. Refining against the sum drags the vertex off by
  // as much as a bin, because the harmonic terms peak at slightly different
  // lags than the fundamental does.
  const lag = refinePeak(fundamental, best.lag - minLag) + minLag;
  return { lag, bpm: lagToBpm(lag, envelopeRate), confidence };
};

/**
 * Score a (period, phase) pair by how much onset energy lands on its beats.
 *
 * This is the quantity the tempo actually maximises, so it is what the fine
 * search optimises directly.
 */
export const combScore = (envelope: Float32Array, lag: number, phase: number): number => {
  if (lag <= 0) return 0;
  let sum = 0;
  let hits = 0;
  for (let beat = 0; ; beat += 1) {
    const index = Math.round(phase + beat * lag);
    if (index >= envelope.length) break;
    if (index >= 0) {
      sum += envelope[index];
      hits += 1;
    }
  }
  // Normalised by beat count so a slower tempo is not penalised for having
  // fewer beats to add up.
  return hits > 0 ? sum / hits : 0;
};

/**
 * Search fractional periods around a coarse estimate, jointly with phase.
 *
 * Parabolic interpolation gets close but not close enough — it fits a curve to
 * the autocorrelation rather than measuring the thing we care about. Evaluating
 * the comb directly over a fine grid removes the last of the error.
 */
export const refineLag = (
  envelope: Float32Array,
  coarseLag: number,
  radius = 1.5,
  step = 0.01,
): { lag: number; phase: number } => {
  let best = { lag: coarseLag, phase: 0, score: -Infinity };
  for (let lag = coarseLag - radius; lag <= coarseLag + radius; lag += step) {
    if (lag <= 1) continue;
    const phase = estimatePhase(envelope, lag);
    const score = combScore(envelope, lag, phase);
    if (score > best.score) best = { lag, phase, score };
  }
  return { lag: best.lag, phase: best.phase };
};

/* -------------------------------------------------------------------------- */
/* Phase                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Where the beats actually land, given the period.
 *
 * Knowing a track is 120 BPM says nothing about whether the first beat is at
 * 0.0s or 0.4s — and the whole point of this step is that slide cuts land on
 * beats, so the phase matters as much as the tempo.
 */
export const estimatePhase = (envelope: Float32Array, lag: number): number => {
  if (lag <= 0) return 0;
  let best = { offset: 0, score: -Infinity };
  for (let offset = 0; offset < Math.ceil(lag); offset += 1) {
    let sum = 0;
    // Beat positions are fractional once the lag is refined, so each one is
    // read from the nearest bin rather than stepping by a whole number.
    for (let beat = 0; ; beat += 1) {
      const index = Math.round(offset + beat * lag);
      if (index >= envelope.length) break;
      sum += envelope[index];
    }
    if (sum > best.score) best = { offset, score: sum };
  }
  return best.offset;
};

/**
 * Which of the four beats in a bar is beat one.
 *
 * Assumes 4/4, which every track this is pointed at will be. The downbeat is
 * the strongest of the four candidate phases — a bar almost always puts its
 * heaviest hit on one.
 */
export const estimateDownbeat = (envelope: Float32Array, lag: number, phase: number): number => {
  let best = { beat: 0, score: -Infinity };
  for (let beat = 0; beat < 4; beat += 1) {
    let sum = 0;
    for (let bar = 0; ; bar += 1) {
      const index = Math.round(phase + (beat + bar * 4) * lag);
      if (index >= envelope.length) break;
      sum += envelope[index];
    }
    if (sum > best.score) best = { beat, score: sum };
  }
  return best.beat;
};

/* -------------------------------------------------------------------------- */

export interface AnalyzeOptions {
  envelopeRate?: number;
  /** Skip the tempo search and only find the phase for a known tempo. */
  knownBpm?: number;
}

/** Fallback when a track has no detectable pulse at all. */
export const FALLBACK_BPM = 120;

/**
 * Full analysis: tempo, downbeat offset, and how much to trust them.
 *
 * Never throws and never returns a nonsense tempo — silence and noise both come
 * back as the fallback with zero confidence, which the UI shows so a person
 * knows to set the tempo by hand.
 */
export const analyzeBeats = (
  samples: Float32Array,
  sampleRate: number,
  { envelopeRate = ENVELOPE_RATE, knownBpm }: AnalyzeOptions = {},
): BeatAnalysis => {
  const durationSeconds = samples.length / sampleRate;
  const envelope = normalizeEnvelope(onsetEnvelope(samples, sampleRate, envelopeRate));

  if (envelope.length === 0) {
    return { bpm: FALLBACK_BPM, beatOffset: 0, confidence: 0, durationSeconds };
  }

  const estimate = knownBpm
    ? { lag: bpmToLag(knownBpm, envelopeRate), bpm: knownBpm, confidence: 1 }
    : estimateTempo(envelope, envelopeRate);

  if (!estimate) {
    return { bpm: FALLBACK_BPM, beatOffset: 0, confidence: 0, durationSeconds };
  }

  // Fine-tune the period against the envelope itself before folding octaves,
  // so the fold operates on an accurate number.
  const refined = knownBpm
    ? { lag: estimate.lag, phase: estimatePhase(envelope, estimate.lag) }
    : refineLag(envelope, estimate.lag);

  const folded = foldTempo(lagToBpm(refined.lag, envelopeRate));
  // The phase was found at the detected lag, not the folded one: the folded
  // tempo may be a multiple, and every beat of the faster grid is a real onset.
  const foldedLag = bpmToLag(folded, envelopeRate);
  const downbeat = estimateDownbeat(envelope, foldedLag, refined.phase);
  const phase = refined.phase;

  const beatOffset = ((phase + downbeat * foldedLag) / envelopeRate) % ((foldedLag * 4) / envelopeRate);

  return {
    bpm: Math.round(folded * 10) / 10,
    beatOffset: Math.max(0, beatOffset),
    confidence: estimate.confidence,
    durationSeconds,
  };
};
