import { useCallback, useEffect, useRef, useState } from 'react';
import {
  barSeconds,
  isSupportedAudio,
  resolvePlayback,
  snapToDownbeat,
  type AudioManifest,
  type Track,
} from '@/shared/audio';
import {
  MAX_LENGTH_MULTIPLIER,
  MIN_LENGTH_MULTIPLIER,
} from '@/video/timeline';

/**
 * Soundtrack picker: upload, crop, and tempo.
 *
 * The crop is drawn over a waveform the server already computed, so dragging
 * needs no decoding in the browser. Both handles snap to the track's downbeats —
 * that snapping is what makes the slide cuts land on beats without the user
 * having to think about it.
 */

const API = '/api';

const formatTime = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

interface Props {
  videoDurationInFrames: number;
  fps: number;
  selectedId: string | null;
  lengthMultiplier: number;
  onLengthMultiplier: (value: number) => void;
  onSelect: (track: Track | null) => void;
}

export const AudioPicker: React.FC<Props> = ({
  videoDurationInFrames,
  fps,
  selectedId,
  lengthMultiplier,
  onLengthMultiplier,
  onSelect,
}) => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const selected = tracks.find((t) => t.id === selectedId) ?? null;

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/audio/manifest`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const manifest = (await res.json()) as AudioManifest;
      setTracks(manifest.tracks);
      setOffline(false);
      return manifest.tracks;
    } catch {
      setOffline(true);
      return [];
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Re-select the track the session remembers, once the manifest arrives.
  // The session stores only an id, because a whole track (peaks included) is
  // far too big to keep in localStorage.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !selectedId || tracks.length === 0) return;
    const match = tracks.find((t) => t.id === selectedId);
    if (match) {
      restored.current = true;
      onSelect(match);
    }
  }, [selectedId, tracks, onSelect]);

  const upload = async (file: File) => {
    if (!isSupportedAudio(file.name)) {
      setError(`${file.name} is not an audio file this can read.`);
      return;
    }
    setError(null);
    setBusy('Analysing…');
    try {
      const res = await fetch(`${API}/audio/upload?name=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: await file.arrayBuffer(),
      });
      const body = (await res.json()) as { track?: Track; error?: string };
      if (!res.ok || !body.track) throw new Error(body.error ?? `HTTP ${res.status}`);
      await load();
      onSelect(body.track);
    } catch (err) {
      setError(
        err instanceof Error && err.message.includes('Failed to fetch')
          ? 'The render service is not running. Start it with: npm run server'
          : err instanceof Error
            ? err.message
            : String(err),
      );
    } finally {
      setBusy(null);
    }
  };

  /** Persist a change and keep the selection pointing at the updated track. */
  const patch = async (id: string, body: Partial<Track>) => {
    const res = await fetch(`${API}/audio/track/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return;
    const { track } = (await res.json()) as { track: Track };
    setTracks((current) => current.map((t) => (t.id === id ? track : t)));
    if (track.id === selectedId) onSelect(track);
  };

  const setTempo = async (id: string, bpm: number) => {
    setBusy('Re-detecting…');
    try {
      const res = await fetch(`${API}/audio/track/${id}/analyze`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(bpm > 0 ? { bpm } : {}),
      });
      if (res.ok) {
        const { track } = (await res.json()) as { track: Track };
        setTracks((current) => current.map((t) => (t.id === id ? track : t)));
        if (track.id === selectedId) onSelect(track);
      }
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    await fetch(`${API}/audio/track/${id}`, { method: 'DELETE' }).catch(() => {});
    const remaining = await load();
    if (id === selectedId) onSelect(remaining[0] ?? null);
  };

  if (offline) {
    return (
      <section className="panel">
        <h2>Soundtrack</h2>
        <p className="empty">
          Start the render service to add music: <code>npm run server</code>
        </p>
      </section>
    );
  }

  const playback = selected ? resolvePlayback(selected, videoDurationInFrames, fps) : null;
  const videoSeconds = videoDurationInFrames / fps;

  return (
    <section className="panel">
      <h2>Soundtrack</h2>

      <div className="audio-tracks">
        <button
          className={`audio-chip${selectedId === null ? ' is-active' : ''}`}
          onClick={() => onSelect(null)}
        >
          No music
        </button>
        {tracks.map((track) => (
          <button
            key={track.id}
            className={`audio-chip${track.id === selectedId ? ' is-active' : ''}`}
            onClick={() => onSelect(track)}
          >
            <span className="audio-chip-name">{track.name}</span>
            <span className="audio-chip-meta">
              {Math.round(track.bpm)} BPM · {formatTime(track.durationSeconds)}
            </span>
          </button>
        ))}
      </div>

      <div className="audio-actions">
        <button onClick={() => input.current?.click()} disabled={busy !== null}>
          {busy ?? 'Upload a song'}
        </button>
        <input
          ref={input}
          type="file"
          accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg,.opus,.aac"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = '';
          }}
        />
        {selected && (
          <button className="link" onClick={() => void remove(selected.id)}>
            Remove
          </button>
        )}
        <label className="audio-length">
          <span>Slide length</span>
          <input
            type="number"
            min={MIN_LENGTH_MULTIPLIER}
            max={MAX_LENGTH_MULTIPLIER}
            step={0.25}
            value={lengthMultiplier}
            title="Multiplies slide lengths in the timeline. Individual slide bar values stay unchanged."
            onChange={(e) => onLengthMultiplier(Number(e.target.value))}
          />
          <span className="audio-length-unit">x</span>
        </label>
      </div>

      {error && <p className="error">{error}</p>}

      {selected && playback && (
        <div className="audio-detail">
          <Waveform
            track={selected}
            onChange={(trimStart, trimEnd) => void patch(selected.id, { trimStart, trimEnd })}
          />

          <div className="audio-facts">
            <label>
              <span>Tempo</span>
              <input
                type="number"
                min={40}
                max={220}
                step={0.1}
                value={Math.round(selected.bpm * 10) / 10}
                onChange={(e) => void patch(selected.id, { bpm: Number(e.target.value) })}
              />
            </label>
            <button className="link" onClick={() => void setTempo(selected.id, 0)}>
              Re-detect
            </button>
            {selected.confidence < 0.3 && (
              <span className="audio-warn">
                Weak beat — check the tempo
              </span>
            )}
          </div>

          <p className="audio-summary">
            Crop {formatTime(playback.startSeconds)}–
            {formatTime(playback.startSeconds + playback.segmentSeconds)} ·{' '}
            {Math.round(playback.segmentSeconds / barSeconds(selected.bpm))} bars
            {playback.looped ? ` · loops ${playback.loops}× to cover ${formatTime(videoSeconds)}` : ''}
          </p>

          <label className="audio-credit">
            <span>Credit</span>
            <input
              type="text"
              value={selected.credit}
              placeholder="Artist — source, licence"
              onChange={(e) => void patch(selected.id, { credit: e.target.value })}
            />
          </label>
        </div>
      )}
    </section>
  );
};

/* -------------------------------------------------------------------------- */

/**
 * The waveform with draggable crop handles.
 *
 * Handles snap to downbeats as they move, so the crop a person sets is always
 * one the video can be cut to. Bar lines are drawn behind the wave to make that
 * snapping visible rather than mysterious.
 */
const Waveform: React.FC<{
  track: Track;
  onChange: (trimStart: number, trimEnd: number) => void;
}> = ({ track, onChange }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null);
  const [draft, setDraft] = useState<{ start: number; end: number } | null>(null);

  const start = draft?.start ?? track.trimStart;
  const end = draft?.end ?? (track.trimEnd || track.durationSeconds);
  const pct = (seconds: number) => `${(seconds / Math.max(1, track.durationSeconds)) * 100}%`;

  const timeAt = useCallback(
    (clientX: number): number => {
      const box = ref.current?.getBoundingClientRect();
      if (!box) return 0;
      const ratio = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
      return snapToDownbeat(ratio * track.durationSeconds, track.bpm, track.beatOffset);
    },
    [track.durationSeconds, track.bpm, track.beatOffset],
  );

  useEffect(() => {
    if (!dragging) return;

    const move = (event: PointerEvent) => {
      const time = timeAt(event.clientX);
      setDraft((current) => {
        const base = current ?? { start: track.trimStart, end: track.trimEnd || track.durationSeconds };
        // A minimum of one bar, and the handles may not cross.
        const bar = barSeconds(track.bpm);
        return dragging === 'start'
          ? { ...base, start: Math.min(time, base.end - bar) }
          : { ...base, end: Math.max(time, base.start + bar) };
      });
    };

    const up = () => {
      setDragging(null);
      // Commit once on release rather than on every pointer move, so a drag is
      // one write instead of fifty.
      setDraft((current) => {
        if (current) onChange(current.start, current.end);
        return null;
      });
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragging, timeAt, onChange, track]);

  const bars = Math.floor(track.durationSeconds / barSeconds(track.bpm));
  // Every fourth bar only: a line every 2 seconds across 3 minutes is a smear.
  const gridEvery = Math.max(1, Math.ceil(bars / 48));

  return (
    <div className="audio-wave" ref={ref}>
      <div className="audio-wave-grid" aria-hidden>
        {Array.from({ length: Math.floor(bars / gridEvery) }, (_, i) => (
          <i
            key={i}
            style={{ left: pct(track.beatOffset + i * gridEvery * barSeconds(track.bpm)) }}
          />
        ))}
      </div>

      <div className="audio-wave-peaks" aria-hidden>
        {track.peaks.map((peak, i) => (
          // eslint-disable-next-line react/no-array-index-key -- position is the identity
          <i key={i} style={{ height: `${Math.max(2, peak * 100)}%` }} />
        ))}
      </div>

      <div className="audio-wave-mask" style={{ left: 0, width: pct(start) }} />
      <div
        className="audio-wave-mask"
        style={{ left: pct(end), width: pct(Math.max(0, track.durationSeconds - end)) }}
      />

      <button
        className="audio-wave-handle"
        style={{ left: pct(start) }}
        onPointerDown={() => setDragging('start')}
        aria-label="Crop start"
      />
      <button
        className="audio-wave-handle"
        style={{ left: pct(end) }}
        onPointerDown={() => setDragging('end')}
        aria-label="Crop end"
      />
    </div>
  );
};
