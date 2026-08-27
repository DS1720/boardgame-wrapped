/**
 * Turning the mirrored font files into loaded faces.
 *
 * Pure helpers here; the React wiring is in `useFonts.ts`. Both the Remotion
 * render and the plain app UI go through this, so the two cannot drift.
 */
import { emptyFontManifest, fontFaceRule, type FontManifest } from '@/shared/fonts';
import { FONTS } from './fonts';
import type { Theme } from './types';

export const FONT_STYLE_ELEMENT_ID = 'bgw-font-faces';

/** Build the full @font-face stylesheet for a manifest. */
export const buildFontCss = (manifest: FontManifest, resolveUrl: (file: string) => string): string =>
  manifest.faces.map((face) => fontFaceRule(face, resolveUrl(`fonts/${face.file}`))).join('\n\n');

/**
 * Insert the stylesheet once per document.
 *
 * Keyed by a fixed id rather than a ref: in the Player the composition can
 * remount many times, and re-inserting 32 @font-face rules on every mount makes
 * the browser re-resolve them all.
 */
export const injectFontCss = (css: string, doc: Document = document): void => {
  const existing = doc.getElementById(FONT_STYLE_ELEMENT_ID);
  if (existing) {
    if (existing.textContent !== css) existing.textContent = css;
    return;
  }
  const style = doc.createElement('style');
  style.id = FONT_STYLE_ELEMENT_ID;
  style.textContent = css;
  doc.head.appendChild(style);
};

/**
 * The `document.fonts.load()` descriptors for a theme's three faces.
 *
 * Only the theme's own fonts are awaited. Waiting for all twelve families would
 * delay the first frame for faces no slide is going to use.
 */
export const fontLoadDescriptors = (theme: Theme): string[] => {
  const ids = [theme.type.display, theme.type.body, theme.type.utility];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const spec = FONTS[id];
    const descriptor = `${spec.weight} 100px "${spec.family}"`;
    if (seen.has(descriptor)) continue;
    seen.add(descriptor);
    out.push(descriptor);
  }
  return out;
};

/**
 * Wait for a theme's faces to be usable.
 *
 * Resolves rather than rejects on failure: a missing font must degrade to the
 * fallback stack, never hang a render. `document.fonts` is absent in jsdom-less
 * test environments, which is also treated as "nothing to wait for".
 */
export const waitForThemeFonts = async (theme: Theme, doc: Document = document): Promise<void> => {
  if (!doc.fonts?.load) return;
  await Promise.all(
    fontLoadDescriptors(theme).map((descriptor) => doc.fonts.load(descriptor).catch(() => undefined)),
  );
};

export const fetchFontManifest = async (url: string): Promise<FontManifest> => {
  try {
    const res = await fetch(url);
    if (!res.ok) return emptyFontManifest();
    return (await res.json()) as FontManifest;
  } catch {
    // No mirror yet: every face falls back to a system stack. The video still
    // renders, it just is not typeset the way the theme intends.
    return emptyFontManifest();
  }
};
