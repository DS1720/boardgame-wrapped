import { useEffect, useState } from 'react';
import { continueRender, delayRender, staticFile } from 'remotion';
import { emptyManifest, MANIFEST_FILE, type BoxArtEntry, type BoxArtManifest } from '@/shared/boxart';

/**
 * Read the box art manifest from disk during a render.
 *
 * `staticFile` resolves to Remotion's own local server, so this fetch never
 * leaves the machine — which is the whole point of step 5. `delayRender` holds
 * the first frame until the manifest has landed, otherwise the renderer would
 * capture frames before any cover is known.
 */
export const useBoxArtManifest = (): BoxArtManifest => {
  const [manifest, setManifest] = useState<BoxArtManifest>(emptyManifest);
  const [handle] = useState(() => delayRender('Loading box art manifest'));

  useEffect(() => {
    let cancelled = false;
    fetch(staticFile(`boxart/${MANIFEST_FILE}`))
      .then((res) => (res.ok ? res.json() : emptyManifest()))
      .then((data: BoxArtManifest) => {
        if (!cancelled) setManifest(data);
      })
      .catch(() => {
        // No manifest means no prefetch has run. Every game falls back to a
        // typeset tile, which is a degraded look but never a broken render.
      })
      .finally(() => continueRender(handle));
    return () => {
      cancelled = true;
    };
  }, [handle]);

  return manifest;
};

/** The manifest entry for one game, or null when it has no stored art. */
export const boxArtFor = (manifest: BoxArtManifest, gameId: number): BoxArtEntry | null =>
  manifest.entries[String(gameId)] ?? null;
