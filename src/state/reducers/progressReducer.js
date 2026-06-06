import { actionTypes } from "../actionTypes";
import { updateWordStats } from "../../lib/game";
import { getTrackProgress, setTrackProgress } from "../../lib/progress";

function toggleStarredWordIds(starredWordIds, wordId) {
  return starredWordIds.includes(wordId)
    ? starredWordIds.filter((currentWordId) => currentWordId !== wordId)
    : [...starredWordIds, wordId];
}

function toggleKnownWordIds(knownWordIds, wordId) {
  return knownWordIds.includes(wordId)
    ? knownWordIds.filter((currentWordId) => currentWordId !== wordId)
    : [...knownWordIds, wordId];
}

function resolveTrackId(action, fallbackTrackId = "junior-high") {
  return action.meta?.trackId ?? fallbackTrackId;
}

export function progressReducer(state, action, fallbackTrackId) {
  switch (action.type) {
    case actionTypes.hydratePersistence:
      return action.payload.progress ?? state;

    case actionTypes.syncTrackProgress:
      return setTrackProgress(state, action.payload.trackId, action.payload.progress);

    case actionTypes.toggleStarredWord: {
      const trackId = resolveTrackId(action, fallbackTrackId);
      const trackProgress = getTrackProgress(state, trackId);

      return setTrackProgress(state, trackId, {
        ...trackProgress,
        starredWordIds: toggleStarredWordIds(trackProgress.starredWordIds, action.payload)
      });
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
