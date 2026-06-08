import { actionTypes } from "../actionTypes";
import { updateWordStats } from "../../lib/game";
import { cloneSavedWords, defaultProgressState, getTrackProgress, setTrackProgress } from "../../lib/progress";

function toggleStarredWordIds(starredWordIds, wordId) {
  return starredWordIds.includes(wordId)
    ? starredWordIds.filter((currentWordId) => currentWordId !== wordId)
    : [...starredWordIds, wordId];
}

function addStarredWordIds(starredWordIds, wordIds) {
  const nextWordIds = Array.isArray(wordIds)
    ? wordIds
        .map((word) => (typeof word === "string" ? word : word?.id))
        .filter(Boolean)
    : [];

  if (nextWordIds.length === 0) {
    return starredWordIds;
  }

  return [...new Set([...starredWordIds, ...nextWordIds])];
}

function toggleKnownWordIds(knownWordIds, wordId) {
  return knownWordIds.includes(wordId)
    ? knownWordIds.filter((currentWordId) => currentWordId !== wordId)
    : [...knownWordIds, wordId];
}

function resolveTrackId(action, fallbackTrackId = "junior-high") {
  return action.meta?.trackId ?? fallbackTrackId;
}

function normalizeSavedWordEntry(entry, trackId) {
  if (!entry || typeof entry === "string") {
    return null;
  }

  if (!entry.id || !entry.word || !entry.meaning) {
    return null;
  }

  return {
    id: entry.id,
    word: entry.word,
    meaning: entry.meaning,
    example: entry.example ?? "",
    level: entry.level ?? "",
    sourceTrackId: entry.sourceTrackId ?? trackId
  };
}

function toggleSavedWordEntries(savedWords, entry, trackId) {
  const normalizedEntry = normalizeSavedWordEntry(entry, trackId);

  if (!normalizedEntry) {
    return cloneSavedWords(savedWords);
  }

  return savedWords.some((savedWord) => savedWord.id === normalizedEntry.id)
    ? savedWords.filter((savedWord) => savedWord.id !== normalizedEntry.id)
    : [...cloneSavedWords(savedWords), normalizedEntry];
}

function addSavedWordEntries(savedWords, entries, trackId) {
  const nextSavedWords = cloneSavedWords(savedWords);
  const normalizedEntries = Array.isArray(entries)
    ? entries.map((entry) => normalizeSavedWordEntry(entry, trackId)).filter(Boolean)
    : [];

  for (const entry of normalizedEntries) {
    if (!nextSavedWords.some((savedWord) => savedWord.id === entry.id)) {
      nextSavedWords.push(entry);
    }
  }

  return nextSavedWords;
}

function removeStarredWordIdFromAllTracks(progress, wordId) {
  const nextByTrack = Object.fromEntries(
    Object.entries(progress?.byTrack ?? {}).map(([trackId, trackProgress]) => [
      trackId,
      {
        ...trackProgress,
        starredWordIds: (trackProgress.starredWordIds ?? []).filter((currentWordId) => currentWordId !== wordId)
      }
    ])
  );

  return {
    ...defaultProgressState,
    ...progress,
    savedWords: cloneSavedWords(progress?.savedWords ?? []).filter((savedWord) => savedWord.id !== wordId),
    byTrack: nextByTrack
  };
}

export function progressReducer(state, action, fallbackTrackId) {
  switch (action.type) {
    case actionTypes.hydratePersistence:
      return {
        ...defaultProgressState,
        ...(action.payload.progress ?? state),
        savedWords: cloneSavedWords(action.payload.progress?.savedWords ?? state.savedWords ?? [])
      };

    case actionTypes.syncTrackProgress:
      return setTrackProgress(state, action.payload.trackId, action.payload.progress);

    case actionTypes.toggleStarredWord: {
      if (typeof action.payload === "string") {
        return removeStarredWordIdFromAllTracks(state, action.payload);
      }

      const trackId = resolveTrackId(action, fallbackTrackId);
      const trackProgress = getTrackProgress(state, trackId);

      const nextState = setTrackProgress(state, trackId, {
        ...trackProgress,
        starredWordIds: toggleStarredWordIds(trackProgress.starredWordIds, action.payload.id)
      });

      return {
        ...nextState,
        savedWords: toggleSavedWordEntries(nextState.savedWords ?? [], action.payload, trackId)
      };
    }

    case actionTypes.addStarredWords: {
      const trackId = resolveTrackId(action, fallbackTrackId);
      const trackProgress = getTrackProgress(state, trackId);

      const nextState = setTrackProgress(state, trackId, {
        ...trackProgress,
        starredWordIds: addStarredWordIds(trackProgress.starredWordIds, action.payload)
      });

      return {
        ...nextState,
        savedWords: addSavedWordEntries(nextState.savedWords ?? [], action.payload, trackId)
      };
    }

    case actionTypes.toggleKnownWord: {
      const trackId = resolveTrackId(action, fallbackTrackId);
      const trackProgress = getTrackProgress(state, trackId);

      return setTrackProgress(state, trackId, {
        ...trackProgress,
        knownWordIds: toggleKnownWordIds(trackProgress.knownWordIds ?? [], action.payload)
      });
    }

    case actionTypes.markWordSeen: {
      const trackId = resolveTrackId(action, fallbackTrackId);
      const trackProgress = getTrackProgress(state, trackId);

      return setTrackProgress(
        state,
        trackId,
        updateWordStats(trackProgress, action.payload.wordId, (wordStats) => {
          wordStats.seenCount += 1;
          wordStats.lastSeenAt = action.payload.seenAt;
        })
      );
    }

    case actionTypes.lockQuizAnswer: {
      const trackId = resolveTrackId(action, fallbackTrackId);
      const trackProgress = getTrackProgress(state, trackId);
      const { activeQuestion, isCorrect, answeredAt } = action.payload;

      return setTrackProgress(
        state,
        trackId,
        updateWordStats(trackProgress, activeQuestion.wordId, (wordStats) => {
          wordStats.seenCount += 1;
          wordStats.lastSeenAt = answeredAt;
          wordStats.correctCount += isCorrect ? 1 : 0;
          wordStats.wrongCount += isCorrect ? 0 : 1;
        })
      );
    }

    case actionTypes.completeQuiz: {
      const trackId = resolveTrackId(action, fallbackTrackId);
      const trackProgress = getTrackProgress(state, trackId);

      return setTrackProgress(state, trackId, {
        ...trackProgress,
        quizHistory: [
          action.payload.historyEntry,
          ...trackProgress.quizHistory
        ].slice(0, 10)
      });
    }

    default:
      return state;
  }
}
