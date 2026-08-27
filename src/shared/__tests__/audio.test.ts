import { describe, expect, it } from 'vitest';
import {
  barSeconds,
  barsIn,
  beatSeconds,
  extensionOf,
  FADE_OUT_FRAMES,
  framesPerBar,
  isSupportedAudio,
  resolvePlayback,
  snapToDownbeat,
  trackVolume,
  type Track,
} from '../audio';
import { DEFAULT_CUT, planTimeline, SLIDE_BARS } from '@/video/timeline';
import type { Stat, WrappedStats } from '@/stats/types';

const track = (over: Partial<Track> = {}): Track => ({
  id: 't1',
  file: 't1.mp3',
  name: 'Test',
  bpm: 120,
  beatOffset: 0,
  confidence: 1,
  durationSeconds: 180,
  trimStart: 0,
  trimEnd: 180,
  license: 'Test',
  credit: '',
  peaks: [],
  source: 'upload',
  addedAt: '2026-08-27T00:00:00.000Z',
  ...over,
});

describe('the beat grid', () => {
  it('converts tempo to bars and beats', () => {
    expect(beatSeconds(120)).toBeCloseTo(0.5);
    expect(barSeconds(120)).toBeCloseTo(2);
    expect(barSeconds(60)).toBeCloseTo(4);
  });

  it('does not round frames per bar', () => {
    // 128 BPM at 30fps is 56.25 frames per bar. Rounding here is what causes
    // slides to drift off the beat over a long video.
    expect(framesPerBar(128, 30)).toBeCloseTo(56.25);
    expect(framesPerBar(120, 30)).toBe(60);
  });

  it('counts whole bars in a span', () => {
    expect(barsIn(10, 120)).toBe(5);
    expect(barsIn(9.9, 120)).toBe(4);
    expect(barsIn(0, 120)).toBe(0);
  });
});

describe('snapToDownbeat', () => {
  it('moves a time onto the nearest downbeat', () => {
    // 120 BPM, first downbeat at 0.4s, bars every 2s: 0.4, 2.4, 4.4...
    expect(snapToDownbeat(2.3, 120, 0.4)).toBeCloseTo(2.4);
    expect(snapToDownbeat(2.5, 120, 0.4)).toBeCloseTo(2.4);
    expect(snapToDownbeat(3.5, 120, 0.4)).toBeCloseTo(4.4);
  });

  it('leaves a time already on the grid alone', () => {
    expect(snapToDownbeat(4.4, 120, 0.4)).toBeCloseTo(4.4);
  });

  it('never returns a negative time', () => {
    expect(snapToDownbeat(0.1, 120, 0.9)).toBeGreaterThanOrEqual(0);
    expect(snapToDownbeat(0, 120, 1.5)).toBeGreaterThanOrEqual(0);
  });
});

describe('resolvePlayback', () => {
  const VIDEO_FRAMES = 52 * 30;

  it('starts on a downbeat even when the crop is dragged off one', () => {
    const t = track({ bpm: 120, beatOffset: 0.4, trimStart: 7.3, trimEnd: 90 });
    const { startSeconds } = resolvePlayback(t, VIDEO_FRAMES, 30);
    const barsFromFirstDownbeat = (startSeconds - t.beatOffset) / barSeconds(t.bpm);
    expect(barsFromFirstDownbeat % 1).toBeCloseTo(0, 6);
  });

  it('plays a long crop once', () => {
    const playback = resolvePlayback(track({ trimStart: 0, trimEnd: 120 }), VIDEO_FRAMES, 30);
    expect(playback.looped).toBe(false);
    expect(playback.loops).toBe(1);
  });

  // The user's requirement: a track shorter than the video repeats.
  it('loops a crop shorter than the video, enough times to cover it', () => {
    const playback = resolvePlayback(
      track({ durationSeconds: 20, trimStart: 0, trimEnd: 20 }),
      VIDEO_FRAMES,
      30,
    );
    expect(playback.looped).toBe(true);
    expect(playback.loops * playback.segmentFrames).toBeGreaterThanOrEqual(VIDEO_FRAMES);
    // ...and not wastefully more than needed.
    expect((playback.loops - 1) * playback.segmentFrames).toBeLessThan(VIDEO_FRAMES);
  });

  it('loops on whole bars, so the downbeat lands in the same place every pass', () => {
    // A 3.7-bar segment would put the beat somewhere new on each repeat, which
    // is audible immediately.
    for (const seconds of [20, 21.3, 9.7, 33.1]) {
      const playback = resolvePlayback(
        track({ durationSeconds: seconds, trimStart: 0, trimEnd: seconds }),
        VIDEO_FRAMES,
        30,
      );
      expect((playback.segmentSeconds / barSeconds(120)) % 1).toBeCloseTo(0, 6);
    }
  });

  it('survives a crop dragged down to nothing', () => {
    const playback = resolvePlayback(track({ trimStart: 10, trimEnd: 10 }), VIDEO_FRAMES, 30);
    expect(playback.segmentFrames).toBeGreaterThan(0);
    expect(playback.loops).toBeGreaterThanOrEqual(1);
  });

  it('clamps a crop that runs past the end of the file', () => {
    const t = track({ durationSeconds: 30, trimStart: 25, trimEnd: 999 });
    const playback = resolvePlayback(t, VIDEO_FRAMES, 30);
    expect(playback.startSeconds).toBeLessThanOrEqual(t.durationSeconds);
    expect(playback.segmentFrames).toBeGreaterThan(0);
  });

  it('handles a start past the end of the file', () => {
    const playback = resolvePlayback(
      track({ durationSeconds: 10, trimStart: 500, trimEnd: 600 }),
      VIDEO_FRAMES,
      30,
    );
    expect(playback.startFrame).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(playback.startFrame)).toBe(true);
  });
});

describe('volume', () => {
  it('fades in from silence and out to silence', () => {
    const duration = 900;
    expect(trackVolume(0, duration)).toBe(0);
    expect(trackVolume(duration, duration)).toBe(0);
    expect(trackVolume(duration / 2, duration)).toBe(1);
  });

  it('fades out over the final frames rather than cutting', () => {
    const duration = 900;
    const before = trackVolume(duration - FADE_OUT_FRAMES, duration);
    const mid = trackVolume(duration - FADE_OUT_FRAMES / 2, duration);
    expect(before).toBeCloseTo(1);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it('never leaves the 0–1 range', () => {
    for (const frame of [-10, 0, 5, 400, 899, 900, 1200]) {
      const v = trackVolume(frame, 900);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('does not fade out early on a very short video', () => {
    // A video shorter than both fades must still peak somewhere.
    const peak = Math.max(...Array.from({ length: 20 }, (_, f) => trackVolume(f, 20)));
    expect(peak).toBeGreaterThan(0);
  });
});

describe('file types', () => {
  it('accepts what ffmpeg and the browser both handle', () => {
    expect(isSupportedAudio('song.mp3')).toBe(true);
    expect(isSupportedAudio('Song Name.WAV')).toBe(true);
    expect(isSupportedAudio('x.m4a')).toBe(true);
    expect(isSupportedAudio('x.flac')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isSupportedAudio('movie.mp4')).toBe(false);
    expect(isSupportedAudio('noextension')).toBe(false);
    expect(extensionOf('a.b.mp3')).toBe('mp3');
  });
});

/* -------------------------------------------------------------------------- */

const statsWith = (stats: Stat[]): WrappedStats => ({
  playerId: 1,
  playerName: 'Tina',
  rangeLabel: '2026',
  rangeFrom: '2026-01-01',
  rangeTo: '2026-12-31',
  stats,
  thin: false,
});

const CORE: Stat[] = [
  { id: 'totalPlays', core: true, plays: 233, nights: 73, distinctGames: 71 },
  {
    id: 'topGame',
    core: true,
    game: { gameId: 1, name: 'Faraway', boxArt: null, bggId: 1 },
    plays: 21,
  },
  { id: 'topFive', core: true, games: [] },
  { id: 'winRate', core: true, wins: 61, losses: 161, ratio: 0.27, coopOnly: false },
  { id: 'topCoPlayer', core: true, name: 'D', playerId: 2, shared: 180, others: [] },
  { id: 'nemesis', core: true, name: 'M', playerId: 3, lossesTo: 14, headToHead: 30, lossRate: 14 / 30 },
  { id: 'gamesLearned', core: true, count: 34, games: [] },
  { id: 'topLocation', core: true, name: 'Home', nights: 40 },
];

describe('the video against the grid', () => {
  // Step 8, test case 1.
  it('lasts an exact whole number of bars', () => {
    for (const bpm of [96, 120, 124.7, 128, 140]) {
      const timeline = planTimeline(statsWith(CORE), { bpm });
      expect(timeline.bars % 1).toBe(0);
      // ...and the frame count matches those bars, within the rounding of one frame.
      expect(Math.abs(timeline.durationInFrames - timeline.bars * framesPerBar(bpm, 30))).toBeLessThan(1);
    }
  });

  // Step 8, test case 2, as far as it can be checked without ears.
  it('puts every slide cut on a bar line', () => {
    const bpm = 128; // 56.25 frames per bar — the awkward case
    const perBar = framesPerBar(bpm, 30);
    const { slides } = planTimeline(statsWith(CORE), { bpm });

    let bars = 0;
    for (const slide of slides) {
      // Each cut sits within half a frame of the true bar line, and the error
      // never accumulates from slide to slide.
      expect(Math.abs(slide.from - bars * perBar)).toBeLessThanOrEqual(0.5);
      bars += SLIDE_BARS[slide.id];
    }
  });

  // Step 8, test case 4.
  it('re-times the whole video when the tempo changes', () => {
    const slow = planTimeline(statsWith(CORE), { bpm: 90 });
    const fast = planTimeline(statsWith(CORE), { bpm: 150 });

    expect(slow.bars).toBe(fast.bars);
    expect(slow.durationInFrames).toBeGreaterThan(fast.durationInFrames);
    // Same bars at 90 vs 150 BPM means the ratio of lengths is the inverse of tempo.
    expect(slow.durationInFrames / fast.durationInFrames).toBeCloseTo(150 / 90, 1);
  });

  it('uses whole-bar slide lengths, without exception', () => {
    for (const id of DEFAULT_CUT) {
      expect(SLIDE_BARS[id] % 1).toBe(0);
    }
  });

  it('covers the video with the track, looping when the crop is short', () => {
    const timeline = planTimeline(statsWith(CORE), { bpm: 120 });
    const playback = resolvePlayback(
      track({ bpm: 120, durationSeconds: 18, trimStart: 0, trimEnd: 18 }),
      timeline.durationInFrames,
      30,
    );
    expect(playback.loops * playback.segmentFrames).toBeGreaterThanOrEqual(timeline.durationInFrames);
  });
});
