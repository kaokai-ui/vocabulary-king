import fs from "node:fs";
import path from "node:path";
import { buildDisambiguatedVocabularyId, buildStableVocabularyId } from "../src/lib/vocabularyIdentity.js";

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

const catalog = readJson(catalogPath);

assert(catalog && typeof catalog === "object", "Catalog must be a JSON object.");
assert(catalog.tracks && typeof catalog.tracks === "object", "Catalog must contain tracks.");

const summaries = [];

for (const track of Object.values(catalog.tracks)) {
  if (!track.available) {
    continue;
  }

  const trackDir = path.join(dataRoot, "tracks", track.id);
  const allWords = [];
  const seenIds = new Set();

  assert(fs.existsSync(trackDir), `Missing track directory: ${trackDir}`);
  assert(Array.isArray(track.chunkFiles) && track.chunkFiles.length > 0, `Track ${track.id} must have chunk files.`);

  for (const chunkFile of track.chunkFiles) {
    const chunkPath = path.join(dataRoot, chunkFile.path.replace(/^data[\\/]/, ""));

    assert(fs.existsSync(chunkPath), `Missing chunk file: ${chunkPath}`);

    const words = readJson(chunkPath);

    assert(Array.isArray(words), `Chunk must contain an array: ${chunkPath}`);
    assert(words.length === chunkFile.wordCount, `Chunk wordCount mismatch in ${chunkPath}`);

    for (const word of words) {
      assert(typeof word.id === "string" && word.id.length > 0, `Word is missing id in ${chunkPath}`);
      assert(typeof word.level === "string" && word.level.length > 0, `Word is missing level in ${chunkPath}`);
      assert(typeof word.word === "string" && word.word.length > 0, `Word is missing word text in ${chunkPath}`);
      assert(typeof word.meaning === "string" && word.meaning.length > 0, `Word is missing meaning in ${chunkPath}`);
      assert(!seenIds.has(word.id), `Duplicate word id ${word.id} in track ${track.id}`);

      seenIds.add(word.id);
      allWords.push(word);
    }
  }

  const groupCounts = new Map();

  for (const word of allWords) {
    const groupKey = `${word.level}\u0000${word.word}\u0000${word.meaning}`;
    groupCounts.set(groupKey, (groupCounts.get(groupKey) ?? 0) + 1);
  }

  for (const word of allWords) {
    const groupKey = `${word.level}\u0000${word.word}\u0000${word.meaning}`;
    const expectedId =
      (groupCounts.get(groupKey) ?? 0) > 1
        ? buildDisambiguatedVocabularyId(word.level, word.word, word.meaning, word.example)
        : buildStableVocabularyId(word.level, word.word, word.meaning);

    assert(word.id === expectedId, `Word id is not stable for ${word.word} in track ${track.id}`);
  }

  assert(allWords.length === track.totalWords, `Track ${track.id} totalWords mismatch.`);
  summaries.push(`${track.id}: ${allWords.length} words verified`);
}

console.log(`Vocabulary data verified:\n- ${summaries.join("\n- ")}`);
