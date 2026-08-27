/**
 * Theme persistence.
 *
 * A custom theme is work a person did by hand — it has to survive a reload
 * (step 6's test case 4). Starters and box-art themes are cheap to recompute,
 * but persisting whatever is selected keeps the rule simple.
 */
import { STARTERS } from './starters';
import type { Theme, ThemeMode } from './types';

const KEY = 'bgw:theme';

export interface StoredTheme {
  mode: ThemeMode;
  theme: Theme;
}

/**
 * Validate a stored value before trusting it.
 *
 * Stored themes outlive code changes: a token added to `Theme` later would
 * otherwise arrive as `undefined` and reach a slide as a literal "undefined"
 * color. Anything that does not match the current shape is discarded.
 */
export const isValidTheme = (value: unknown): value is Theme => {
  if (!value || typeof value !== 'object') return false;
  const t = value as Partial<Theme>;
  if (typeof t.id !== 'string' || typeof t.name !== 'string') return false;

  const colorKeys = ['bg', 'surface', 'ink', 'inkMuted', 'accent', 'accentAlt'] as const;
  if (!t.color || colorKeys.some((k) => typeof t.color?.[k] !== 'string')) return false;

  if (
    !t.type ||
    typeof t.type.display !== 'string' ||
    typeof t.type.body !== 'string' ||
    typeof t.type.utility !== 'string' ||
    !Array.isArray(t.type.scale) ||
    t.type.scale.length !== 4 ||
    t.type.scale.some((n) => typeof n !== 'number' || !Number.isFinite(n))
  ) {
    return false;
  }

  if (
    !t.motion ||
    typeof t.motion.stiffness !== 'number' ||
    typeof t.motion.damping !== 'number' ||
    typeof t.motion.stagger !== 'number'
  ) {
    return false;
  }

  return typeof t.texture === 'string' && typeof t.signature === 'string';
};

export const loadTheme = (storage: Storage | undefined = globalThis.localStorage): StoredTheme | null => {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredTheme>;
    if (!isValidTheme(parsed?.theme)) return null;

    // A starter is stored by value but should follow the code, not the copy
    // saved months ago: re-read it so palette fixes reach existing users.
    const starter = STARTERS.find((s) => s.id === parsed.theme?.id);
    return {
      mode: parsed.mode ?? 'custom',
      theme: starter ?? (parsed.theme as Theme),
    };
  } catch {
    return null;
  }
};

export const saveTheme = (
  stored: StoredTheme,
  storage: Storage | undefined = globalThis.localStorage,
): void => {
  try {
    storage?.setItem(KEY, JSON.stringify(stored));
  } catch {
    // Private browsing, or a full quota. Losing the preference is survivable;
    // failing the app over it is not.
  }
};

export const clearTheme = (storage: Storage | undefined = globalThis.localStorage): void => {
  try {
    storage?.removeItem(KEY);
  } catch {
    // Same reasoning as saveTheme.
  }
};
