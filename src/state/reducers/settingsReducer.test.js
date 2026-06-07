import { describe, expect, it } from "vitest";
import { actionTypes } from "../actionTypes";
import { settingsReducer } from "./settingsReducer";

describe("settingsReducer", () => {
  const initialState = {
    locale: "zh-TW",
    vocabularyTrack: "junior-high",
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
});
