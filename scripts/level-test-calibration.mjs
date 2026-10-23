import fs from "node:fs";
import {
  answerLevelTestQuestion,
  createLevelTestSession,
  getCorrectedLevelTestBandRates,
  estimateLevelTestWordCount,
  getNextLevelTestQuestion,
  LEVEL_TEST_UNKNOWN_ANSWER_ID
} from "../src/lib/levelTest.js";

const data = JSON.parse(fs.readFileSync(new URL("../public/data/level-test.json", import.meta.url), "utf8"));
const K_VALUES = [800, 1500, 3000, 5000, 7000, 10000, 15000];
const RUN_COUNT = 300;
const DEBUG = process.argv.includes("--debug");
let randomState = 7;

function random() {
  randomState = (randomState * 1664525 + 1013904223) >>> 0;
  return randomState / 4294967296;
}

function percentile(sortedValues, fraction) {
  return sortedValues[Math.floor((sortedValues.length - 1) * fraction)];
}

const failures = [];
for (const K of K_VALUES) {
  const estimates = [];
  const samples = [];

  for (let run = 0; run < RUN_COUNT; run += 1) {
    let state = createLevelTestSession(run + 1);
    for (let index = 0; index < 30; index += 1) {
      const question = getNextLevelTestQuestion(data.questions, state);
      if (!question) {
        throw new Error(`K=${K}, run=${run + 1}: test stopped after ${index} questions.`);
      }

      const knowsWord = question.word.rank <= K ? random() < 0.9 : random() < 0.03;
      let choiceId;
      if (knowsWord) {
        choiceId = question.correctChoiceId;
      } else if (random() < 0.7) {
        choiceId = LEVEL_TEST_UNKNOWN_ANSWER_ID;
      } else {
        choiceId = question.choices[Math.floor(random() * question.choices.length)].id;
      }
      state = answerLevelTestQuestion(state, question, choiceId);
    }

    const estimate = estimateLevelTestWordCount(state.answers);
    estimates.push(estimate);
    samples.push({ estimate, answers: state.answers });
  }

  estimates.sort((left, right) => left - right);
  const median = percentile(estimates, 0.5);
  const p10 = percentile(estimates, 0.1);
  const p90 = percentile(estimates, 0.9);
  const expectedCorrectedValue = K * 0.9 + (20000 - K) * 0.03;
  const medianError = Math.abs(median - expectedCorrectedValue) / expectedCorrectedValue;
  const passesMedian = medianError <= 0.2;
  const passesLowLevelP90 = K > 1500 || p90 < 3500;
  const passesHighLevelP10 = K < 7000 || p10 >= expectedCorrectedValue * 0.75;
  const passed = passesMedian && passesLowLevelP90 && passesHighLevelP10;

  console.log(
    `K=${K} (expected ${Math.round(expectedCorrectedValue)}): ` +
    `median ${median} (${(medianError * 100).toFixed(1)}% error), ` +
    `p10 ${p10}, p90 ${p90} ${passed ? "PASS" : "FAIL"}`
  );

  if (!passed) {
    failures.push(K);
  }

  if (DEBUG && K <= 1500) {
    const sortedSamples = samples.slice().sort((left, right) => left.estimate - right.estimate);
    const sample = sortedSamples[Math.floor((sortedSamples.length - 1) * 0.9)];
    const stats = Array.from({ length: 20 }, (_, index) => ({ band: index + 1, count: 0, correct: 0, wrong: 0, unknown: 0 }));
    for (const answer of sample.answers) {
      const band = stats[answer.band - 1];
      band.count += 1;
      band.correct += Number(answer.isCorrect);
      band.unknown += Number(answer.isUnknown);
      band.wrong += Number(!answer.isCorrect && !answer.isUnknown);
    }
    const rates = getCorrectedLevelTestBandRates(sample.answers);
    console.log(`K=${K} p90 sample band stats: ` + JSON.stringify(stats
      .filter((band) => band.count > 0)
      .map((band) => ({ ...band, rate: Number(rates[band.band - 1].toFixed(3)) }))));
  }
}

if (failures.length > 0) {
  console.error(`Calibration criteria failed for K=${failures.join(", ")}.`);
  process.exitCode = 1;
}
