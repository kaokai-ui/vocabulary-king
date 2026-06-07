import { describe, expect, it } from "vitest";
import { QUIZ_MODES } from "./questionBuilders";
import { normalizeQuizSession } from "./sessionModel";

describe("normalizeQuizSession", () => {
  it("migrates legacy quiz question and answer shapes", () => {
    const legacyQuiz = {
      questionCount: 1,
      currentIndex: 0,
      correctCount: 0,
      wrongCount: 0,
      selectedIndex: 1,
      isLocked: true,
      questionStartedAt: 1000,
      questions: [
        {
          wordId: "word-1",
          word: "apple",
          level: "L1",
          correctMeaning: "蘋果",
          example: "An apple a day.",
          options: ["香蕉", "蘋果", "橘子"],
          correctIndex: 1
        }
      ],
      answers: [
        {
          wordId: "word-1",
          word: "apple",
          correctMeaning: "蘋果",
          selectedMeaning: "蘋果",
          isCorrect: true
        }
      ]
    };

    const normalized = normalizeQuizSession(legacyQuiz);

    expect(normalized.mode).toBe(QUIZ_MODES.meaningChoice);
    expect(normalized.selectedChoiceId).toBe(normalized.questions[0].choices[1].id);
    expect(normalized.questions[0]).toMatchObject({
      type: QUIZ_MODES.meaningChoice,
      prompt: "apple",
      correctText: "蘋果"
    });
    expect(normalized.answers[0]).toEqual({
      questionId: `${QUIZ_MODES.meaningChoice}:word-1`,
      questionType: QUIZ_MODES.meaningChoice,
      wordId: "word-1",
      prompt: "apple",
      answerWord: "apple",
      correctText: "蘋果",
      selectedText: "蘋果",
      isCorrect: true
    });
  });
});
