import {
  defaultProgress,
  defaultSession,
  defaultSettings,
  readStoredValue,
  STORAGE_KEYS
} from "../lib/storage";
import { settingsReducer } from "./reducers/settingsReducer";
import { progressReducer } from "./reducers/progressReducer";
import { sessionReducer } from "./reducers/sessionReducer";
import { uiReducer } from "./reducers/uiReducer";

export function createInitialAppState() {
  return {
    settings: readStoredValue(STORAGE_KEYS.settings, defaultSettings),
    progress: readStoredValue(STORAGE_KEYS.progress, defaultProgress),
    session: readStoredValue(STORAGE_KEYS.session, defaultSession),
    now: Date.now(),
    pronunciationMessage: ""
  };
}

export function appReducer(state, action) {
  return {
    settings: settingsReducer(state.settings, action),
    progress: progressReducer(state.progress, action),
    session: sessionReducer(state.session, action),
    ...uiReducer(
      {
        now: state.now,
        pronunciationMessage: state.pronunciationMessage
      },
      action
    )
  };
}
