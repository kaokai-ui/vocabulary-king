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
          correctMeaning: "fruit",
          example: "An apple a day.",
          options: ["dog", "fruit", "book"],
          correctIndex: 1
        }
      ],
      answers: [
        {
          wordId: "word-1",
          word: "apple",
          correctMeaning: "fruit",
          selectedMeaning: "fruit",
          isCorrect: true
        }
      ]
    };

    const normalized = normalizeQuizSession(legacyQuiz);

    expect(normalized.mode).toBe(QUIZ_MODES.meaningChoice);
    expect(normalized.timerEnabled).toBe(true);
    expect(normalized.selectedChoiceId).toBe(normalized.questions[0].choices[1].id);
    expect(normalized.questions[0]).toMatchObject({
      type: QUIZ_MODES.meaningChoice,
      prompt: "apple",
      correctText: "fruit"
    });
    expect(normalized.answers[0]).toEqual({
      questionId: `${QUIZ_MODES.meaningChoice}:word-1`,
      questionType: QUIZ_MODES.meaningChoice,
      wordId: "word-1",
      prompt: "apple",
      answerWord: "apple",
      correctText: "fruit",
      selectedText: "fruit",
      isCorrect: true
    });
  });

  it("removes prompt voice from persisted cloze questions", () => {
    const quiz = {
      mode: QUIZ_MODES.clozeChoice,
      timerEnabled: false,
      currentIndex: 0,
      questions: [
        {
          id: `${QUIZ_MODES.clozeChoice}:word-1`,
          type: QUIZ_MODES.clozeChoice,
          wordId: "word-1",
          prompt: "We need to ____ waste at school.",
          promptKind: "cloze",
          promptVoice: "reduce",
          level: "L3",
          example: "We need to reduce waste at school.",
          choices: [
            { id: "1", text: "reduce" },
            { id: "2", text: "prepare" },
            { id: "3", text: "borrow" },
            { id: "4", text: "cancel" }
          ],
          correctChoiceId: "1",
          answerWord: "reduce",
          correctText: "reduce",
          reviewPrompt: "We need to ____ waste at school."
        }
      ],
      answers: []
    };

    const normalized = normalizeQuizSession(quiz);

    expect(normalized.questions[0].promptVoice).toBeNull();
  });
});
