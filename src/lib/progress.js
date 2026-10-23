export const defaultTrackProgress = {
  starredWordIds: [],
  knownWordIds: [],
  wordStats: {},
  quizHistory: []
};

export const defaultProgressState = {
  savedWords: [],
  byTrack: {}
};

function cloneSavedWord(savedWord = {}) {
  return {
    id: savedWord.id ?? "",
    word: savedWord.word ?? "",
    meaning: savedWord.meaning ?? "",
    example: savedWord.example ?? "",
    level: savedWord.level ?? "",
    sourceTrackId: savedWord.sourceTrackId ?? null
  };
}

export function cloneSavedWords(savedWords = []) {
  return savedWords.map((savedWord) => cloneSavedWord(savedWord)).filter((savedWord) => savedWord.id);
}

function cloneTrackProgress(trackProgress = {}) {
  return {
    starredWordIds: [...(trackProgress.starredWordIds ?? [])],
    knownWordIds: [...(trackProgress.knownWordIds ?? [])],
    wordStats: { ...(trackProgress.wordStats ?? {}) },
    quizHistory: [...(trackProgress.quizHistory ?? [])]
  };
}

export function getTrackProgress(progress, trackId) {
  if (progress?.byTrack?.[trackId]) {
    return {
      ...defaultTrackProgress,
      ...cloneTrackProgress(progress.byTrack[trackId])
    };
  }

  return {
    ...defaultTrackProgress,
    ...cloneTrackProgress(progress)
  };
}

export function setTrackProgress(progress, trackId, trackProgress) {
  return {
    ...(progress?.savedWords ? { savedWords: cloneSavedWords(progress.savedWords) } : {}),
    byTrack: {
      ...(progress?.byTrack ?? {}),
      [trackId]: {
        ...defaultTrackProgress,
        ...cloneTrackProgress(trackProgress)
      }
    }
  };
}

export function migrateTrackProgress(trackProgress, vocabulary) {
  const current = getTrackProgress({ byTrack: { current: trackProgress } }, "current");
  const byCurrentId = new Set(vocabulary.map((word) => word.id));
  const remapWordIdList = (wordIds) => [...new Set(wordIds.filter((wordId) => byCurrentId.has(wordId)))];
  const remappedWordStats = Object.fromEntries(
    Object.entries(current.wordStats).filter(([wordId]) => byCurrentId.has(wordId))
  );

  return {
    ...current,
    starredWordIds: remapWordIdList(current.starredWordIds),
    knownWordIds: remapWordIdList(current.knownWordIds),
    wordStats: remappedWordStats
  };
}

export function isTrackProgressEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
