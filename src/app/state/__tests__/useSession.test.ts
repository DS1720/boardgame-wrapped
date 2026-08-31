import { describe, expect, it } from 'vitest';
import type { SlideId } from '@/stats/types';
import { DEFAULT_SLIDE_IDS } from '@/video/timeline';
import { clearSession, defaultSession, loadSession, parseSession, saveSession } from '../useSession';

const memoryStorage = (): Storage => {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage;
};

describe('the default session', () => {
  it('starts on the default cut and nothing selected', () => {
    const session = defaultSession();
    expect(session.playerId).toBeNull();
    expect(session.trackId).toBeNull();
    expect(session.slides).toEqual(DEFAULT_SLIDE_IDS);
  });

  it('hands out a fresh slide array each time', () => {
    defaultSession().slides.push('nightOwl');
    expect(defaultSession().slides).toEqual(DEFAULT_SLIDE_IDS);
  });
});

describe('round trip', () => {
  it('remembers who, when, which slides and which track', () => {
    const storage = memoryStorage();
    saveSession(
      {
        ...defaultSession(),
        playerId: 4,
        rangeFrom: '2026-01-01',
        rangeTo: '2026-12-31',
        rangeLabel: '2026',
        slides: ['winRate', 'totalPlays'],
        trackId: 'my-song-abc',
        boxArtMode: true,
      },
      storage,
    );

    const restored = loadSession(storage);
    expect(restored.playerId).toBe(4);
    expect(restored.rangeLabel).toBe('2026');
    expect(restored.trackId).toBe('my-song-abc');
    expect(restored.boxArtMode).toBe(true);
  });

  it('remembers a range renamed by hand, separately from the derived label', () => {
    const storage = memoryStorage();
    saveSession(
      {
        ...defaultSession(),
        rangeLabel: '2026',
        rangeName: 'Our first year',
      },
      storage,
    );

    const restored = loadSession(storage);
    // Both survive. The derived label is what the year chips match on, so
    // renaming the range must not overwrite it.
    expect(restored.rangeLabel).toBe('2026');
    expect(restored.rangeName).toBe('Our first year');
  });

  it('treats a missing or non-string range name as no override', () => {
    const storage = memoryStorage();
    storage.setItem('bgw:session', JSON.stringify({ version: 1, rangeName: 42 }));
    expect(loadSession(storage).rangeName).toBeNull();
    expect(loadSession(memoryStorage()).rangeName).toBeNull();
  });

  it('preserves the slide order, not just the set', () => {
    const storage = memoryStorage();
    const arranged: SlideId[] = ['topLocation', 'winRate', 'totalPlays'];
    saveSession({ ...defaultSession(), slides: arranged }, storage);
    // The arrangement is the whole point of storing a list rather than a set.
    expect(loadSession(storage).slides).toEqual(arranged);
  });

  it('returns the default when nothing is stored', () => {
    expect(loadSession(memoryStorage())).toEqual(defaultSession());
  });

  it('clears', () => {
    const storage = memoryStorage();
    saveSession({ ...defaultSession(), playerId: 9 }, storage);
    clearSession(storage);
    expect(loadSession(storage).playerId).toBeNull();
  });
});

describe('validation', () => {
  it('rejects junk rather than crashing on it', () => {
    expect(parseSession(null)).toEqual(defaultSession());
    expect(parseSession('nope')).toEqual(defaultSession());
    expect(parseSession({})).toEqual(defaultSession());
  });

  it('discards a session from an older version', () => {
    expect(parseSession({ version: 1, playerId: 7 }).playerId).toBeNull();
  });

  it('drops slide ids this version no longer knows', () => {
    const parsed = parseSession({
      ...defaultSession(),
      slides: ['totalPlays', 'retiredStat', 'winRate'],
    });
    expect(parsed.slides).toEqual(['totalPlays', 'winRate']);
  });

  it('strips the bookends out of a stored selection', () => {
    // An older version could have stored them; leaving them in would put a
    // second intro in the middle of the cut.
    const parsed = parseSession({ ...defaultSession(), slides: ['intro', 'winRate', 'outro'] });
    expect(parsed.slides).toEqual(['winRate']);
  });

  it('keeps an empty selection, which is a real choice', () => {
    expect(parseSession({ ...defaultSession(), slides: [] }).slides).toEqual([]);
  });

  it('falls back to the default cut when slides are missing entirely', () => {
    const { slides, ...withoutSlides } = defaultSession();
    expect(parseSession(withoutSlides).slides).toEqual(DEFAULT_SLIDE_IDS);
  });

  it('rejects a malformed date rather than restoring an invalid range', () => {
    const parsed = parseSession({
      ...defaultSession(),
      rangeFrom: 'yesterday',
      rangeTo: '2026-12-31',
    });
    expect(parsed.rangeFrom).toBeNull();
    expect(parsed.rangeTo).toBe('2026-12-31');
  });

  it('one bad field does not cost the others', () => {
    const parsed = parseSession({
      ...defaultSession(),
      playerId: 4,
      slides: ['totalPlays', 42 as unknown as SlideId],
    });
    expect(parsed.playerId).toBe(4);
    expect(parsed.slides).toEqual(['totalPlays']);
  });
});

describe('hostile storage', () => {
  const hostile = {
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('denied');
    },
    removeItem: () => {
      throw new Error('denied');
    },
  } as unknown as Storage;

  it('never takes the app down with it', () => {
    expect(() => saveSession(defaultSession(), hostile)).not.toThrow();
    expect(loadSession(hostile)).toEqual(defaultSession());
    expect(() => clearSession(hostile)).not.toThrow();
  });

  it('survives a stored value that is not JSON', () => {
    const storage = memoryStorage();
    storage.setItem('bgw:session', '{not json');
    expect(loadSession(storage)).toEqual(defaultSession());
  });
});

describe('player name overrides', () => {
  it('round trips through storage', () => {
    const session = { ...defaultSession(), playerNames: { '4': 'Tinchen' } };
    const storage = memoryStorage();
    saveSession(session, storage);
    expect(loadSession(storage).playerNames).toEqual({ '4': 'Tinchen' });
  });

  it('defaults to an empty map', () => {
    expect(defaultSession().playerNames).toEqual({});
  });

  /* The field was added without bumping the schema version, precisely so that
     a session stored before it existed keeps everything else. A bump here
     would throw away somebody's slide arrangement to introduce a field that
     defaults to empty anyway. */
  it('restores a session written before the field existed, intact', () => {
    const before = { ...defaultSession(), playerId: 7, slides: ['winRate'] as SlideId[] };
    delete (before as Partial<typeof before>).playerNames;

    const restored = parseSession(before);
    expect(restored.playerId).toBe(7);
    expect(restored.slides).toEqual(['winRate']);
    expect(restored.playerNames).toEqual({});
  });

  it('drops a malformed map without touching the rest of the session', () => {
    const restored = parseSession({ ...defaultSession(), playerId: 7, playerNames: 'nope' });
    expect(restored.playerNames).toEqual({});
    expect(restored.playerId).toBe(7);
  });
});
