import { useCallback, useEffect, useRef, useState } from 'react';
import type { SlideId } from '@/stats/types';
import { ALL_SLIDES, DEFAULT_SLIDE_IDS } from '@/video/timeline';

/**
 * Everything the app should still know after a reload.
 *
 * The theme has its own store (it predates this and has its own validation);
 * this covers the rest of the working state — who you were building a video
 * for, over what range, with which slides in which order, and which track.
 *
 * Written on every change rather than behind a save button: there is no moment
 * where a person would think to press one.
 */

const KEY = 'bgw:session';
const VERSION = 2;

export interface Session {
  version: number;
  playerId: number | null;
  /** Serialised as ISO days; a Date does not survive JSON. */
  rangeFrom: string | null;
  rangeTo: string | null;
  rangeLabel: string | null;
  /** Ordered — this is the arrangement, not just the selection. */
  slides: SlideId[];
  trackId: string | null;
  boxArtMode: boolean;
}

export const defaultSession = (): Session => ({
  version: VERSION,
  playerId: null,
  rangeFrom: null,
  rangeTo: null,
  rangeLabel: null,
  slides: [...DEFAULT_SLIDE_IDS],
  trackId: null,
  boxArtMode: false,
});

const isIsoDay = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * Validate a stored session before trusting it.
 *
 * Anything unrecognisable is replaced field by field rather than discarded
 * wholesale — a slide id that no longer exists should not cost someone their
 * player and date range too.
 */
export const parseSession = (raw: unknown): Session => {
  const base = defaultSession();
  if (!raw || typeof raw !== 'object') return base;
  const value = raw as Partial<Session>;
  if (value.version !== VERSION) return base;

  const known = new Set<string>(ALL_SLIDES);
  const slides = Array.isArray(value.slides)
    ? value.slides.filter((id): id is SlideId => {
        if (typeof id !== 'string' || !known.has(id)) return false;
        // The bookends are not part of the selection; one stored by an older
        // version would otherwise show up twice in the cut.
        return id !== ('intro' as string) && id !== ('outro' as string);
      })
    : base.slides;

  return {
    version: VERSION,
    playerId: typeof value.playerId === 'number' ? value.playerId : null,
    rangeFrom: isIsoDay(value.rangeFrom) ? value.rangeFrom : null,
    rangeTo: isIsoDay(value.rangeTo) ? value.rangeTo : null,
    rangeLabel: typeof value.rangeLabel === 'string' ? value.rangeLabel : null,
    // An empty stored list is a real choice (everything switched off), but a
    // missing or malformed one is not.
    slides: Array.isArray(value.slides) ? slides : base.slides,
    trackId: typeof value.trackId === 'string' ? value.trackId : null,
    boxArtMode: typeof value.boxArtMode === 'boolean' ? value.boxArtMode : false,
  };
};

export const loadSession = (storage: Storage | undefined = globalThis.localStorage): Session => {
  try {
    const raw = storage?.getItem(KEY);
    return raw ? parseSession(JSON.parse(raw)) : defaultSession();
  } catch {
    return defaultSession();
  }
};

export const saveSession = (
  session: Session,
  storage: Storage | undefined = globalThis.localStorage,
): void => {
  try {
    storage?.setItem(KEY, JSON.stringify(session));
  } catch {
    // Private browsing or a full quota. Losing the session is survivable;
    // taking the app down over it is not.
  }
};

export const clearSession = (storage: Storage | undefined = globalThis.localStorage): void => {
  try {
    storage?.removeItem(KEY);
  } catch {
    // Same reasoning as saveSession.
  }
};

/**
 * Restore once on mount, then write through on every change.
 *
 * `restored` gates the writing: without it the first render would save the
 * defaults over whatever was stored before the load had finished.
 */
export const useSession = () => {
  const [session, setSession] = useState<Session>(defaultSession);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    setSession(loadSession());
    setRestored(true);
  }, []);

  const written = useRef<string>('');
  useEffect(() => {
    if (!restored) return;
    const serialised = JSON.stringify(session);
    // Skip writes that would not change anything: this effect runs on every
    // keystroke elsewhere in the tree.
    if (serialised === written.current) return;
    written.current = serialised;
    saveSession(session);
  }, [restored, session]);

  const patch = useCallback((changes: Partial<Session>) => {
    setSession((current) => ({ ...current, ...changes }));
  }, []);

  const reset = useCallback(() => {
    clearSession();
    written.current = '';
    setSession(defaultSession());
  }, []);

  return { session, patch, reset, restored };
};
