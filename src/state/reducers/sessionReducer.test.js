import { describe, expect, it } from "vitest";
import { actionTypes } from "../actionTypes";
import { sessionReducer } from "./sessionReducer";
import { createQuizQuestions, QUIZ_MODES } from "../../lib/game";

describe("sessionReducer", () => {
  const initialState = {
    screen: "home",
    flashcards: null,
    quiz: null
  };

  it("starts a flashcard session", () => {
    const nextState = sessionReducer(initialState, {
      type: actionTypes.startFlashcards,
      payload: {
        mode: "random",
        wordIds: ["a", "b"],
        showMeaning: true,
        showExample: false
      }
    });

    expect(nextState.screen).toBe("flashcards");
    expect(nextState.flashcards.wordIds).toEqual(["a", "b"]);
    expect(nextState.flashcards.showMeaning).toBe(true);
  });

  it("hydrates persisted session", () => {
    const nextState = sessionReducer(initialState, {
      type: actionTypes.hydratePersistence,
      payload: {
        session: {
          screen: "flashcards",
          flashcards: {
            mode: "random",
            wordIds: ["persisted-word"],
            currentIndex: 0,
            showMeaning: false,
            showExample: false
          },
          quiz: null
        }
      }
    });

    expect(nextState.screen).toBe("flashcards");
    expect(nextState.flashcards.wordIds).toEqual(["persisted-word"]);
  });

  it("starts a quiz session", () => {
    const nextState = sessionReducer(initialState, {
      type: actionTypes.startQuiz,
      payload: {
        mode: QUIZ_MODES.meaningChoice,
        timerEnabled: true,
        questionCount: 10,
        startedAt: 999,
        questions: [{ wordId: "x" }]
      }
    });

    expect(nextState.screen).toBe("quiz");
    expect(nextState.quiz.mode).toBe(QUIZ_MODES.meaningChoice);
    expect(nextState.quiz.timerEnabled).toBe(true);
    expect(nextState.quiz.questionCount).toBe(10);
    expect(nextState.quiz.questionStartedAt).toBe(999);
  });

  it("resets the active session when switching vocabulary tracks", () => {
    const sessionState = {
      screen: "flashcards",
      flashcards: {
        mode: "random",
        wordIds: ["a", "b"],
        currentIndex: 1,
        showMeaning: true,
        showExample: false
      },
      quiz: null
    };

    const nextState = sessionReducer(sessionState, {
      type: actionTypes.updateSetting,
      payload: {
        key: "vocabularyTrack",
        value: "senior-high"
      }
    });

    expect(nextState).toEqual({
      screen: "home",
      flashcards: null,
      quiz: null
    });
  });

  it("moves to quiz result on completion", () => {
    const quizState = {
      screen: "quiz",
      flashcards: null,
      quiz: {
        questionCount: 10,
        currentIndex: 9,
        correctCount: 8,
        wrongCount: 2,
        selectedChoiceId: "choice-1",
        isLocked: true,
        questionStartedAt: 1000,
        answers: [],
        questions: [],
        accuracy: 0,
        mode: QUIZ_MODES.meaningChoice
      }
    };

    const nextState = sessionReducer(quizState, {
      type: actionTypes.completeQuiz,
      payload: {
        accuracy: 80
      }
    });

    expect(nextState.screen).toBe("quizResult");
    expect(nextState.quiz.accuracy).toBe(80);
  });

  it("stores generic answer payload fields when locking a quiz answer", () => {
    const quizState = {
      screen: "quiz",
      flashcards: null,
      quiz: {
        mode: QUIZ_MODES.meaningChoice,
        questionCount: 1,
        currentIndex: 0,
        correctCount: 0,
        wrongCount: 0,
        selectedChoiceId: null,
        isLocked: false,
        questionStartedAt: 1000,
        answers: [],
        questions: [
          {
            id: "meaning-choice:word-1",
            type: QUIZ_MODES.meaningChoice,
            wordId: "word-1",
            prompt: "apple",
            reviewPrompt: "apple",
            answerWord: "apple",
            correctText: "蘋果",
            choices: [
              { id: "choice-1", text: "蘋果" },
              { id: "choice-2", text: "香蕉" }
            ],
            correctChoiceId: "choice-1"
          }
        ]
      }
    };

    const nextState = sessionReducer(quizState, {
      type: actionTypes.lockQuizAnswer,
      payload: {
        activeQuestion: quizState.quiz.questions[0],
        isCorrect: true,
        selectedChoiceId: "choice-1",
        selectedChoiceText: "蘋果"
      }
    });

    expect(nextState.quiz.selectedChoiceId).toBe("choice-1");
    expect(nextState.quiz.answers).toEqual([
      {
        questionId: "meaning-choice:word-1",
        questionType: QUIZ_MODES.meaningChoice,
        wordId: "word-1",
        prompt: "apple",
        answerWord: "apple",
        correctText: "蘋果",
        selectedText: "蘋果",
        isCorrect: true
      }
    ]);
  });
});

describe("startQuiz + createQuizQuestions integration", () => {
  const noExampleVocabulary = [
    { id: "1", word: "cat", meaning: "貓", level: "L1", example: "" },
    { id: "2", word: "dog", meaning: "狗", level: "L1", example: "" }
  ];

  const clozeVocabulary = [
    { id: "1", word: "announce", meaning: "宣布", level: "L3", example: "They will announce the plan. (他們將宣布計畫。)" },
    { id: "2", word: "borrow", meaning: "借", level: "L3", example: "I need to borrow a pen. (我需要借一支筆。)" },
    { id: "3", word: "reduce", meaning: "減少", level: "L3", example: "We need to reduce waste. (我們需要減少浪費。)" },
    { id: "4", word: "cancel", meaning: "取消", level: "L3", example: "They had to cancel the meeting. (他們必須取消會議。)" },
    { id: "5", word: "prepare", meaning: "準備", level: "L3", example: "Students prepare for the test. (學生為考試做準備。)" }
  ];

  const initialState = { screen: "home", flashcards: null, quiz: null };

  it("stores actual question count when cloze returns 0 questions", () => {
    const questions = createQuizQuestions(noExampleVocabulary, 10, { mode: QUIZ_MODES.clozeChoice });
    expect(questions).toHaveLength(0);

    const nextState = sessionReducer(initialState, {
      type: actionTypes.startQuiz,
      payload: {
        mode: QUIZ_MODES.clozeChoice,
        timerEnabled: false,
        questionCount: 0,
        startedAt: Date.now(),
        questions
      }
    });

    expect(nextState.quiz.questionCount).toBe(0);
    expect(nextState.quiz.questions).toHaveLength(0);
  });

  it("stores actual question count when fewer questions are produced than requested", () => {
    const questions = createQuizQuestions(noExampleVocabulary, 50, { mode: QUIZ_MODES.meaningChoice });
    expect(questions.length).toBeLessThan(50);

    const nextState = sessionReducer(initialState, {
      type: actionTypes.startQuiz,
      payload: {
        mode: QUIZ_MODES.meaningChoice,
        timerEnabled: true,
        questionCount: questions.length,
        startedAt: Date.now(),
        questions
      }
    });

    expect(nextState.quiz.questionCount).toBe(questions.length);
    expect(nextState.quiz.questions).toHaveLength(questions.length);
  });

  it("computes accuracy with actual question count, not the original requested count", () => {
    const questions = createQuizQuestions(clozeVocabulary, 3, { mode: QUIZ_MODES.clozeChoice });
    const actualCount = questions.length;

    const quizState = {
      screen: "quiz",
      flashcards: null,
      quiz: {
        mode: QUIZ_MODES.clozeChoice,
        timerEnabled: false,
        questionCount: actualCount,
        currentIndex: actualCount - 1,
        correctCount: actualCount - 1,
        wrongCount: 1,
        selectedChoiceId: "choice-x",
        isLocked: true,
        questionStartedAt: 1000,
        answers: questions.map((q) => ({
          questionId: q.id,
          questionType: q.type,
          wordId: q.wordId,
          prompt: q.reviewPrompt,
          answerWord: q.answerWord,
          correctText: q.correctText,
          selectedText: q.correctText,
          isCorrect: true
        })),
        questions,
        accuracy: 0
      }
    };

    const accuracy = Math.round(((actualCount - 1) / actualCount) * 100);

    const nextState = sessionReducer(quizState, {
      type: actionTypes.completeQuiz,
      payload: { accuracy }
    });

    expect(nextState.quiz.accuracy).toBe(accuracy);
    expect(nextState.quiz.accuracy).not.toBe(0);
  });

  it("startQuiz with 0 questions still stores the quiz session", () => {
    const nextState = sessionReducer(initialState, {
      type: actionTypes.startQuiz,
      payload: {
        mode: QUIZ_MODES.clozeChoice,
        timerEnabled: false,
        questionCount: 0,
        startedAt: Date.now(),
        questions: []
      }
    });

    expect(nextState.screen).toBe("quiz");
    expect(nextState.quiz.questionCount).toBe(0);
    expect(nextState.quiz.questions).toEqual([]);
  });
});
