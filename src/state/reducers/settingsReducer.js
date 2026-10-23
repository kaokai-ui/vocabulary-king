import { actionTypes } from "../actionTypes";
import { normalizeVocabularyTrack } from "../../constants/vocabularyTracks";
import { normalizeLocale } from "../../i18n/localeConfig";
import { normalizePronunciationAccent } from "../../lib/speech";

export function settingsReducer(state, action) {
  switch (action.type) {
    case actionTypes.updateSetting: {
      const key = action.payload.key;
      const value = key === "vocabularyTrack"
        ? normalizeVocabularyTrack(action.payload.value)
        : key === "locale"
          ? normalizeLocale(action.payload.value)
          : key === "pronunciationAccent"
            ? normalizePronunciationAccent(action.payload.value)
            : action.payload.value;
      return {
        ...state,
        [key]: value,
        ...(key === "vocabularyTrack" && value !== state.vocabularyTrack ? { vocabularyLevel: "all" } : {})
      };
    }

    case actionTypes.toggleSetting:
      return {
        ...state,
        [action.payload]: !state[action.payload]
      };

    default:
      return state;
  }
}
