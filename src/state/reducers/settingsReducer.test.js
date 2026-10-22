import { describe, expect, it } from "vitest";
import { actionTypes } from "../actionTypes";
import { settingsReducer } from "./settingsReducer";

describe("settingsReducer", () => {
  const initialState = {
    locale: "zh-TW",
    vocabularyTrack: "junior-high",
    pronunciationAccent: "US",
    autoShowMeaning: false,
    autoShowExample: false,
    meaningQuizTimerEnabled: true,
    clozeQuizTimerEnabled: false
  };

  it("updates a specific setting", () => {
    const nextState = settingsReducer(initialState, {
      type: actionTypes.updateSetting,
      payload: { key: "locale", value: "en" }
    });

    expect(nextState.locale).toBe("en");
    expect(nextState.vocabularyTrack).toBe("junior-high");
  });

  it("falls back to Traditional Chinese when an extra locale is disabled", () => {
    const nextState = settingsReducer(initialState, {
      type: actionTypes.updateSetting,
      payload: { key: "locale", value: "ja" }
    });

    expect(nextState.locale).toBe("zh-TW");
  });

  it("toggles boolean settings", () => {
    const nextState = settingsReducer(initialState, {
      type: actionTypes.toggleSetting,
      payload: "clozeQuizTimerEnabled"
    });

    expect(nextState.clozeQuizTimerEnabled).toBe(true);
    expect(nextState.meaningQuizTimerEnabled).toBe(true);
  });

  it("normalizes legacy vocabulary track ids", () => {
    const nextState = settingsReducer(initialState, {
      type: actionTypes.updateSetting,
      payload: { key: "vocabularyTrack", value: "gept" }
    });

    expect(nextState.vocabularyTrack).toBe("gept-elementary");
  });

  it("normalizes pronunciation accents", () => {
    const nextState = settingsReducer(initialState, {
      type: actionTypes.updateSetting,
      payload: { key: "pronunciationAccent", value: "UK" }
    });

    expect(nextState.pronunciationAccent).toBe("UK");
  });
});
