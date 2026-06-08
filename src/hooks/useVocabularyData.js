import { useEffect, useState } from "react";

let cachedCatalog = null;
const cachedVocabularyByTrack = new Map();

async function fetchJson(url, signal) {
  const response = await fetch(url, {
    signal,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

export function useVocabularyData(trackId) {
  const [vocabulary, setVocabulary] = useState([]);
  const [catalog, setCatalog] = useState(null);
  const [vocabularyError, setVocabularyError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadedTrackId, setLoadedTrackId] = useState(null);

  useEffect(() => {
    let isCancelled = false;
    const abortController = new AbortController();

    async function loadVocabulary() {
      try {
        setVocabularyError("");
        setIsLoading(true);

        if (cachedCatalog) {
          setCatalog(cachedCatalog);
        }

        if (cachedVocabularyByTrack.has(trackId)) {
          setVocabulary(cachedVocabularyByTrack.get(trackId));
          setLoadedTrackId(trackId);
          setIsLoading(false);
          return;
        }

        setVocabulary([]);

        const catalogUrl = `${import.meta.env.BASE_URL}data/catalog.json`;

        async function loadCatalog(forceRefresh = false) {
          if (!forceRefresh && cachedCatalog) {
            return cachedCatalog;
          }

          cachedCatalog = await fetchJson(catalogUrl, abortController.signal);
          return cachedCatalog;
        }

        let nextCatalog = await loadCatalog();

        if (isCancelled) {
          return;
        }

        setCatalog(nextCatalog);

        let track = nextCatalog.tracks?.[trackId];

        // A fresh JS bundle can coexist briefly with a stale cached catalog on GitHub Pages.
        // Retry once with a forced re-fetch so newly deployed tracks become selectable immediately.
        if (!track || !track.available) {
          nextCatalog = await loadCatalog(true);

          if (isCancelled) {
            return;
          }

          setCatalog(nextCatalog);
          track = nextCatalog.tracks?.[trackId];
        }

        if (!track || !track.available) {
          throw new Error(`Track is unavailable: ${trackId}`);
        }

        const chunkPayloads = await Promise.all(
          track.chunkFiles.map(async (chunkFile) => {
            return fetchJson(`${import.meta.env.BASE_URL}${chunkFile.path}`, abortController.signal);
          })
        );

        if (!isCancelled) {
          const nextVocabulary = chunkPayloads.flat();
          cachedVocabularyByTrack.set(trackId, nextVocabulary);
          setVocabulary(nextVocabulary);
          setLoadedTrackId(trackId);
          setIsLoading(false);
        }
      } catch (error) {
        if (error?.name === "AbortError") {
          return;
        }

        if (!isCancelled) {
          setVocabulary([]);
          setLoadedTrackId(null);
          setVocabularyError("load-failed");
          setIsLoading(false);
        }
      }
    }

    loadVocabulary();

    return () => {
      isCancelled = true;
      abortController.abort();
    };
  }, [trackId]);

  return {
    vocabulary,
    catalog,
    vocabularyError,
    isLoading: isLoading || loadedTrackId !== trackId
  };
}
