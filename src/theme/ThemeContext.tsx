import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { continueRender, delayRender, staticFile } from 'remotion';
import { FONT_MANIFEST_FILE } from '@/shared/fonts';
import { buildFontCss, fetchFontManifest, injectFontCss, waitForThemeFonts } from './fontLoading';
import { fontStyle } from './fonts';
import { DEFAULT_THEME } from './starters';
import type { FontId, Theme } from './types';

/**
 * Theme delivery.
 *
 * Slides read tokens through `useTheme()` and never import a starter directly.
 * That is what lets the same slide render under Punchboard, Scorepad, Table
 * Light, a random theme, or a box-art-derived one without knowing which.
 */

const ThemeContext = createContext<Theme>(DEFAULT_THEME);

export const ThemeProvider: React.FC<{ theme: Theme; children: React.ReactNode }> = ({
  theme,
  children,
}) => <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;

export const useTheme = (): Theme => useContext(ThemeContext);

/** Shorthand for the common case of reaching straight for the colors. */
export const useThemeColor = () => useTheme().color;

/**
 * The four type sizes, named. Slides pick a level rather than a number, which
 * is what keeps the plan's "four sizes only" rule enforceable.
 */
export const useTypeScale = () => {
  const [caption, body, headline, display] = useTheme().type.scale;
  return { caption, body, headline, display };
};

/** Inline style for one of the three roles, fonts and their quirks included. */
export const useFont = (role: 'display' | 'body' | 'utility'): React.CSSProperties => {
  const theme = useTheme();
  const id: FontId = theme.type[role];
  return fontStyle(id);
};

/**
 * Load the mirrored fonts and hold the render until the theme's faces are
 * ready. Mount once, at the composition root.
 *
 * Everything is read through `staticFile`, so this touches local disk only.
 */
export const FontLoader: React.FC<{ theme: Theme; children?: React.ReactNode }> = ({
  theme,
  children,
}) => {
  const [handle] = useState(() => delayRender('Loading theme fonts'));
  const [ready, setReady] = useState(false);

  // Read inside the mount effect without making the theme a dependency: the
  // handle is created once, and continuing the same handle twice is an error.
  const themeRef = useRef(theme);
  themeRef.current = theme;

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const manifest = await fetchFontManifest(staticFile(`fonts/${FONT_MANIFEST_FILE}`));
      injectFontCss(buildFontCss(manifest, (file) => staticFile(file)));
      await waitForThemeFonts(themeRef.current);
      if (!cancelled) setReady(true);
    };

    // Always continue, even on unmount or failure. A delayRender left pending
    // does not fail the render — it hangs it until the timeout.
    void run().finally(() => continueRender(handle));

    return () => {
      cancelled = true;
    };
  }, [handle]);

  // A theme swapped in the Player needs its faces too, but no delayRender:
  // there is no frame being captured to hold back.
  useEffect(() => {
    if (ready) void waitForThemeFonts(theme);
  }, [ready, theme]);

  // Rendering children before the faces resolve would let a frame capture the
  // fallback stack, which is exactly the drift test case 6 is about.
  return ready ? <>{children}</> : null;
};
