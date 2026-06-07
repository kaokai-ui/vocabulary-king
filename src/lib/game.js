export const QUIZ_TIME_LIMIT_MS = 10000;
export { QUIZ_MODES } from "./quiz/questionBuilders";

import { buildQuizQuestions } from "./quiz/questionBuilders";

export function shuffle(items) {
  const next = [...items];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next;
}

export function sample(items, count) {
  return shuffle(items).slice(0, count);
}

export function createQuizQuestions(vocabulary, count, options = {}) {
  return buildQuizQuestions(vocabulary, {
    count,
    ...options
  });
}

export function isMasteredWord(stats) {
  return Boolean(stats) && stats.correctCount >= 2 && stats.correctCount > stats.wrongCount;
}

export function updateWordStats(progress, wordId, updater) {
  const currentWordStats = progress.wordStats ?? {};
  const nextStats = {
    seenCount: 0,
    correctCount: 0,
    wrongCount: 0,
    lastSeenAt: null,
    ...(currentWordStats[wordId] ?? {})
  };

  updater(nextStats);

  return {
    ...progress,
    wordStats: {
      ...currentWordStats,
      [wordId]: nextStats
    }
  };
}
