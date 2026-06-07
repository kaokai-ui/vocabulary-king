import { QUIZ_MODES } from "./questionBuilders";

function buildLegacyChoiceId(wordId, option, index) {
  return `${wordId}:${String(option ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") || "choice"}:${index}`;
}

export function normalizeQuizQuestion(question) {
  if (!question) {
    return question;
  }

  if (question.type && Array.isArray(question.choices) && "correctChoiceId" in question) {
    return question;
  }

  const options = Array.isArray(question.options) ? question.options : [];
  const choices = options.map((option, index) => ({
    id: buildLegacyChoiceId(question.wordId ?? question.word ?? "word", option, index),
    text: option
  }));
  const correctChoice = choices[question.correctIndex] ?? null;

  return {
    id: `${QUIZ_MODES.meaningChoice}:${question.wordId}`,
    type: QUIZ_MODES.meaningChoice,
    wordId: question.wordId,
    prompt: question.word,
    promptKind: "word",
    promptVoice: question.word,
    level: question.level,
    example: question.example,
    choices,
    correctChoiceId: correctChoice?.id ?? null,
    answerWord: question.word,
    correctText: question.correctMeaning,
    reviewPrompt: question.word
  };
}

export function normalizeQuizAnswer(answer) {
  if (!answer) {
    return answer;
  }

  if ("correctText" in answer && "selectedText" in answer) {
    return answer;
  }

  return {
    questionId: `${QUIZ_MODES.meaningChoice}:${answer.wordId}`,
    questionType: QUIZ_MODES.meaningChoice,
    wordId: answer.wordId,
    prompt: answer.word,
    answerWord: answer.word,
    correctText: answer.correctMeaning,
    selectedText: answer.selectedMeaning ?? null,
    isCorrect: answer.isCorrect
  };
}

export function normalizeQuizSession(quiz) {
  if (!quiz) {
    return quiz;
  }

  const normalizedQuestions = (quiz.questions ?? []).map(normalizeQuizQuestion);
  const selectedChoiceId =
    quiz.selectedChoiceId ??
    (quiz.selectedIndex != null ? normalizedQuestions[quiz.currentIndex ?? 0]?.choices?.[quiz.selectedIndex]?.id ?? null : null);

  return {
    ...quiz,
    mode: quiz.mode ?? QUIZ_MODES.meaningChoice,
    timerEnabled: quiz.timerEnabled ?? true,
    selectedChoiceId,
    questions: normalizedQuestions,
    answers: (quiz.answers ?? []).map(normalizeQuizAnswer)
  };
}

export function normalizeSession(session) {
  if (!session) {
    return session;
  }

  return {
    ...session,
    quiz: normalizeQuizSession(session.quiz)
  };
}
