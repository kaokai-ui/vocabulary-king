import { actionTypes } from "../actionTypes";
import { updateWordStats } from "../../lib/game";

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

export function progressReducer(state, action) {
  switch (action.type) {
    case actionTypes.hydratePersistence:
      return {
        ...state,
        ...action.payload.progress
      };

    case actionTypes.toggleStarredWord:
      return {
        ...state,
        starredWordIds: toggleStarredWordIds(state.starredWordIds, action.payload)
      };

    case actionTypes.toggleKnownWord:
      return {
        ...state,
        knownWordIds: toggleKnownWordIds(state.knownWordIds ?? [], action.payload)
      };

    case actionTypes.markWordSeen:
      return updateWordStats(state, action.payload.wordId, (wordStats) => {
        wordStats.seenCount += 1;
        wordStats.lastSeenAt = action.payload.seenAt;
      });

    case actionTypes.lockQuizAnswer: {
      const { activeQuestion, isCorrect, answeredAt } = action.payload;

      return updateWordStats(state, activeQuestion.wordId, (wordStats) => {
        wordStats.seenCount += 1;
        wordStats.lastSeenAt = answeredAt;
        wordStats.correctCount += isCorrect ? 1 : 0;
        wordStats.wrongCount += isCorrect ? 0 : 1;
      });
    }

    case actionTypes.completeQuiz:
      return {
        ...state,
        quizHistory: [
          action.payload.historyEntry,
          ...state.quizHistory
        ].slice(0, 10)
      };

    default:
      return state;
  }
}
