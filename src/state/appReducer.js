import {
  defaultProgress,
  defaultSession,
  readStoredSettings,
  readStoredValue,
  STORAGE_KEYS
} from "../lib/storage";
import { settingsReducer } from "./reducers/settingsReducer";
import { progressReducer } from "./reducers/progressReducer";
import { sessionReducer } from "./reducers/sessionReducer";
import { uiReducer } from "./reducers/uiReducer";

export function createInitialAppState() {
  return {
    settings: readStoredSettings(),
    progress: readStoredValue(STORAGE_KEYS.progress, defaultProgress),
    session: readStoredValue(STORAGE_KEYS.session, defaultSession),
    now: Date.now(),
    pronunciationMessage: ""
  };
}

export function appReducer(state, action) {
  const nextSettings = settingsReducer(state.settings, action);

  return {
    settings: nextSettings,
    progress: progressReducer(state.progress, action, state.settings.vocabularyTrack),
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
