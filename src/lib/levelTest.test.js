import { describe, expect, it } from "vitest";
import {
  answerLevelTestQuestion,
  classifyLevelTestResult,
  createLevelTestSession,
  estimateLevelTestWordCount,
  getCorrectedLevelTestBandRates,
  getLevelTestBand,
  getNextLevelTestQuestion,
  LEVEL_TEST_ANCHOR_BANDS,
  LEVEL_TEST_QUESTION_COUNT,
  LEVEL_TEST_UNKNOWN_ANSWER_ID,
  makeRatesNonIncreasing,
  shuffleWithSeed
} from "./levelTest";
import { appendLevelTestHistory, LEVEL_TEST_HISTORY_LIMIT } from "./levelTestStorage";

function makeBank() {
  return Array.from({ length: 20 }, (_, bandIndex) =>
    Array.from({ length: 40 }, (_, wordIndex) => ({
      uid: "uid-" + bandIndex + "-" + wordIndex,
      track: "toeic",
      word: "word-" + bandIndex + "-" + wordIndex,
      rank: bandIndex * 1000 + wordIndex + 1,
      pos: wordIndex % 2 === 0 ? "n." : "v.",
      meaning: "meaning-" + bandIndex + "-" + wordIndex
    }))
  ).flat();
}

function answerAll(bank, answerCorrect) {
  let state = createLevelTestSession(42);
  const questions = [];

  while (questions.length < LEVEL_TEST_QUESTION_COUNT) {
    const question = getNextLevelTestQuestion(bank, state);
    expect(question).not.toBeNull();
    questions.push(question);
    state = answerLevelTestQuestion(
      state,
      question,
      answerCorrect(question, questions.length - 1)
        ? question.correctChoiceId
        : LEVEL_TEST_UNKNOWN_ANSWER_ID
    );
  }

  return { state, questions };
}

describe("level test question selection", () => {
  it("maps 31K ranks to the 20 tested bands", () => {
    expect(getLevelTestBand(1)).toBe(1);
    expect(getLevelTestBand(1000)).toBe(1);
    expect(getLevelTestBand(1001)).toBe(2);
    expect(getLevelTestBand(20000)).toBe(20);
    expect(getLevelTestBand(20001)).toBeNull();
  });

  it("samples deterministically with a fixed seed", () => {
    expect(shuffleWithSeed(["a", "b", "c", "d"], 20261024))
      .toEqual(shuffleWithSeed(["a", "b", "c", "d"], 20261024));
  });

  it("asks the ten fixed landmark bands in order", () => {
    const { questions } = answerAll(makeBank(), () => true);
    expect(questions.slice(0, 10).map((question) => question.band))
      .toEqual(LEVEL_TEST_ANCHOR_BANDS);
  });

  it("creates four distinct choices from the same or an adjacent band and avoids repeated words", () => {
    const { questions } = answerAll(makeBank(), (question, index) => index < 10);
    const promptWords = questions.map((question) => question.word.word.toLowerCase());

    expect(questions).toHaveLength(30);
    expect(new Set(promptWords).size).toBe(30);
    for (const question of questions) {
      expect(question.choices).toHaveLength(4);
      expect(new Set(question.choices.map((choice) => choice.text)).size).toBe(4);
      expect(question.choices.filter((choice) => choice.isCorrect)).toHaveLength(1);
      expect(question.choices.every((choice) => Math.abs(choice.sourceBand - question.band) <= 1)).toBe(true);
    }
  });

  it("prefers same-part-of-speech distractors when enough are available", () => {
    const question = getNextLevelTestQuestion(makeBank(), createLevelTestSession(7));
    const distractors = question.choices.filter((choice) => !choice.isCorrect);
    expect(distractors.every((choice) => choice.sourcePos === question.word.pos)).toBe(true);
    expect(distractors.every((choice) => choice.sourceBand === question.band)).toBe(true);
  });

  it("stops selecting a missed band and harder bands after two consecutive adaptive misses", () => {
    const bank = makeBank();
    let state = createLevelTestSession(91);
    for (let index = 0; index < LEVEL_TEST_ANCHOR_BANDS.length; index += 1) {
      const question = getNextLevelTestQuestion(bank, state);
      state = answerLevelTestQuestion(state, question, question.correctChoiceId);
    }

    const firstMiss = getNextLevelTestQuestion(bank, state);
    expect([19, 20]).toContain(firstMiss.band);
    state = answerLevelTestQuestion(state, firstMiss, LEVEL_TEST_UNKNOWN_ANSWER_ID);
    const secondMiss = getNextLevelTestQuestion(bank, state);
    state = answerLevelTestQuestion(
      state,
      secondMiss,
      secondMiss.choices.find((choice) => !choice.isCorrect).id
    );

    expect(state.cutoffBand).toBe(secondMiss.band);
    expect(getNextLevelTestQuestion(bank, state).band).toBeLessThan(state.cutoffBand);
  });
});

describe("level test estimate and result matching", () => {
  it("estimates close to 20,000 for all correct and zero for all unknown", () => {
    const bank = makeBank();
    const allCorrect = answerAll(bank, () => true).state.answers;
    const allUnknown = answerAll(bank, () => false).state.answers;

    expect(estimateLevelTestWordCount(allCorrect)).toBe(20000);
    expect(estimateLevelTestWordCount(allUnknown)).toBe(0);
  });

  it("subtracts one third of a wrong answer while unknown answers only count in the denominator", () => {
    const rates = getCorrectedLevelTestBandRates([
      { band: 1, isCorrect: true, isUnknown: false },
      { band: 1, isCorrect: false, isUnknown: false },
      { band: 1, isCorrect: false, isUnknown: true }
    ]);
    expect(rates[0]).toBeCloseTo(2 / 9);
  });

  it("interpolates untested bands and forces rates to be non-increasing", () => {
    const rates = makeRatesNonIncreasing([0, 0.25, 0.75, 1]);
    expect(rates).toEqual([0.5, 0.5, 0.5, 0.5]);
    expect(rates.every((rate, index) => index === 0 || rates[index - 1] >= rate)).toBe(true);
  });

  it("reports tied nearest tracks and the next challenge tier", () => {
    const tracks = [
      { id: "elementary", median: 1000 },
      { id: "ielts", median: 5200 },
      { id: "senior-high-5-6", median: 5400 },
      { id: "gept-high-intermediate", median: 5900 },
      { id: "toefl", median: 6800 },
      { id: "gre", median: 14500 }
    ];
    const placement = classifyLevelTestResult(5600, tracks);

    expect(placement.nearestTracks.map((track) => track.id))
      .toEqual(["ielts", "senior-high-5-6"]);
    expect(placement.nextTracks.map((track) => track.id))
      .toEqual(["gept-high-intermediate", "toefl"]);
    expect(classifyLevelTestResult(0, tracks).isBelowLowestTrack).toBe(true);
  });
});

describe("level test history", () => {
  it("keeps only the 20 most recent results", () => {
    const history = Array.from({ length: LEVEL_TEST_HISTORY_LIMIT + 3 }, (_, index) => ({
      id: index
    }));
    const next = appendLevelTestHistory(history, { id: "newest" });

    expect(next).toHaveLength(LEVEL_TEST_HISTORY_LIMIT);
    expect(next[0].id).toBe("newest");
    expect(next.at(-1).id).toBe(18);
  });
});
