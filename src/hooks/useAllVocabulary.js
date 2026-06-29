import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCachedVocabulary,
  loadVocabularyCatalog,
  loadVocabularyTrack,
} from "../lib/vocabularyDataClient";
import { vocabularyTracks } from "../constants/vocabularyTracks";

const availableTrackIds = vocabularyTracks.filter((t) => t.enabled).map((t) => t.value);

export function mergeTrackVocabulary(combined, vocabulary, trackId) {
  const seenIds = new Set(combined.map((word) => word.id));
  const nextCombined = [...combined];

  for (const word of vocabulary ?? []) {
    if (!word?.id || seenIds.has(word.id)) {
      continue;
    }

    nextCombined.push({
      ...word,
      sourceTrackId: word.sourceTrackId ?? trackId
    });
    seenIds.add(word.id);
  }

  return nextCombined;
}

export function buildCombinedVocabulary({ activeTrackId, activeTrackVocabulary, cachedVocabularyEntries = [] }) {
  let combined = mergeTrackVocabulary([], activeTrackVocabulary, activeTrackId);

  for (const [trackId, vocabulary] of cachedVocabularyEntries) {
    combined = mergeTrackVocabulary(combined, vocabulary, trackId);
  }

  return combined;
}

export function useAllVocabulary(activeTrackVocabulary, activeTrackId) {
  const [allVocabulary, setAllVocabulary] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const loadedRef = useRef(false);

  const loadAll = useCallback(async () => {
    if (loadedRef.current) {
      return;
    }

    setIsLoading(true);

    try {
      const catalog = await loadVocabularyCatalog({});
      const results = await Promise.allSettled(
        availableTrackIds.map(async (trackId) => {
          const cached = getCachedVocabulary(trackId);
          if (cached) {
            return [trackId, cached];
          }

          const result = await loadVocabularyTrack(trackId, { catalog });
          return [trackId, result.vocabulary];
        })
      );

      let combined = buildCombinedVocabulary({
        activeTrackId,
        activeTrackVocabulary
      });
      let loadedTrackCount = 0;

      for (const result of results) {
        if (result.status === "fulfilled" && Array.isArray(result.value)) {
          const [trackId, vocabulary] = result.value;
          combined = mergeTrackVocabulary(combined, vocabulary, trackId);
          loadedTrackCount += 1;
        }
      }

      setAllVocabulary(combined);
      loadedRef.current = loadedTrackCount === availableTrackIds.length;
    } catch {
      setAllVocabulary(
        buildCombinedVocabulary({
          activeTrackId,
          activeTrackVocabulary,
          cachedVocabularyEntries: availableTrackIds
            .map((trackId) => [trackId, getCachedVocabulary(trackId)])
            .filter(([, vocabulary]) => Array.isArray(vocabulary))
        })
      );
      loadedRef.current = false;
    } finally {
      setIsLoading(false);
    }
  }, [activeTrackId, activeTrackVocabulary]);

  useEffect(() => {
    const combined = buildCombinedVocabulary({
      activeTrackId,
      activeTrackVocabulary,
      cachedVocabularyEntries: availableTrackIds
        .map((trackId) => [trackId, getCachedVocabulary(trackId)])
        .filter(([, vocabulary]) => Array.isArray(vocabulary))
    });

    if (combined.length > 0) {
      setAllVocabulary(combined);

      const allCached = availableTrackIds.every((trackId) => getCachedVocabulary(trackId));
      if (allCached) {
        loadedRef.current = true;
      }
    }
  }, [activeTrackId, activeTrackVocabulary]);

  return {
    allVocabulary,
    hasLoadedAllVocabulary: loadedRef.current,
    isLoadingAllVocabulary: isLoading,
    loadAllVocabulary: loadAll
  };
}
