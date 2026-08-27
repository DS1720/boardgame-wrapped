import { useCallback, useEffect, useState } from 'react';
import { del, get, set } from 'idb-keyval';
import { buildDataset, IngestError, parseExportText } from '@/ingest/parse';
import type { Dataset } from '@/shared/types';

const CACHE_KEY = 'bgw:last-export';

export const useDataset = () => {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore the last export so a reload does not mean re-uploading.
  useEffect(() => {
    get<unknown>(CACHE_KEY)
      .then((cached) => {
        if (cached) setDataset(buildDataset(cached));
      })
      .catch(() => del(CACHE_KEY))
      .finally(() => setLoading(false));
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
