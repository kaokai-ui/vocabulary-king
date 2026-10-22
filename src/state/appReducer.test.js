import { describe, expect, it } from "vitest";
import { appReducer } from "./appReducer";
import { actionTypes } from "./actionTypes";

describe("appReducer locale changes", () => {
  it("preserves progress and the current session when the display locale changes", () => {
    const progress = {
      savedWords: [{ id: "word-1", sourceTrackId: "junior-high" }],
      byTrack: {
        "junior-high": {
          starredWordIds: ["word-1"],
          knownWordIds: ["word-2"],
          wordStats: { "word-1": { correct: 2, wrong: 1 } },
          quizHistory: [{ accuracy: 80 }]
        }
      }
    };
    const session = { screen: "quiz", quiz: { currentIndex: 1 }, flashcards: null };
    const state = {
      settings: { locale: "zh-TW", vocabularyTrack: "junior-high", pronunciationAccent: "US" },
      progress,
      session,
      now: 123,
      pronunciationMessage: ""
    };

    const nextState = appReducer(state, {
      type: actionTypes.updateSetting,
      payload: { key: "locale", value: "en" }
    });

    expect(nextState.settings.locale).toBe("en");
    expect(nextState.progress).toBe(progress);
    expect(nextState.session).toBe(session);
  });
});
