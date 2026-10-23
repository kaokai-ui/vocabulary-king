import fs from "node:fs";
import path from "node:path";
import {
  buildTrackExportRecords
} from "./vocabulary-data-utils.mjs";
import { getVocabularyDataRepoPath } from "./export-game-vocabulary.mjs";
import { TRACK_DEFINITIONS } from "./vocabulary-source-definitions.mjs";
import { readUidAliasData, validateVocabularyUidState } from "./vocabulary-uids.mjs";
import { assertNoPublicLocaleArtifacts } from "./vocabulary-locale-safety.mjs";
import { validateSenseRow } from "./vocabulary-senses.mjs";

const dataRoot = path.resolve("public/data");
const catalogPath = path.join(dataRoot, "catalog.json");
const levelTestPath = path.join(dataRoot, "level-test.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function verifyLevelTestData() {
  assert(fs.existsSync(levelTestPath), "Missing level test data: " + levelTestPath);
  assert(fs.statSync(levelTestPath).size <= 200 * 1024, "Level test data must be at most 200 KB.");

  const data = readJson(levelTestPath);
  assert(data && typeof data === "object" && !Array.isArray(data), "Level test data must be a JSON object.");
  assert(data.version === 1, "Level test data must use version 1.");
  assert(data.bandSize === 1000 && data.bandCount === 20, "Level test data must define twenty 1,000-word bands.");
  assert(Number.isInteger(data.sampleSeed), "Level test data must include its fixed sample seed.");
  assert(Number.isInteger(data.maxWordsPerBand) && data.maxWordsPerBand > 0 && data.maxWordsPerBand <= 60,
    "Level test sample size must be between 1 and 60 words per band.");

  const expectedTrackIds = TRACK_DEFINITIONS.map((definition) => definition.id);
  assert(Array.isArray(data.tracks) && data.tracks.length === expectedTrackIds.length,
    "Level test data must include all 13 vocabulary tracks.");
  assert(data.tracks.map((track) => track.id).join(",") === expectedTrackIds.join(","),
    "Level test track ids or order do not match the vocabulary catalog.");
  for (const track of data.tracks) {
    assert(Number.isFinite(track.median) && track.median >= 1 && track.median <= 31000,
      "Invalid 31K median for level test track " + track.id + ".");
  }

  const examTrackIds = new Set(["toeic", "toeic-advanced", "toefl", "ielts", "gre", "gmat"]);
  const questionKeys = ["meaning", "pos", "rank", "track", "uid", "word"];
  assert(Array.isArray(data.questions) && data.questions.length > 0, "Level test data must contain questions.");
  const seenWords = new Set();
  const countsByBand = Array(data.bandCount + 1).fill(0);

  for (const [index, question] of data.questions.entries()) {
    assert(question && typeof question === "object" && !Array.isArray(question),
      "Level test question " + (index + 1) + " must be an object.");
    assert(Object.keys(question).sort().join(",") === questionKeys.join(","),
      "Level test question " + (index + 1) + " has unexpected fields.");
    assert(typeof question.uid === "string" && question.uid.length > 0,
      "Level test question " + (index + 1) + " is missing its uid.");
    assert(examTrackIds.has(question.track), "Invalid source track in level test question " + (index + 1) + ".");
    assert(typeof question.word === "string" && question.word.length > 0 && !/\s/u.test(question.word),
      "Level test question " + (index + 1) + " must be a single word.");
    assert(Number.isInteger(question.rank) && question.rank >= 1 && question.rank <= 20000,
      "Level test question " + (index + 1) + " has an invalid 31K rank.");
    assert(typeof question.pos === "string", "Level test question " + (index + 1) + " is missing its part of speech.");
    assert(typeof question.meaning === "string" && question.meaning.trim().length > 0,
      "Level test question " + (index + 1) + " is missing its Chinese meaning.");

    const wordKey = question.word.normalize("NFKC").trim().toLowerCase();
    assert(!seenWords.has(wordKey), "Duplicate level test question word: " + question.word + ".");
    seenWords.add(wordKey);
    countsByBand[Math.ceil(question.rank / data.bandSize)] += 1;
  }

  for (let band = 1; band <= data.bandCount; band += 1) {
    assert(countsByBand[band] <= data.maxWordsPerBand,
      "Level test band " + band + " exceeds its " + data.maxWordsPerBand + "-word sample limit.");
  }

  console.log(
    "Level test data verified: " + data.questions.length + " words across " + data.bandCount + " bands (" +
    fs.statSync(levelTestPath).size + " bytes)."
  );
}

function readSourceRows(dataRepoRoot) {
  const sourceRowsByTrack = new Map();
  for (const definition of TRACK_DEFINITIONS.filter((track) => track.available)) {
    const filePath = path.join(dataRepoRoot, "data", `${definition.id}.jsonl`);
    assert(fs.existsSync(filePath), `Missing vocabulary source file: ${filePath}`);
    const rows = fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/u)
      .filter((line) => line.trim())
      .map((line, index) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          throw new Error(`Invalid JSON in ${filePath}:${index + 1}: ${error instanceof Error ? error.message : error}`);
        }
      });
    for (const [index, row] of rows.entries()) {
      assert(row.track === definition.id, `Unexpected track '${row.track}' in ${filePath}:${index + 1}.`);
    }
    sourceRowsByTrack.set(definition.id, rows);
  }
  return sourceRowsByTrack;
}

function readPublicTrackWords(track) {
  const words = [];
  for (const chunkFile of track.chunkFiles) {
    const chunkPath = path.join(dataRoot, chunkFile.path.replace(/^data[\\/]/u, ""));
    assert(fs.existsSync(chunkPath), `Missing chunk file: ${chunkPath}`);
    const chunk = readJson(chunkPath);
    assert(Array.isArray(chunk), `Chunk must contain an array: ${chunkPath}`);
    assert(chunk.length === chunkFile.wordCount, `Chunk wordCount mismatch in ${chunkPath}`);
    words.push(...chunk);
  }
  return words;
}

const catalog = readJson(catalogPath);
assert(catalog && typeof catalog === "object", "Catalog must be a JSON object.");
assert(catalog.tracks && typeof catalog.tracks === "object", "Catalog must contain tracks.");
assertNoPublicLocaleArtifacts(dataRoot, catalog);
verifyLevelTestData();

const sourceRepoRoot = getVocabularyDataRepoPath();
let sourceRowsByTrack;
let sourceRecordsByTrack;
// CI has no private data repo; verify the committed public/data alone there.
if (fs.existsSync(sourceRepoRoot) && fs.statSync(sourceRepoRoot).isDirectory()) {
  sourceRowsByTrack = readSourceRows(sourceRepoRoot);
  for (const [trackId, rows] of sourceRowsByTrack) {
    for (const [index, row] of rows.entries()) {
      const senseErrors = validateSenseRow(row, `${trackId} row ${index + 1} uid ${row.uid ?? "(missing uid)"}`);
      assert(senseErrors.length === 0, senseErrors.join("; "));
    }
  }
  validateVocabularyUidState({ sourceRowsByTrack, aliasData: readUidAliasData(sourceRepoRoot) });
  sourceRecordsByTrack = new Map(
    [...sourceRowsByTrack].map(([trackId, rows]) => [trackId, buildTrackExportRecords(trackId, rows)])
  );
} else {
  console.log(`Vocabulary source repo not found at ${sourceRepoRoot}; checking committed public/data only.`);
}

const summaries = [];
for (const definition of TRACK_DEFINITIONS) {
  const track = catalog.tracks[definition.id];
  assert(track, `Catalog is missing track ${definition.id}.`);
  if (!track.available) {
    continue;
  }

  const trackDir = path.join(dataRoot, "tracks", track.id);
  assert(fs.existsSync(trackDir), `Missing track directory: ${trackDir}`);
  assert(Array.isArray(track.chunkFiles) && track.chunkFiles.length > 0, `Track ${track.id} must have chunk files.`);
  const allWords = readPublicTrackWords(track);
  const seenIds = new Set();

  for (const word of allWords) {
    assert(typeof word.id === "string" && word.id.length > 0, `Word is missing id in track ${track.id}.`);
    assert(typeof word.level === "string" && word.level.length > 0, `Word is missing level in track ${track.id}.`);
    assert(typeof word.word === "string" && word.word.length > 0, `Word is missing word text in track ${track.id}.`);
    assert(typeof word.meaning === "string" && word.meaning.length > 0, `Word is missing meaning in track ${track.id}.`);
    assert(!seenIds.has(word.id), `Duplicate word id ${word.id} in track ${track.id}.`);
    seenIds.add(word.id);
  }

  if (sourceRecordsByTrack) {
    const sourceRecords = sourceRecordsByTrack.get(track.id) ?? [];
    assert(sourceRecords.length === allWords.length, `Public/source row count mismatch for track ${track.id}.`);
    for (const [index, word] of allWords.entries()) {
      const source = sourceRecords[index];
      assert(word.id === source.uid, `Public id does not match source uid for ${track.id} row ${index + 1}.`);
      assert(word.level === source.level && word.word === source.word && word.meaning === source.meaning && word.example === source.example,
        `Public vocabulary content does not match source for ${track.id} row ${index + 1}.`);
    }
  }

  assert(allWords.length === track.totalWords, `Track ${track.id} totalWords mismatch.`);
  summaries.push(`${track.id}: ${allWords.length} words verified`);
}

console.log(`Vocabulary data verified:\n- ${summaries.join("\n- ")}`);
