export const STORAGE_KEYS = {
  appState: "vocabulary-king:app-state",
  settings: "vocabulary-king:settings",
  progress: "vocabulary-king:progress",
  session: "vocabulary-king:session"
};

export const defaultSettings = {
  locale: "zh-TW",
  vocabularyTrack: "junior-high",
  autoShowMeaning: false,
  autoShowExample: false
};

export const defaultProgress = {
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

export function writeStoredValue(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}
