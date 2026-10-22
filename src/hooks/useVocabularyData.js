import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCachedCatalog,
  getCachedVocabulary,
  loadVocabularyCatalog,
  loadVocabularyTrack,
  VocabularyDataError,
  VOCABULARY_ERROR_TYPES
} from "../lib/vocabularyDataClient";

export function useVocabularyData(trackId, locale = "zh-TW") {
  const [catalog, setCatalog] = useState(() => getCachedCatalog());
  const [vocabulary, setVocabulary] = useState(() => getCachedVocabulary(trackId, locale) ?? []);
  const [catalogError, setCatalogError] = useState("");
  const [vocabularyError, setVocabularyError] = useState("");
  const [isCatalogLoading, setIsCatalogLoading] = useState(() => !getCachedCatalog());
  const [isVocabularyLoading, setIsVocabularyLoading] = useState(() => !getCachedVocabulary(trackId, locale));
  const [loadedTrackKey, setLoadedTrackKey] = useState(() =>
    getCachedVocabulary(trackId, locale) ? `${trackId}:${locale}` : null
  );
  const [retryKey, setRetryKey] = useState(0);
  const retryConsumedRef = useRef(false);

  const retryVocabulary = useCallback(() => {
    setRetryKey((currentRetryKey) => currentRetryKey + 1);
    retryConsumedRef.current = false;
  }, []);

  useEffect(() => {
    let isCancelled = false;
    const abortController = new AbortController();
    const cachedCatalog = getCachedCatalog();
    const cachedVocabulary = getCachedVocabulary(trackId, locale);
    const trackKey = `${trackId}:${locale}`;
    const forceRefresh = retryKey > 0 && !retryConsumedRef.current;

    if (forceRefresh) {
      retryConsumedRef.current = true;
    }

    if (cachedCatalog) {
      setCatalog(cachedCatalog);
    }

    if (!forceRefresh && cachedVocabulary) {
      setVocabulary(cachedVocabulary);
      setLoadedTrackKey(trackKey);
      setIsVocabularyLoading(false);
    } else {
      setVocabulary([]);
      setLoadedTrackKey(null);
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
            forceRefresh,
            locale
          });

          if (!isCancelled) {
            setCatalog(result.catalog);
            setVocabulary(result.vocabulary);
            setLoadedTrackKey(trackKey);
            setIsVocabularyLoading(false);
          }
        } catch (error) {
          if (error instanceof VocabularyDataError && error.type === VOCABULARY_ERROR_TYPES.requestAborted) {
            return;
          }

          if (!isCancelled) {
            setVocabulary([]);
            setLoadedTrackKey(null);
            setVocabularyError(error instanceof VocabularyDataError ? error.type : "load-failed");
            setIsVocabularyLoading(false);
          }
        }
      } catch (error) {
        if (error instanceof VocabularyDataError && error.type === VOCABULARY_ERROR_TYPES.requestAborted) {
          return;
        }

        if (!isCancelled) {
          setCatalogError(error instanceof VocabularyDataError ? error.type : "load-failed");
          setVocabularyError(error instanceof VocabularyDataError ? error.type : "load-failed");
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
  }, [retryKey, trackId, locale]);

  return {
    catalog,
    catalogError,
    vocabulary,
    vocabularyError,
    isCatalogLoading,
    isVocabularyLoading: isVocabularyLoading || loadedTrackKey !== `${trackId}:${locale}`,
    isVocabularyReady: loadedTrackKey === `${trackId}:${locale}`,
    retryVocabulary
  };
}
