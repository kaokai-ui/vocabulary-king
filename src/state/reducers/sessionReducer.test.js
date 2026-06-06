import { describe, expect, it } from "vitest";
import { actionTypes } from "../actionTypes";
import { sessionReducer } from "./sessionReducer";

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
        questionCount: 10,
        startedAt: 999,
        questions: [{ wordId: "x" }]
      }
    });

    expect(nextState.screen).toBe("quiz");
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
        selectedIndex: 1,
        isLocked: true,
        questionStartedAt: 1000,
        answers: [],
        questions: [],
        accuracy: 0
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
});
