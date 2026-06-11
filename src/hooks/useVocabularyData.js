import { useCallback, useEffect, useState } from "react";
import {
  getCachedCatalog,
  getCachedVocabulary,
  loadVocabularyCatalog,
  loadVocabularyTrack
} from "../lib/vocabularyDataClient";

export function useVocabularyData(trackId) {
  const [catalog, setCatalog] = useState(() => getCachedCatalog());
  const [vocabulary, setVocabulary] = useState(() => getCachedVocabulary(trackId) ?? []);
  const [catalogError, setCatalogError] = useState("");
  const [vocabularyError, setVocabularyError] = useState("");
  const [isCatalogLoading, setIsCatalogLoading] = useState(() => !getCachedCatalog());
  const [isVocabularyLoading, setIsVocabularyLoading] = useState(() => !getCachedVocabulary(trackId));
  const [loadedTrackId, setLoadedTrackId] = useState(() => (getCachedVocabulary(trackId) ? trackId : null));
  const [retryKey, setRetryKey] = useState(0);

  const retryVocabulary = useCallback(() => {
    setRetryKey((currentRetryKey) => currentRetryKey + 1);
  }, []);

  useEffect(() => {
    let isCancelled = false;
    const abortController = new AbortController();
    const cachedCatalog = getCachedCatalog();
    const cachedVocabulary = getCachedVocabulary(trackId);
    const forceRefresh = retryKey > 0;

    if (cachedCatalog) {
      setCatalog(cachedCatalog);
    }

    if (!forceRefresh && cachedVocabulary) {
      setVocabulary(cachedVocabulary);
      setLoadedTrackId(trackId);
      setIsVocabularyLoading(false);
    } else {
      setVocabulary([]);
      setLoadedTrackId(null);
      setIsVocabularyLoading(true);
    }

    setCatalogError("");
    setVocabularyError("");
    setIsCatalogLoading(!cachedCatalog || forceRefresh);

    async function loadVocabulary() {
      try {
        const nextCatalog = await loadVocabularyCatalog({
          signal: abortController.signal,
          forceRefresh
        });

        if (isCancelled) {
          return;
        }

        setCatalog(nextCatalog);
        setIsCatalogLoading(false);

        if (!forceRefresh && cachedVocabulary) {
          return;
        }

        try {
          const result = await loadVocabularyTrack(trackId, {
            catalog: nextCatalog,
            signal: abortController.signal,
            forceRefresh
          });

          if (!isCancelled) {
            setCatalog(result.catalog);
            setVocabulary(result.vocabulary);
            setLoadedTrackId(trackId);
            setIsVocabularyLoading(false);
          }
        } catch (error) {
          if (error?.name === "AbortError") {
            return;
          }

          if (!isCancelled) {
            setVocabulary([]);
            setLoadedTrackId(null);
            setVocabularyError("load-failed");
            setIsVocabularyLoading(false);
          }
        }
      } catch (error) {
        if (error?.name === "AbortError") {
          return;
        }

        if (!isCancelled) {
          setCatalogError("load-failed");
          setVocabularyError("load-failed");
          setIsCatalogLoading(false);
          setIsVocabularyLoading(false);
        }
      }
    }

    loadVocabulary();

    return () => {
      isCancelled = true;
      abortController.abort();
    };
  }, [retryKey, trackId]);

  return {
    catalog,
    catalogError,
    vocabulary,
    vocabularyError,
    isCatalogLoading,
    isVocabularyLoading: isVocabularyLoading || loadedTrackId !== trackId,
    isVocabularyReady: loadedTrackId === trackId,
    retryVocabulary
  };
}
