import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { TRACK_DEFINITIONS } from "./vocabulary-source-definitions.mjs";
import { buildTrackExportRecords } from "./vocabulary-data-utils.mjs";

const DATA_ROOT = path.resolve("public/data");
const TRACKS_ROOT = path.join(DATA_ROOT, "tracks");
const CHUNK_SIZE = 1000;
const DEFAULT_DATA_REPO = "D:\\Game\\VocabularyKing-data";

export function getVocabularyDataRepoPath(env = process.env) {
  return path.resolve(env.VOCABULARY_DATA_REPO || DEFAULT_DATA_REPO);
}

function readTrackSourceRows(dataRepoRoot, trackId) {
  const filePath = path.join(dataRepoRoot, "data", `${trackId}.jsonl`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing vocabulary source file: ${filePath}`);
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/u);
  const rows = [];

  lines.forEach((line, index) => {
    if (!line.trim()) {
      return;
    }

    let record;
    try {
      record = JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid JSON in ${filePath}:${index + 1}: ${error instanceof Error ? error.message : error}`);
    }

    if (record.track !== trackId) {
      throw new Error(`Unexpected track '${record.track}' in ${filePath}:${index + 1}; expected '${trackId}'.`);
    }
    if (!String(record.level ?? "").trim() || !String(record.word ?? "").trim() || !String(record.meaning_zh ?? "").trim()) {
      throw new Error(`Missing level, word, or meaning_zh in ${filePath}:${index + 1}.`);
    }

    rows.push(record);
  });

  return rows;
}

function chunkItems(items, chunkSize) {
  const chunks = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function contentHash(value) {
  const json = JSON.stringify(value);
  return createHash("sha256").update(json).digest("hex").slice(0, 12);
}

function createCatalogTrack(definition, chunkFiles = [], totalWords = 0) {
  return {
    id: definition.id,
    available: definition.available,
    title: definition.title,
    sourceWorkbookKey: definition.sourceWorkbookKey,
    totalWords,
    chunkSize: CHUNK_SIZE,
    chunkFiles
  };
}

function prepareTracks(dataRepoRoot) {
  const prepared = new Map();

  for (const definition of TRACK_DEFINITIONS) {
    if (!definition.available) {
      prepared.set(definition.id, []);
      continue;
    }

    const sourceRows = readTrackSourceRows(dataRepoRoot, definition.id);
    const records = buildTrackExportRecords(definition.id, sourceRows).map(({ level, word, meaning, example, id }) => ({
      level,
      word,
      meaning,
      example,
      id
    }));

    if (records.length === 0) {
      throw new Error(`Vocabulary source file for '${definition.id}' contains no exportable entries.`);
    }

    prepared.set(definition.id, records);
  }

  return prepared;
}

export function exportGameVocabulary({ dataRepoRoot = getVocabularyDataRepoPath(), dataRoot = DATA_ROOT } = {}) {
  const resolvedDataRepoRoot = path.resolve(dataRepoRoot);
  const resolvedDataRoot = path.resolve(dataRoot);

  if (!fs.existsSync(resolvedDataRepoRoot)) {
    console.log(
      `Vocabulary source repo not found at ${resolvedDataRepoRoot}; keeping committed public/data. ` +
        "Set VOCABULARY_DATA_REPO to the local vocabulary data repo to refresh it."
    );
    return { skipped: true, dataRepoRoot: resolvedDataRepoRoot };
  }

  if (!fs.statSync(resolvedDataRepoRoot).isDirectory()) {
    throw new Error(`Vocabulary source path is not a directory: ${resolvedDataRepoRoot}`);
  }

  // Read and validate every track before touching public/data so an incomplete
  // local source repo cannot leave a partially refreshed public bundle.
  const preparedTracks = prepareTracks(resolvedDataRepoRoot);
  const tracksRoot = path.join(resolvedDataRoot, "tracks");
  const catalogTracks = {};
  const summaries = [];

  fs.mkdirSync(resolvedDataRoot, { recursive: true });
  fs.rmSync(path.join(resolvedDataRoot, "vocabulary.json"), { force: true });

  for (const definition of TRACK_DEFINITIONS) {
    if (definition.available) {
      const vocabulary = preparedTracks.get(definition.id) ?? [];
      const chunks = chunkItems(vocabulary, CHUNK_SIZE);
      const trackOutputDir = path.join(tracksRoot, definition.id);

      fs.rmSync(trackOutputDir, { recursive: true, force: true });

      const chunkFiles = chunks.map((chunk, index) => {
        const fileName = `chunk-${String(index + 1).padStart(3, "0")}.json`;
        const relativePath = `data/tracks/${definition.id}/${fileName}`;

        writeJson(path.join(trackOutputDir, fileName), chunk);

        return {
          id: `${definition.id}-chunk-${index + 1}`,
          path: relativePath,
          wordCount: chunk.length
        };
      });

      catalogTracks[definition.id] = createCatalogTrack(definition, chunkFiles, vocabulary.length);
      summaries.push(`${definition.id}: ${vocabulary.length} words, ${chunkFiles.length} chunk files`);
      continue;
    }

    fs.rmSync(path.join(tracksRoot, definition.id), { recursive: true, force: true });
    catalogTracks[definition.id] = createCatalogTrack(definition);
  }

  const catalogPayload = { tracks: catalogTracks };
  writeJson(path.join(resolvedDataRoot, "catalog.json"), {
    generatedAt: contentHash(catalogPayload),
    tracks: catalogTracks
  });

  console.log(`Exported tracks:\n- ${summaries.join("\n- ")}`);
  return { skipped: false, dataRepoRoot: resolvedDataRepoRoot, summaries };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    exportGameVocabulary();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
