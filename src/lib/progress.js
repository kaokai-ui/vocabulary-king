import {
  buildStableVocabularyId,
  extractLegacyVocabularySignature,
  slugifyVocabularyPart
} from "./vocabularyIdentity";

export const defaultTrackProgress = {
  starredWordIds: [],
  knownWordIds: [],
  wordStats: {},
  quizHistory: []
};

export const defaultProgressState = {
  byTrack: {}
};

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
    byTrack: {
      ...(progress?.byTrack ?? {}),
      [trackId]: {
        ...defaultTrackProgress,
        ...cloneTrackProgress(trackProgress)
      }
    }
  };
}

function resolveVocabularyId(id, byCurrentId, byLegacySignature) {
  if (byCurrentId.has(id)) {
    return id;
  }

  const signature = extractLegacyVocabularySignature(id);

  if (!signature) {
    return null;
  }

  const matches = byLegacySignature.get(`${signature.level}:${signature.wordSlug}`) ?? [];

  return matches.length === 1 ? matches[0] : null;
}

export function migrateTrackProgress(trackProgress, vocabulary) {
  const current = getTrackProgress({ byTrack: { current: trackProgress } }, "current");
  const byCurrentId = new Set(vocabulary.map((word) => word.id));
  const byLegacySignature = new Map();

  vocabulary.forEach((word) => {
    const stableId = buildStableVocabularyId(word.level, word.word, word.meaning);
    const wordSlug = slugifyVocabularyPart(word.word) || "word";
    const legacyKey = `${word.level}:${wordSlug}`;
    const legacyMatches = byLegacySignature.get(legacyKey) ?? [];

    if (stableId === word.id) {
      legacyMatches.push(word.id);
      byLegacySignature.set(legacyKey, legacyMatches);
    }
  });

  const remapWordIdList = (wordIds) =>
    [...new Set(wordIds.map((wordId) => resolveVocabularyId(wordId, byCurrentId, byLegacySignature)).filter(Boolean))];

  const remappedWordStats = Object.entries(current.wordStats).reduce((nextWordStats, [wordId, stats]) => {
    const resolvedId = resolveVocabularyId(wordId, byCurrentId, byLegacySignature);

    if (!resolvedId) {
      return nextWordStats;
    }

    const previousStats = nextWordStats[resolvedId] ?? {
      seenCount: 0,
      correctCount: 0,
      wrongCount: 0,
      lastSeenAt: null
    };

    nextWordStats[resolvedId] = {
      seenCount: previousStats.seenCount + (stats.seenCount ?? 0),
      correctCount: previousStats.correctCount + (stats.correctCount ?? 0),
      wrongCount: previousStats.wrongCount + (stats.wrongCount ?? 0),
      lastSeenAt: Math.max(previousStats.lastSeenAt ?? 0, stats.lastSeenAt ?? 0) || null
    };

    return nextWordStats;
  }, {});

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
