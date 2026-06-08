import { defaultVocabularyTrack, normalizeVocabularyTrack } from "../constants/vocabularyTracks";

export const STORAGE_KEYS = {
  appState: "vocabulary-king:app-state",
  settings: "vocabulary-king:settings",
  progress: "vocabulary-king:progress",
  session: "vocabulary-king:session"
};

export const defaultSettings = {
  locale: "zh-TW",
  vocabularyTrack: defaultVocabularyTrack,
  autoShowMeaning: false,
  autoShowExample: false,
  meaningQuizTimerEnabled: true,
  clozeQuizTimerEnabled: false
};

export const defaultProgress = {
  savedWords: [],
  byTrack: {}
};

export const defaultSession = {
  screen: "home",
  flashcards: null,
  quiz: null
};

export function readStoredValue(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);

    if (!raw) {
      return fallback;
    }

    return {
      ...fallback,
      ...JSON.parse(raw)
    };
  } catch (error) {
    return fallback;
  }
}

export function normalizeSettings(settings) {
  return {
    ...defaultSettings,
    ...settings,
    vocabularyTrack: normalizeVocabularyTrack(settings?.vocabularyTrack)
  };
}

export function readStoredSettings() {
  return normalizeSettings(readStoredValue(STORAGE_KEYS.settings, defaultSettings));
}

export function writeStoredValue(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}
