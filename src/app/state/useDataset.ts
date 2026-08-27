import { useCallback, useEffect, useState } from 'react';
import { del, get, set } from 'idb-keyval';
import { buildDataset, IngestError, parseExportText } from '@/ingest/parse';
import type { Dataset } from '@/shared/types';

const CACHE_KEY = 'bgw:last-export';

/**
 * How long to wait for IndexedDB before giving up on the cached export.
 *
 * `get()` does not always settle: a blocked or corrupted store, or a browser
 * with site data disabled, leaves the promise pending forever. Without this the
 * app sits on an empty screen with nothing to explain why — the cache is a
 * convenience, and it is never worth hanging the whole tool for.
 */
const RESTORE_TIMEOUT_MS = 3000;

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T | undefined> =>
  Promise.race([
    promise,
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms)),
  ]);

export const useDataset = () => {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore the last export so a reload does not mean re-uploading.
  useEffect(() => {
    let cancelled = false;

    withTimeout(get<unknown>(CACHE_KEY), RESTORE_TIMEOUT_MS)
      .then((cached) => {
        if (!cancelled && cached) setDataset(buildDataset(cached));
      })
      .catch(() => {
        // A cache we cannot parse is worse than no cache.
        void del(CACHE_KEY).catch(() => {});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async (file: File) => {
    setError(null);
    try {
      const text = await file.text();
      const next = parseExportText(text);
      setDataset(next);
      await set(CACHE_KEY, JSON.parse(text));
    } catch (e) {
      setDataset(null);
      setError(e instanceof IngestError ? e.message : `Could not read that file: ${String(e)}`);
    }
  }, []);

  const clear = useCallback(async () => {
    setDataset(null);
    setError(null);
    await del(CACHE_KEY);
  }, []);

  return { dataset, error, loading, load, clear };
};
