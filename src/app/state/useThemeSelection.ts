import { useCallback, useEffect, useState } from 'react';
import { FONT_MANIFEST_FILE } from '@/shared/fonts';
import { buildFontCss, fetchFontManifest, injectFontCss } from '@/theme/fontLoading';
import { randomTheme } from '@/theme/generate';
import { loadTheme, saveTheme } from '@/theme/persist';
import { DEFAULT_THEME, STARTERS } from '@/theme/starters';
import type { Theme, ThemeColor, ThemeMode, FontId } from '@/theme/types';

/**
 * Theme selection for the app UI.
 *
 * Every change writes through to localStorage immediately rather than on a save
 * button: the thing a person tuned by hand has to still be there after a
 * reload, and there is no moment where they would have thought to press save.
 */
export const useThemeSelection = () => {
  const [mode, setMode] = useState<ThemeMode>('starter');
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [boxArtMode, setBoxArtMode] = useState(false);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const stored = loadTheme();
    if (stored) {
      setTheme(stored.theme);
      setMode(stored.mode === 'boxart' ? 'starter' : stored.mode);
      setBoxArtMode(stored.mode === 'boxart');
    }
    setRestored(true);
  }, []);

  // Persist after the restore, never before — writing during the first render
  // would overwrite the stored theme with the default.
  useEffect(() => {
    if (!restored) return;
    saveTheme({ mode: boxArtMode ? 'boxart' : mode, theme });
  }, [restored, mode, theme, boxArtMode]);

  const selectStarter = useCallback((id: string) => {
    const starter = STARTERS.find((s) => s.id === id);
    if (!starter) return;
    setTheme(starter);
    setMode('starter');
  }, []);

  const roll = useCallback((dark?: boolean) => {
    setTheme(randomTheme({ dark }));
    setMode('random');
  }, []);

  /** Editing any token turns the current theme into a custom one. */
  const setColor = useCallback((key: keyof ThemeColor, value: string) => {
    setTheme((current) => ({
      ...current,
      id: current.id.startsWith('custom-') ? current.id : `custom-${current.id}`,
      name: 'Custom',
      color: { ...current.color, [key]: value },
    }));
    setMode('custom');
  }, []);

  const setFont = useCallback((role: 'display' | 'body' | 'utility', id: FontId) => {
    setTheme((current) => ({
      ...current,
      id: current.id.startsWith('custom-') ? current.id : `custom-${current.id}`,
      name: 'Custom',
      type: { ...current.type, [role]: id },
    }));
    setMode('custom');
  }, []);

  return { theme, mode, boxArtMode, setBoxArtMode, selectStarter, roll, setColor, setFont, restored };
};

/**
 * Make the mirrored fonts available to the app chrome itself, so the picker can
 * show each face in its own type. The Player loads them independently through
 * `FontLoader`; both read the same files from public/fonts.
 */
export const useAppFonts = (): void => {
  useEffect(() => {
    void fetchFontManifest(`/fonts/${FONT_MANIFEST_FILE}`).then((manifest) => {
      injectFontCss(buildFontCss(manifest, (file) => `/${file}`));
    });
  }, []);
};
