import fs from "node:fs";
import path from "node:path";
import xlsx from "xlsx";
import { buildStableVocabularyId } from "../src/lib/vocabularyIdentity.js";

const DATA_ROOT = path.resolve("public/data");
const TRACKS_ROOT = path.join(DATA_ROOT, "tracks");
const CHUNK_SIZE = 1000;
const PLACEHOLDER_TRACKS = [
  { id: "toeic", title: "TOEIC" },
  { id: "toefl", title: "TOEFL" },
  { id: "ielts", title: "IELTS" },
  { id: "gept", title: "GEPT" }
];
const TRACK_DEFINITIONS = [
  {
    id: "junior-high",
    title: "Junior High",
    sourceWorkbookKey: "level-1-level-2-workbook",
    workbookPattern: /L1L2\.xlsx$/i,
    sheets: ["Level 1", "Level 2"],
    available: true
  },
  {
    id: "senior-high",
    title: "Senior High (Level 3-4)",
    sourceWorkbookKey: "level-3-level-4-workbook",
    workbookPattern: /L3L6\.xlsx$/i,
    sheets: ["Level 3", "Level 4"],
    available: true
  },
  {
    id: "senior-high-5-6",
    title: "Senior High (Level 5-6)",
    sourceWorkbookKey: "level-5-level-6-workbook",
    workbookPattern: /L3L6\.xlsx$/i,
    sheets: ["Level 5", "Level 6"],
    available: false
  }
];

function findWorkbookPath(workbookPattern) {
  const workbookName = fs
    .readdirSync(process.cwd())
    .find((fileName) => workbookPattern.test(fileName) && !/backup|before/i.test(fileName));

  if (!workbookName) {
    throw new Error(`Could not find a workbook matching ${workbookPattern} in the project root.`);
  }

  return path.resolve(workbookName);
}

function readVocabularyRows(workbookPath, sheetNames) {
  const workbook = xlsx.readFile(workbookPath);
  const vocabulary = [];

  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
      throw new Error(`Missing worksheet: ${sheetName}`);
    }

    const rows = xlsx.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: false
    });

    rows.slice(1).forEach((row) => {
      const word = String(row[1] ?? "").trim();
      const meaning = String(row[2] ?? "").trim();
      const example = String(row[4] || row[3] || "").trim();

      if (!word || !meaning) {
        return;
      }

      const level = sheetName.replace("Level ", "L");

      vocabulary.push({
        id: buildStableVocabularyId(level, word, meaning),
        level,
        word,
        meaning,
        example
      });
    });
  }

  return vocabulary;
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

function buildTrack(definition) {
  const workbookPath = findWorkbookPath(definition.workbookPattern);
  const vocabulary = readVocabularyRows(workbookPath, definition.sheets);
  const chunks = chunkItems(vocabulary, CHUNK_SIZE);
  const trackOutputDir = path.join(TRACKS_ROOT, definition.id);

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

  return {
    catalogTrack: createCatalogTrack(definition, chunkFiles, vocabulary.length),
    summary: `${definition.id}: ${vocabulary.length} words, ${chunkFiles.length} chunk files`
  };
}

const catalogTracks = {};
const summaries = [];

fs.rmSync(path.join(DATA_ROOT, "vocabulary.json"), { force: true });

for (const definition of TRACK_DEFINITIONS) {
  if (definition.available) {
    const { catalogTrack, summary } = buildTrack(definition);

    catalogTracks[definition.id] = catalogTrack;
    summaries.push(summary);
    continue;
  }

  fs.rmSync(path.join(TRACKS_ROOT, definition.id), { recursive: true, force: true });
  catalogTracks[definition.id] = createCatalogTrack(definition);
}

for (const definition of PLACEHOLDER_TRACKS) {
  catalogTracks[definition.id] = {
    id: definition.id,
    available: false,
    title: definition.title,
    totalWords: 0,
    chunkSize: CHUNK_SIZE,
    chunkFiles: []
  };
}

writeJson(path.join(DATA_ROOT, "catalog.json"), {
  generatedAt: new Date().toISOString(),
  tracks: catalogTracks
});

console.log(`Exported tracks:\n- ${summaries.join("\n- ")}`);
