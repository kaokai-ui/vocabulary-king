import { useEffect, useMemo } from "react";
import { actionTypes } from "../state/actionTypes";

export function useSavedWords({ dispatch, isPersistenceReady, progress, vocabulary, vocabularyById, activeTrackId, activeProgress }) {
  const savedWords = useMemo(() => progress.savedWords ?? [], [progress.savedWords]);
  const savedWordById = useMemo(
    () => Object.fromEntries(savedWords.map((word) => [word.id, word])),
    [savedWords]
  );

  useEffect(() => {
    if (!isPersistenceReady || vocabulary.length === 0 || activeProgress.starredWordIds.length === 0) {
      return;
    }

    const missingSavedWords = activeProgress.starredWordIds
      .filter((wordId) => !savedWordById[wordId])
      .map((wordId) => vocabularyById[wordId])
      .filter(Boolean)
      .map((word) => ({
        ...word,
        sourceTrackId: activeTrackId
      }));

    if (missingSavedWords.length === 0) {
      return;
    }

    dispatch({
      type: actionTypes.addStarredWords,
      payload: missingSavedWords,
      meta: {
        trackId: activeTrackId
      }
    });
  }, [activeProgress.starredWordIds, activeTrackId, dispatch, isPersistenceReady, savedWordById, vocabulary, vocabularyById]);

  return { savedWords, savedWordById };
}
