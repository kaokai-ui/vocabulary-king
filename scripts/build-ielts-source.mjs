import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getVocabularyDataRepoPath } from "./export-game-vocabulary.mjs";
import { createCanonicalSensedRow } from "./vocabulary-senses.mjs";

export const IELTS_EXPECTED_WORD_COUNT = 5594;

const IELTS_TASK_DIRECTORY = "docs/tasks/ielts-merge-20261022";
const PART_FILE_PATTERN = /^part-(\d{2})\.jsonl$/u;

function getPartFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const files = fs.readdirSync(directory)
    .map((name) => ({ name, match: PART_FILE_PATTERN.exec(name) }))
    .filter(({ match }) => match)
    .sort((left, right) => Number(left.match[1]) - Number(right.match[1]));

  for (const [index, { match }] of files.entries()) {
    if (Number(match[1]) !== index + 1) {
      throw new Error(`Part files in ${directory} must be numbered consecutively from part-01.jsonl.`);
    }
  }

  return files.map(({ name }) => name);
}

function readJsonlPart(filePath) {
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid JSON in ${filePath}:${index + 1}: ${error.message}`);
      }
    });
}

function readDirectoryParts(directory, partFiles) {
  return partFiles.flatMap((fileName) => {
    const filePath = path.join(directory, fileName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing required part file: ${filePath}`);
    }
    return readJsonlPart(filePath);
  });
}

function validateExampleEntries(entries, expectedWordCount) {
  if (entries.length !== expectedWordCount) {
    throw new Error(`Expected ${expectedWordCount} IELTS words, found ${entries.length}.`);
  }

  const words = new Set();
  for (const [index, entry] of entries.entries()) {
    const word = String(entry?.word ?? "").trim();
    if (!word || !String(entry?.meaning ?? "").trim() || !String(entry?.sense ?? "").trim()
      || !String(entry?.example_en ?? "").trim() || !String(entry?.example_zh ?? "").trim()) {
      throw new Error(`IELTS example record ${index + 1} has a missing word, meaning, sense, or example.`);
    }

    const key = word.toLocaleLowerCase();
    if (words.has(key)) {
      throw new Error(`Duplicate IELTS headword: ${word}.`);
    }
    words.add(key);
  }
}

function loadCompletedLongExamples(taskDirectory, partFiles, exampleByWord) {
  const longDirectory = path.join(taskDirectory, "examples-long");
  if (!fs.existsSync(path.join(longDirectory, "DONE"))) {
    return new Map();
  }

  const partsDirectory = path.join(taskDirectory, "parts");
  const inputPartFiles = getPartFiles(partsDirectory);
  if (inputPartFiles.length !== partFiles.length || inputPartFiles.some((fileName, index) => fileName !== partFiles[index])) {
    throw new Error("The parts/ and examples/ part files must match before using examples-long/.");
  }

  const starredWords = new Set();
  for (const part of readDirectoryParts(partsDirectory, inputPartFiles)) {
    if (part?.starred === true) {
      const word = String(part.word ?? "").trim();
      if (!word || starredWords.has(word.toLocaleLowerCase())) {
        throw new Error(`Invalid or duplicate starred IELTS headword: ${word || "(empty)"}.`);
      }
      starredWords.add(word.toLocaleLowerCase());
    }
  }

  const longPartFiles = getPartFiles(longDirectory);
  if (longPartFiles.length !== partFiles.length || longPartFiles.some((fileName, index) => fileName !== partFiles[index])) {
    throw new Error("The examples-long/ part files must match examples/ before long sentences can be used.");
  }

  const longExamples = new Map();
  for (const entry of readDirectoryParts(longDirectory, longPartFiles)) {
    const word = String(entry?.word ?? "").trim();
    const key = word.toLocaleLowerCase();
    const original = exampleByWord.get(key);
    if (!word || !original || !starredWords.has(key)) {
      throw new Error(`Unexpected examples-long/ headword: ${word || "(empty)"}.`);
    }
    if (longExamples.has(key)) {
      throw new Error(`Duplicate examples-long/ headword: ${word}.`);
    }
    if (String(entry.sense ?? "").trim() !== String(original.sense).trim()) {
      throw new Error(`The examples-long/ sense differs from examples/ for ${word}.`);
    }
    if (!String(entry.example_en ?? "").trim() || !String(entry.example_zh ?? "").trim()) {
      throw new Error(`The examples-long/ example is incomplete for ${word}.`);
    }
    longExamples.set(key, entry);
  }

  const missingLongExamples = [...starredWords].filter((word) => !longExamples.has(word));
  if (missingLongExamples.length) {
    throw new Error(`examples-long/DONE is present but ${missingLongExamples.length} starred words are missing (first: ${missingLongExamples[0]}).`);
  }

  return longExamples;
}

export function buildIeltsSourceRecords({ root = process.cwd(), expectedWordCount = IELTS_EXPECTED_WORD_COUNT } = {}) {
  const taskDirectory = path.join(root, IELTS_TASK_DIRECTORY);
  const examplesDirectory = path.join(taskDirectory, "examples");
  const partFiles = getPartFiles(examplesDirectory);
  if (!partFiles.length) {
    throw new Error(`No IELTS example part files found in ${examplesDirectory}.`);
  }

  const entries = readDirectoryParts(examplesDirectory, partFiles);
  validateExampleEntries(entries, expectedWordCount);
  const exampleByWord = new Map(entries.map((entry) => [String(entry.word).trim().toLocaleLowerCase(), entry]));
  const longExamples = loadCompletedLongExamples(taskDirectory, partFiles, exampleByWord);

  const records = entries.map((entry) => {
    const longer = longExamples.get(String(entry.word).trim().toLocaleLowerCase());
    return createCanonicalSensedRow({
      track: "ielts",
      level: "IELTS",
      word: String(entry.word).trim(),
      pos: "",
      kk: "",
      meaning_zh: String(entry.meaning).trim(),
      example_en: String(longer?.example_en ?? entry.example_en).trim(),
      example_zh: String(longer?.example_zh ?? entry.example_zh).trim(),
      meaning_ja: "",
      example_ja: "",
      meaning_ko: "",
      example_ko: "",
      example_format: { before: " (", after: ")" }
    });
  });

  return {
    records,
    count: records.length,
    usedLongSentences: longExamples.size > 0,
    longSentenceCount: longExamples.size
  };
}

export function buildIeltsSourceData({
  root = process.cwd(),
  dataRepoRoot = getVocabularyDataRepoPath(),
  expectedWordCount = IELTS_EXPECTED_WORD_COUNT
} = {}) {
  const resolvedDataRepoRoot = path.resolve(dataRepoRoot);
  if (!fs.existsSync(resolvedDataRepoRoot) || !fs.statSync(resolvedDataRepoRoot).isDirectory()) {
    throw new Error(
      `Vocabulary source repo not found at ${resolvedDataRepoRoot}; IELTS updates require the JSONL repo. ` +
      "Set VOCABULARY_DATA_REPO to the local vocabulary data repo."
    );
  }
  const outputPath = path.join(resolvedDataRepoRoot, "data", "ielts.jsonl");
  if (!fs.existsSync(outputPath)) {
    throw new Error(`Missing IELTS vocabulary source JSONL: ${outputPath}`);
  }

  const result = buildIeltsSourceRecords({ root, expectedWordCount });
  fs.writeFileSync(
    outputPath,
    result.records.map((record) => JSON.stringify(record)).join("\n") + (result.records.length ? "\n" : ""),
    "utf8"
  );

  return {
    count: result.count,
    outputPath,
    usedLongSentences: result.usedLongSentences,
    longSentenceCount: result.longSentenceCount
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = buildIeltsSourceData();
    console.log(`Updated IELTS source: ${result.count} words; ${result.longSentenceCount} long examples used; ${result.outputPath}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
