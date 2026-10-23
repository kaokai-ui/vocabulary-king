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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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

const sourceRepoRoot = getVocabularyDataRepoPath();
let sourceRowsByTrack;
let sourceRecordsByTrack;
assert(fs.existsSync(sourceRepoRoot) && fs.statSync(sourceRepoRoot).isDirectory(), `Vocabulary source repo not found at ${sourceRepoRoot}.`);
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
