import { describe, expect, it } from "vitest";
import { actionTypes } from "../actionTypes";
import { progressReducer } from "./progressReducer";

describe("progressReducer", () => {
  const initialState = {
    starredWordIds: [],
    knownWordIds: [],
    wordStats: {},
    quizHistory: []
  };

  it("toggles starred words", () => {
    const added = progressReducer(initialState, {
      type: actionTypes.toggleStarredWord,
      payload: "word-1"
    });

    const removed = progressReducer(added, {
      type: actionTypes.toggleStarredWord,
      payload: "word-1"
    });

    expect(added.starredWordIds).toEqual(["word-1"]);
    expect(removed.starredWordIds).toEqual([]);
  });

  it("hydrates persisted progress", () => {
    const nextState = progressReducer(initialState, {
      type: actionTypes.hydratePersistence,
      payload: {
        progress: {
          starredWordIds: ["saved-word"],
          knownWordIds: ["known-word"],
          wordStats: {
            "saved-word": {
              seenCount: 3,
              correctCount: 2,
              wrongCount: 1,
              lastSeenAt: 456
            }
          },
          quizHistory: []
        }
      }
    });

    expect(nextState.starredWordIds).toEqual(["saved-word"]);
    expect(nextState.knownWordIds).toEqual(["known-word"]);
    expect(nextState.wordStats["saved-word"].seenCount).toBe(3);
  });

  it("toggles known words", () => {
    const added = progressReducer(initialState, {
      type: actionTypes.toggleKnownWord,
      payload: "word-3"
    });

    const removed = progressReducer(added, {
      type: actionTypes.toggleKnownWord,
      payload: "word-3"
    });

    expect(added.knownWordIds).toEqual(["word-3"]);
    expect(removed.knownWordIds).toEqual([]);
  });

  it("records word stats when quiz answers are locked", () => {
    const nextState = progressReducer(initialState, {
      type: actionTypes.lockQuizAnswer,
      payload: {
        activeQuestion: {
          wordId: "word-2"
        },
        answeredAt: 12345,
        isCorrect: true
      }
    });

    expect(nextState.wordStats["word-2"]).toMatchObject({
      seenCount: 1,
      correctCount: 1,
      wrongCount: 0,
      lastSeenAt: 12345
    });
  });

  it("appends quiz history entries", () => {
    const nextState = progressReducer(initialState, {
      type: actionTypes.completeQuiz,
      payload: {
        historyEntry: {
          playedAt: 1,
          questionCount: 10,
          correctCount: 8,
          wrongCount: 2,
          accuracy: 80
        }
      }
    });

    expect(nextState.quizHistory).toHaveLength(1);
    expect(nextState.quizHistory[0].accuracy).toBe(80);
  });
});
