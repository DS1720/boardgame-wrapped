import { useEffect, useState } from 'react';
import { indexOf, type BggIndex, type BggManifest } from '@/shared/bgg';

/**
 * The BGG credit index, read once from the render service.
 *
 * Unlike the box art manifest this is **not** a render-time asset: the five
 * credit modules consume it while `buildWrappedStats` runs in the browser, and
 * what reaches the renderer is the finished `WrappedStats`. So there is no
 * `delayRender` here and nothing in `src/video/` ever loads it.
 *
 * An empty index is a normal state — the service may not be running, or nobody
 * has run the prefetch. It means five slides return `null`, which is exactly
 * what should happen.
 */
export const useBggIndex = (): BggIndex => {
  const [index, setIndex] = useState<BggIndex>(() => new Map());

  useEffect(() => {
    let cancelled = false;
    fetch('/api/bgg/manifest')
      .then((res) => (res.ok ? (res.json() as Promise<BggManifest>) : null))
      .then((manifest) => {
        if (!cancelled && manifest) setIndex(indexOf(manifest));
      })
      .catch(() => {
        // The service is not running. Not an error worth surfacing: the five
        // slides it feeds are opt-in and their panel says so.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return index;
};
