import { extractLegacyVocabularySignature, slugifyVocabularyPart } from "./vocabularyIdentity";

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

function resolveVocabularyId(id, byCurrentId, byWordLevelSignature, wordSlugsByLevel) {
  if (byCurrentId.has(id)) {
    return id;
  }

  const legacySignature = extractLegacyVocabularySignature(id);

  if (legacySignature) {
    const legacyMatches = byWordLevelSignature.get(`${legacySignature.level}:${legacySignature.wordSlug}`) ?? [];

    return legacyMatches.length === 1 ? legacyMatches[0] : null;
  }

  const levelMatch = /^(L\d+)-/.exec(String(id ?? ""));

  if (!levelMatch) {
    return null;
  }

  const level = levelMatch[1];
  const candidateWordSlugs = wordSlugsByLevel.get(level) ?? [];
  const matchingWordSlugs = candidateWordSlugs
    .filter((wordSlug) => String(id).startsWith(`${level}-${wordSlug}-`))
    .sort((left, right) => right.length - left.length);

  if (matchingWordSlugs.length === 0) {
    return null;
  }

  const matches = byWordLevelSignature.get(`${level}:${matchingWordSlugs[0]}`) ?? [];

  return matches.length === 1 ? matches[0] : null;
}

export function migrateTrackProgress(trackProgress, vocabulary) {
  const current = getTrackProgress({ byTrack: { current: trackProgress } }, "current");
  const byCurrentId = new Set(vocabulary.map((word) => word.id));
  const byWordLevelSignature = new Map();
  const wordSlugsByLevel = new Map();

  vocabulary.forEach((word) => {
    const wordSlug = slugifyVocabularyPart(word.word) || "word";
    const signatureKey = `${word.level}:${wordSlug}`;
    const signatureMatches = byWordLevelSignature.get(signatureKey) ?? [];
    const currentWordSlugs = wordSlugsByLevel.get(word.level) ?? [];

    signatureMatches.push(word.id);
    byWordLevelSignature.set(signatureKey, signatureMatches);

    if (!currentWordSlugs.includes(wordSlug)) {
      currentWordSlugs.push(wordSlug);
      wordSlugsByLevel.set(word.level, currentWordSlugs);
    }
  });

  const remapWordIdList = (wordIds) =>
    [
      ...new Set(
        wordIds
          .map((wordId) => resolveVocabularyId(wordId, byCurrentId, byWordLevelSignature, wordSlugsByLevel))
          .filter(Boolean)
      )
    ];

  const remappedWordStats = Object.entries(current.wordStats).reduce((nextWordStats, [wordId, stats]) => {
    const resolvedId = resolveVocabularyId(wordId, byCurrentId, byWordLevelSignature, wordSlugsByLevel);

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
