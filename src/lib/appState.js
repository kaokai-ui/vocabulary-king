import { shuffle } from "./game";

export function countProgress(progress, vocabulary, isMasteredWord) {
  const vocabularyIds = new Set(vocabulary.map((word) => word.id));
  const studiedWordIds = new Set((progress.knownWordIds ?? []).filter((wordId) => vocabularyIds.has(wordId)));
  const masteredWordIds = new Set((progress.knownWordIds ?? []).filter((wordId) => vocabularyIds.has(wordId)));

  Object.entries(progress.wordStats ?? {}).forEach(([wordId, stats]) => {
    if (!vocabularyIds.has(wordId)) {
      return;
    }

    if (stats.seenCount > 0) {
      studiedWordIds.add(wordId);
    }

    if (isMasteredWord(stats)) {
      masteredWordIds.add(wordId);
    }
  });

  const studiedCount = studiedWordIds.size;
  const masteredCount = masteredWordIds.size;

  return {
    studiedCount,
    masteredCount,
    unknownCount: Math.max(studiedCount - masteredCount, 0),
    progressRate: vocabulary.length === 0 ? 0 : Math.round((masteredCount / vocabulary.length) * 100)
  };
}

export function createPracticeDeck(mode, progress, vocabulary) {
  const starredIds = new Set(progress.starredWordIds);
  const knownIds = new Set(progress.knownWordIds ?? []);
  const pool =
    mode === "starred"
      ? vocabulary.filter((word) => starredIds.has(word.id))
      : vocabulary.filter((word) => !starredIds.has(word.id) && !knownIds.has(word.id));

  return shuffle(pool);
}

export function getResumeScreen(session) {
  if (session.quiz) {
    return session.screen === "quizResult" || session.quiz.answers.length >= session.quiz.questions.length
      ? "quizResult"
      : "quiz";
  }

  if (session.flashcards) {
    return "flashcards";
  }

  return "home";
}
