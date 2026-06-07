import { useEffect, useState } from "react";

let cachedCatalog = null;
const cachedVocabularyByTrack = new Map();

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

        if (!cachedCatalog) {
          const catalogResponse = await fetch(`${import.meta.env.BASE_URL}data/catalog.json`, {
            signal: abortController.signal
          });

          if (!catalogResponse.ok) {
            throw new Error(`HTTP ${catalogResponse.status}`);
          }

          cachedCatalog = await catalogResponse.json();
        }

        const nextCatalog = cachedCatalog;

        if (isCancelled) {
          return;
        }

        setCatalog(nextCatalog);

        const track = nextCatalog.tracks?.[trackId];

        if (!track || !track.available) {
          throw new Error(`Track is unavailable: ${trackId}`);
        }

        const chunkPayloads = await Promise.all(
          track.chunkFiles.map(async (chunkFile) => {
            const chunkResponse = await fetch(`${import.meta.env.BASE_URL}${chunkFile.path}`, {
              signal: abortController.signal
            });

            if (!chunkResponse.ok) {
              throw new Error(`Failed to load chunk: ${chunkFile.path}`);
            }

            return chunkResponse.json();
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
