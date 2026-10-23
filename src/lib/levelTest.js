export const LEVEL_TEST_QUESTION_COUNT = 30;
export const LEVEL_TEST_BAND_SIZE = 1000;
export const LEVEL_TEST_BAND_COUNT = 20;
export const LEVEL_TEST_UNKNOWN_ANSWER_ID = "level-test-unknown";
export const LEVEL_TEST_ANCHOR_BANDS = [1, 2, 3, 4, 6, 8, 10, 12, 15, 20];

const MAX_RANK = LEVEL_TEST_BAND_SIZE * LEVEL_TEST_BAND_COUNT;
const NEARBY_TRACK_MEDIAN_TOLERANCE = 500;

function normalizeSeed(seed) {
  if (Number.isFinite(seed)) {
    return seed >>> 0;
  }

  let hash = 2166136261;
  for (const character of String(seed ?? "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRandom(seed) {
  let state = normalizeSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleWithSeed(values, seed) {
  const shuffled = [...values];
  const random = createRandom(seed);

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

export function getLevelTestBand(rank) {
  if (!Number.isFinite(rank) || rank < 1 || rank > MAX_RANK) {
    return null;
  }

  return Math.ceil(rank / LEVEL_TEST_BAND_SIZE);
}

export function createLevelTestSession(seed = 1) {
  return {
    seed: normalizeSeed(seed),
    answers: [],
    askedWords: [],
    missStreak: 0,
    cutoffBand: LEVEL_TEST_BAND_COUNT + 1,
    preferAbove: true
  };
}

function normalizeWord(word) {
  return String(word ?? "").normalize("NFKC").trim().toLowerCase();
}

function normalizeMeaning(meaning) {
  return String(meaning ?? "").normalize("NFKC").replace(/\s+/gu, "").trim();
}

function primaryPartOfSpeech(pos) {
  return String(pos ?? "")
    .toLowerCase()
    .replaceAll(".", "")
    .split(/[;,/|\s]+/u)
    .find(Boolean) ?? "";
}

function countAskedByBand(answers) {
  const counts = Array(LEVEL_TEST_BAND_COUNT + 1).fill(0);
  for (const answer of answers) {
    if (Number.isInteger(answer.band) && answer.band >= 1 && answer.band <= LEVEL_TEST_BAND_COUNT) {
      counts[answer.band] += 1;
    }
  }
  return counts;
}

function getUnusedWords(bank, state) {
  const usedWords = new Set(state.askedWords);
  return bank.filter((item) => !usedWords.has(normalizeWord(item.word)));
}

function orderAdaptiveBands(bank, state) {
  const estimate = estimateLevelTestWordCount(state.answers);
  const targetBand = Math.min(
    LEVEL_TEST_BAND_COUNT,
    Math.max(1, Math.ceil(estimate / LEVEL_TEST_BAND_SIZE))
  );
  const maxBand = Math.max(1, Math.min(LEVEL_TEST_BAND_COUNT, state.cutoffBand - 1));
  const answerCounts = countAskedByBand(state.answers);
  const sideOrder = state.preferAbove
    ? [targetBand + 1, targetBand - 1, targetBand]
    : [targetBand - 1, targetBand + 1, targetBand];
  const nearbyBands = sideOrder.filter((band) => band >= 1 && band <= maxBand);
  const allAllowedBands = Array.from({ length: maxBand }, (_, index) => index + 1);
  const preferenceIndex = new Map(sideOrder.map((band, index) => [band, index]));
  const ordered = [...nearbyBands, ...allAllowedBands]
    .filter((band, index, values) => values.indexOf(band) === index)
    .sort((left, right) => {
      const countDifference = answerCounts[left] - answerCounts[right];
      if (countDifference !== 0) {
        return countDifference;
      }

      const leftIsNearby = preferenceIndex.has(left);
      const rightIsNearby = preferenceIndex.has(right);
      if (leftIsNearby !== rightIsNearby) {
        return leftIsNearby ? -1 : 1;
      }
      if (leftIsNearby && rightIsNearby) {
        return preferenceIndex.get(left) - preferenceIndex.get(right);
      }
      return Math.abs(left - targetBand) - Math.abs(right - targetBand) || left - right;
    });
  const availableBands = new Set(
    getUnusedWords(bank, state)
      .map((item) => getLevelTestBand(item.rank))
      .filter((band) => band !== null)
  );

  return ordered.filter((band) => availableBands.has(band));
}

function makeQuestion(bank, word, state, questionIndex, seed) {
  const band = getLevelTestBand(word.rank);
  const usedWords = new Set(state.askedWords);
  const correctMeaning = normalizeMeaning(word.meaning);
  const distractorPool = bank.filter((candidate) => {
    const candidateBand = getLevelTestBand(candidate.rank);
    return candidateBand !== null &&
      Math.abs(candidateBand - band) <= 1 &&
      normalizeWord(candidate.word) !== normalizeWord(word.word) &&
      !usedWords.has(normalizeWord(candidate.word)) &&
      normalizeMeaning(candidate.meaning) !== correctMeaning;
  });
  const meaningsSeen = new Set([correctMeaning]);
  const uniqueDistractors = [];

  for (const candidate of shuffleWithSeed(distractorPool, seed ^ 0x5bd1e995)) {
    const meaning = normalizeMeaning(candidate.meaning);
    if (!meaning || meaningsSeen.has(meaning)) {
      continue;
    }
    meaningsSeen.add(meaning);
    uniqueDistractors.push(candidate);
  }

  const preferredPos = primaryPartOfSpeech(word.pos);
  const isSamePos = (candidate) =>
    preferredPos && primaryPartOfSpeech(candidate.pos) === preferredPos;
  const isSameBand = (candidate) => getLevelTestBand(candidate.rank) === band;
  const distractors = [
    ...uniqueDistractors.filter((candidate) => isSamePos(candidate) && isSameBand(candidate)),
    ...uniqueDistractors.filter((candidate) => isSamePos(candidate) && !isSameBand(candidate)),
    ...uniqueDistractors.filter((candidate) => !isSamePos(candidate) && isSameBand(candidate)),
    ...uniqueDistractors.filter((candidate) => !isSamePos(candidate) && !isSameBand(candidate))
  ].slice(0, 3);

  if (distractors.length < 3) {
    return null;
  }

  const correctChoiceId = "correct-" + questionIndex;
  const choices = [
    {
      id: correctChoiceId,
      text: word.meaning,
      isCorrect: true,
      sourceBand: band,
      sourcePos: word.pos
    },
    ...distractors.map((candidate, index) => ({
      id: "distractor-" + questionIndex + "-" + index,
      text: candidate.meaning,
      isCorrect: false,
      sourceBand: getLevelTestBand(candidate.rank),
      sourcePos: candidate.pos
    }))
  ];

  return {
    id: "level-test-question-" + questionIndex,
    word,
    band,
    choices: shuffleWithSeed(choices, seed ^ 0x27d4eb2d),
    correctChoiceId
  };
}

function getQuestionForBand(bank, state, band, questionIndex) {
  const unused = getUnusedWords(bank, state)
    .filter((item) => getLevelTestBand(item.rank) === band);
  const seed = normalizeSeed(state.seed + (questionIndex + 1) * 0x9e3779b9 + band * 0x85ebca6b);

  for (const word of shuffleWithSeed(unused, seed)) {
    const question = makeQuestion(bank, word, state, questionIndex, seed);
    if (question) {
      return question;
    }
  }

  return null;
}

export function getNextLevelTestQuestion(bank, state) {
  const questionIndex = state.answers.length;
  if (questionIndex >= LEVEL_TEST_QUESTION_COUNT) {
    return null;
  }

  if (questionIndex < LEVEL_TEST_ANCHOR_BANDS.length) {
    const anchorBand = LEVEL_TEST_ANCHOR_BANDS[questionIndex];
    const exactQuestion = getQuestionForBand(bank, state, anchorBand, questionIndex);
    if (exactQuestion) {
      return exactQuestion;
    }

    const nearestAvailable = Array.from({ length: LEVEL_TEST_BAND_COUNT }, (_, index) => index + 1)
      .sort((left, right) => Math.abs(left - anchorBand) - Math.abs(right - anchorBand));
    for (const band of nearestAvailable) {
      const fallback = getQuestionForBand(bank, state, band, questionIndex);
      if (fallback) {
        return fallback;
      }
    }
    return null;
  }

  for (const band of orderAdaptiveBands(bank, state)) {
    const question = getQuestionForBand(bank, state, band, questionIndex);
    if (question) {
      return question;
    }
  }

  // The 30-question limit takes priority when the lowest band has no easier fallback.
  return getQuestionForBand(bank, state, 1, questionIndex);
}

export function answerLevelTestQuestion(state, question, selectedChoiceId) {
  const isUnknown = selectedChoiceId === LEVEL_TEST_UNKNOWN_ANSWER_ID;
  const isCorrect = !isUnknown && selectedChoiceId === question.correctChoiceId;
  const answerIndex = state.answers.length;
  const missStreak = answerIndex < LEVEL_TEST_ANCHOR_BANDS.length
    ? 0
    : isCorrect
      ? 0
      : state.missStreak + 1;
  const cutoffBand = missStreak >= 2
    ? Math.min(state.cutoffBand, question.band)
    : state.cutoffBand;

  return {
    ...state,
    answers: [
      ...state.answers,
      {
        uid: question.word.uid,
        word: question.word.word,
        rank: question.word.rank,
        band: question.band,
        isCorrect,
        isUnknown
      }
    ],
    askedWords: [...state.askedWords, normalizeWord(question.word.word)],
    missStreak,
    cutoffBand,
    preferAbove: answerIndex >= LEVEL_TEST_ANCHOR_BANDS.length
      ? !state.preferAbove
      : state.preferAbove
  };
}

function interpolateMissingRates(rates) {
  const knownIndexes = rates.flatMap((rate, index) => rate === null ? [] : [index]);
  if (knownIndexes.length === 0) {
    return Array(LEVEL_TEST_BAND_COUNT).fill(0);
  }

  return rates.map((rate, index) => {
    if (rate !== null) {
      return rate;
    }

    const previousIndex = [...knownIndexes].reverse().find((knownIndex) => knownIndex < index);
    const nextIndex = knownIndexes.find((knownIndex) => knownIndex > index);
    if (previousIndex === undefined) {
      return rates[nextIndex];
    }
    if (nextIndex === undefined) {
      return rates[previousIndex];
    }

    const span = nextIndex - previousIndex;
    const progress = (index - previousIndex) / span;
    return rates[previousIndex] + (rates[nextIndex] - rates[previousIndex]) * progress;
  });
}

export function makeRatesNonIncreasing(rates) {
  const blocks = [];

  for (let index = 0; index < rates.length; index += 1) {
    const value = Math.max(0, Math.min(1, Number(rates[index]) || 0));
    blocks.push({ start: index, end: index, sum: value, weight: 1, mean: value });

    while (blocks.length > 1 && blocks[blocks.length - 2].mean < blocks[blocks.length - 1].mean) {
      const right = blocks.pop();
      const left = blocks.pop();
      const merged = {
        start: left.start,
        end: right.end,
        sum: left.sum + right.sum,
        weight: left.weight + right.weight
      };
      merged.mean = merged.sum / merged.weight;
      blocks.push(merged);
    }
  }

  const normalized = Array(rates.length);
  for (const block of blocks) {
    for (let index = block.start; index <= block.end; index += 1) {
      normalized[index] = block.mean;
    }
  }
  return normalized;
}

export function getCorrectedLevelTestBandRates(answers) {
  const stats = Array.from({ length: LEVEL_TEST_BAND_COUNT }, () => ({
    count: 0,
    correct: 0,
    wrong: 0
  }));

  for (const answer of answers) {
    const index = answer.band - 1;
    if (index < 0 || index >= stats.length) {
      continue;
    }

    stats[index].count += 1;
    if (answer.isCorrect) {
      stats[index].correct += 1;
    } else if (!answer.isUnknown) {
      stats[index].wrong += 1;
    }
  }

  const observedRates = stats.map(({ count, correct, wrong }) =>
    count > 0 ? Math.max(0, (correct - wrong / 3) / count) : null
  );
  return makeRatesNonIncreasing(interpolateMissingRates(observedRates));
}

export function estimateLevelTestWordCount(answers) {
  const estimated = getCorrectedLevelTestBandRates(answers)
    .reduce((total, rate) => total + rate * LEVEL_TEST_BAND_SIZE, 0);
  return Math.max(0, Math.min(MAX_RANK, Math.round(estimated / 100) * 100));
}

export function classifyLevelTestResult(wordCount, tracks) {
  const rankedTracks = tracks
    .filter((track) => Number.isFinite(track.median))
    .slice()
    .sort((left, right) => left.median - right.median || left.id.localeCompare(right.id));
  const lowerTracks = rankedTracks.filter((track) => track.median <= wordCount);
  const highestMatchedMedian = lowerTracks.at(-1)?.median;
  const nearestTracks = highestMatchedMedian === undefined
    ? []
    : lowerTracks.filter((track) => track.median >= highestMatchedMedian - NEARBY_TRACK_MEDIAN_TOLERANCE);
  const higherTracks = rankedTracks.filter((track) => track.median > wordCount);
  const nextMedian = higherTracks[0]?.median;
  const nextTracks = nextMedian === undefined
    ? []
    : higherTracks.filter((track) => track.median <= nextMedian + LEVEL_TEST_BAND_SIZE);

  return {
    nearestTracks,
    nextTracks,
    isBelowLowestTrack: lowerTracks.length === 0
  };
}
