import { describe, expect, it } from "vitest";
import { actionTypes } from "../actionTypes";
import { progressReducer } from "./progressReducer";

describe("progressReducer", () => {
  const initialState = {
    byTrack: {}
  };

  function reduce(state, action, trackId = "junior-high") {
    return progressReducer(state, action, trackId);
  }

  it("toggles starred words within the active track only", () => {
    const added = reduce(initialState, {
      type: actionTypes.toggleStarredWord,
      payload: "word-1",
      meta: { trackId: "junior-high" }
    });

    const otherTrack = reduce(added, {
      type: actionTypes.toggleStarredWord,
      payload: "word-2",
      meta: { trackId: "senior-high" }
    });

    expect(otherTrack.byTrack["junior-high"].starredWordIds).toEqual(["word-1"]);
    expect(otherTrack.byTrack["senior-high"].starredWordIds).toEqual(["word-2"]);
  });

  it("hydrates persisted progress", () => {
    const nextState = reduce(initialState, {
      type: actionTypes.hydratePersistence,
      payload: {
        progress: {
          byTrack: {
            "junior-high": {
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
        }
      }
    });

    expect(nextState.byTrack["junior-high"].starredWordIds).toEqual(["saved-word"]);
    expect(nextState.byTrack["junior-high"].knownWordIds).toEqual(["known-word"]);
    expect(nextState.byTrack["junior-high"].wordStats["saved-word"].seenCount).toBe(3);
  });

  it("toggles known words", () => {
    const added = reduce(initialState, {
      type: actionTypes.toggleKnownWord,
      payload: "word-3",
      meta: { trackId: "junior-high" }
    });

    const removed = reduce(added, {
      type: actionTypes.toggleKnownWord,
      payload: "word-3",
      meta: { trackId: "junior-high" }
    });

    expect(added.byTrack["junior-high"].knownWordIds).toEqual(["word-3"]);
    expect(removed.byTrack["junior-high"].knownWordIds).toEqual([]);
  });

  it("records word stats when quiz answers are locked", () => {
    const nextState = reduce(initialState, {
      type: actionTypes.lockQuizAnswer,
      payload: {
        activeQuestion: {
          wordId: "word-2"
        },
        answeredAt: 12345,
        isCorrect: true
      },
      meta: { trackId: "junior-high" }
    });

    expect(nextState.byTrack["junior-high"].wordStats["word-2"]).toMatchObject({
      seenCount: 1,
      correctCount: 1,
      wrongCount: 0,
      lastSeenAt: 12345
    });
  });

  it("appends quiz history entries per track", () => {
    const nextState = reduce(initialState, {
      type: actionTypes.completeQuiz,
      payload: {
        historyEntry: {
          playedAt: 1,
          questionCount: 10,
          correctCount: 8,
          wrongCount: 2,
          accuracy: 80
        }
      },
      meta: { trackId: "senior-high" }
    });

    expect(nextState.byTrack["senior-high"].quizHistory).toHaveLength(1);
    expect(nextState.byTrack["senior-high"].quizHistory[0].accuracy).toBe(80);
  });
});
