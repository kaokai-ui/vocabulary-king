import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getVocabularyDataRepoPath } from "./export-game-vocabulary.mjs";

export const LEVEL_TEST_TRACK_IDS = [
  "elementary",
  "junior-high",
  "senior-high",
  "senior-high-5-6",
  "gept-elementary",
  "gept-intermediate",
  "gept-high-intermediate",
  "toeic",
  "toeic-advanced",
  "toefl",
  "ielts",
  "gre",
  "gmat"
];

export const LEVEL_TEST_EXAM_TRACK_PRIORITY = [
  "toeic",
  "toeic-advanced",
  "ielts",
  "toefl",
  "gre",
  "gmat"
];

export const LEVEL_TEST_SAMPLE_SEED = 20261024;
export const LEVEL_TEST_MAX_WORDS_PER_BAND = 60;
export const LEVEL_TEST_MAX_BYTES = 200 * 1024;
export const LEVEL_TEST_BAND_SIZE = 1000;
export const LEVEL_TEST_BAND_COUNT = 20;

function parseFirstCsvCell(line) {
  if (line.startsWith('"')) {
    let value = "";
    for (let index = 1; index < line.length; index += 1) {
      const character = line[index];
      if (character !== '"') {
        value += character;
      } else if (line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        break;
      }
    }
    return value;
  }

  const commaIndex = line.indexOf(",");
  return commaIndex === -1 ? line : line.slice(0, commaIndex);
}

export function buildFrequencyRanks(csvText) {
  const ranks = new Map();
  const lines = String(csvText).replace(/^\uFEFF/u, "").split(/\r?\n/u);

  for (const line of lines.slice(1)) {
    const lemma = parseFirstCsvCell(line).trim().toLowerCase();
    if (lemma && !ranks.has(lemma)) {
      // Match the established skeleton: blank and repeated lemmas do not use a rank.
      ranks.set(lemma, ranks.size + 1);
    }
  }

  return ranks;
}

function getFrequencyRank(word, ranks) {
  const normalized = String(word ?? "").trim().toLowerCase();
  const variants = [normalized, ...normalized.split("/").map((part) => part.trim())]
    .filter((variant, index, all) => variant && all.indexOf(variant) === index);
  const matches = variants.map((variant) => ranks.get(variant)).filter(Number.isFinite);
  return matches.length ? Math.min(...matches) : null;
}

function readJsonl(dataRepoRoot, trackId) {
  const filePath = path.join(dataRepoRoot, "data", trackId + ".jsonl");
  if (!fs.existsSync(filePath)) {
    throw new Error("Missing vocabulary source file: " + filePath);
  }

  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(
          "Invalid JSON in " + filePath + ":" + (index + 1) + ": " +
          (error instanceof Error ? error.message : error)
        );
      }
    });
}

function isPhrase(row) {
  const level = String(row.level ?? "").toLowerCase();
  return level.includes("片語") || level.includes("phrase");
}

function isSingleRankedWord(row, ranks) {
  const word = String(row.word ?? "").trim();
  return Boolean(word) && !/\s/u.test(word) && !isPhrase(row) && getFrequencyRank(word, ranks) !== null;
}

function getFirstChineseMeaning(row) {
  const meaning = row.senses?.[0]?.meaning_zh;
  return typeof meaning === "string" ? meaning.trim() : "";
}

function normalizeWord(word) {
  return String(word ?? "").normalize("NFKC").trim().toLowerCase();
}

function seededShuffle(items, seed) {
  let state = seed >>> 0;
  const shuffled = [...items];
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function median(values) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function buildTrackMedians(rowsByTrack, ranks) {
  return LEVEL_TEST_TRACK_IDS.map((trackId) => {
    const seenWords = new Set();
    const rankedWords = [];

    for (const row of rowsByTrack.get(trackId) ?? []) {
      if (!isSingleRankedWord(row, ranks)) {
        continue;
      }

      const wordKey = normalizeWord(row.word);
      if (seenWords.has(wordKey)) {
        continue;
      }
      seenWords.add(wordKey);
      rankedWords.push(getFrequencyRank(row.word, ranks));
    }

    return { id: trackId, median: median(rankedWords) };
  });
}

function sampleQuestions(candidates, perBandLimit, seed) {
  const sampled = [];

  for (let band = 1; band <= LEVEL_TEST_BAND_COUNT; band += 1) {
    const bandCandidates = candidates.filter(
      (candidate) => Math.ceil(candidate.rank / LEVEL_TEST_BAND_SIZE) === band
    );
    sampled.push(
      ...seededShuffle(bandCandidates, seed + band * 0x9e3779b9)
        .slice(0, perBandLimit)
    );
  }

  return sampled.sort((left, right) => left.rank - right.rank || left.word.localeCompare(right.word));
}

export function buildLevelTestPayload(dataRepoRoot, seed = LEVEL_TEST_SAMPLE_SEED) {
  const frequencyPath = path.join(dataRepoRoot, "sources", "open-lists", "ngsl31k.csv");
  if (!fs.existsSync(frequencyPath)) {
    throw new Error("Missing NGSL 31K frequency list: " + frequencyPath);
  }

  const ranks = buildFrequencyRanks(fs.readFileSync(frequencyPath, "utf8"));
  const rowsByTrack = new Map(
    LEVEL_TEST_TRACK_IDS.map((trackId) => [trackId, readJsonl(dataRepoRoot, trackId)])
  );
  const candidates = [];
  const seenWords = new Set();

  for (const trackId of LEVEL_TEST_EXAM_TRACK_PRIORITY) {
    for (const row of rowsByTrack.get(trackId) ?? []) {
      if (!isSingleRankedWord(row, ranks)) {
        continue;
      }

      const rank = getFrequencyRank(row.word, ranks);
      if (rank > LEVEL_TEST_BAND_SIZE * LEVEL_TEST_BAND_COUNT) {
        continue;
      }

      const meaning = getFirstChineseMeaning(row);
      if (!row.uid || !meaning) {
        continue;
      }

      const wordKey = normalizeWord(row.word);
      if (seenWords.has(wordKey)) {
        continue;
      }
      seenWords.add(wordKey);
      candidates.push({
        uid: String(row.uid),
        track: trackId,
        word: String(row.word).trim(),
        rank,
        pos: String(row.pos ?? row.senses?.[0]?.pos ?? "").trim(),
        meaning
      });
    }
  }

  const tracks = buildTrackMedians(rowsByTrack, ranks);
  let perBandLimit = LEVEL_TEST_MAX_WORDS_PER_BAND;
  let payload;
  let outputBytes = 0;

  while (perBandLimit > 0) {
    payload = {
      version: 1,
      bandSize: LEVEL_TEST_BAND_SIZE,
      bandCount: LEVEL_TEST_BAND_COUNT,
      sampleSeed: seed >>> 0,
      maxWordsPerBand: perBandLimit,
      tracks,
      questions: sampleQuestions(candidates, perBandLimit, seed)
    };
    outputBytes = Buffer.byteLength(JSON.stringify(payload) + "\n", "utf8");
    if (outputBytes <= LEVEL_TEST_MAX_BYTES) {
      return { ...payload, outputBytes };
    }
    perBandLimit -= 1;
  }

  throw new Error("Could not fit the level test data under 200 KB.");
}

export function parseDataDirArgument(args, env = process.env) {
  let dataDir = getVocabularyDataRepoPath(env);

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--data-dir") {
      if (!args[index + 1]) {
        throw new Error("--data-dir requires a path.");
      }
      dataDir = args[index + 1];
      index += 1;
    } else if (argument.startsWith("--data-dir=")) {
      dataDir = argument.slice("--data-dir=".length);
    } else {
      throw new Error("Unknown argument: " + argument);
    }
  }

  return path.resolve(dataDir);
}

export function buildLevelTestFile(dataRepoRoot, outputPath = path.resolve("public/data/level-test.json")) {
  if (!fs.existsSync(dataRepoRoot) || !fs.statSync(dataRepoRoot).isDirectory()) {
    console.log(
      "Vocabulary source repo not found at " + dataRepoRoot +
      "; keeping committed public/data/level-test.json."
    );
    return { skipped: true, dataRepoRoot };
  }

  const payload = buildLevelTestPayload(dataRepoRoot);
  delete payload.outputBytes;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload) + "\n", "utf8");
  console.log(
    "Built public/data/level-test.json: " + payload.questions.length +
    " words, max " + payload.maxWordsPerBand + " per band, " +
    Buffer.byteLength(JSON.stringify(payload) + "\n", "utf8") + " bytes."
  );
  return { skipped: false, outputPath, payload };
}

export function runBuildLevelTest(args = process.argv.slice(2), env = process.env) {
  return buildLevelTestFile(parseDataDirArgument(args, env));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    runBuildLevelTest();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
