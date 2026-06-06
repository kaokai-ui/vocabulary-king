import fs from "node:fs";
import path from "node:path";
import xlsx from "xlsx";

const DATA_ROOT = path.resolve("public/data");
const TRACK_ID = "junior-high";
const TRACK_OUTPUT_DIR = path.join(DATA_ROOT, "tracks", TRACK_ID);
const CHUNK_SIZE = 1000;
const TARGET_SHEETS = ["Level 1", "Level 2"];

function findWorkbookPath() {
  const workbookName = fs
    .readdirSync(process.cwd())
    .find((fileName) => /L1L2\.xlsx$/i.test(fileName) && !/backup|before/i.test(fileName));

  if (!workbookName) {
    throw new Error("Could not find the Level 1 / Level 2 workbook in the project root.");
  }

  return path.resolve(workbookName);
}

function toSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function readVocabularyRows(workbookPath) {
  const workbook = xlsx.readFile(workbookPath);
  const vocabulary = [];

  for (const sheetName of TARGET_SHEETS) {
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
      throw new Error(`Missing worksheet: ${sheetName}`);
    }

    const rows = xlsx.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: false
    });

    rows.slice(1).forEach((row, index) => {
      const word = String(row[1] ?? "").trim();
      const meaning = String(row[2] ?? "").trim();
      const example = String(row[4] || row[3] || "").trim();

      if (!word || !meaning) {
        return;
      }

      const level = sheetName.replace("Level ", "L");
      const slug = toSlug(word);

      vocabulary.push({
        id: `${level}-${index + 1}-${slug || "word"}`,
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

const workbookPath = findWorkbookPath();
const vocabulary = readVocabularyRows(workbookPath);
const chunks = chunkItems(vocabulary, CHUNK_SIZE);

fs.rmSync(TRACK_OUTPUT_DIR, { recursive: true, force: true });
fs.rmSync(path.join(DATA_ROOT, "vocabulary.json"), { force: true });

const chunkFiles = chunks.map((chunk, index) => {
  const fileName = `chunk-${String(index + 1).padStart(3, "0")}.json`;
  const relativePath = `data/tracks/${TRACK_ID}/${fileName}`;
  writeJson(path.join(TRACK_OUTPUT_DIR, fileName), chunk);

  return {
    id: `${TRACK_ID}-chunk-${index + 1}`,
    path: relativePath,
    wordCount: chunk.length
  };
});

const catalog = {
  generatedAt: new Date().toISOString(),
  tracks: {
    [TRACK_ID]: {
      id: TRACK_ID,
      available: true,
      title: "Junior High",
      sourceWorkbookKey: "level-1-level-2-workbook",
      totalWords: vocabulary.length,
      chunkSize: CHUNK_SIZE,
      chunkFiles
    },
    "senior-high": {
      id: "senior-high",
      available: false,
      title: "Senior High",
      totalWords: 0,
      chunkSize: CHUNK_SIZE,
      chunkFiles: []
    },
    toeic: {
      id: "toeic",
      available: false,
      title: "TOEIC",
      totalWords: 0,
      chunkSize: CHUNK_SIZE,
      chunkFiles: []
    },
    toefl: {
      id: "toefl",
      available: false,
      title: "TOEFL",
      totalWords: 0,
      chunkSize: CHUNK_SIZE,
      chunkFiles: []
    },
    ielts: {
      id: "ielts",
      available: false,
      title: "IELTS",
      totalWords: 0,
      chunkSize: CHUNK_SIZE,
      chunkFiles: []
    },
    gept: {
      id: "gept",
      available: false,
      title: "GEPT",
      totalWords: 0,
      chunkSize: CHUNK_SIZE,
      chunkFiles: []
    }
  }
};

writeJson(path.join(DATA_ROOT, "catalog.json"), catalog);

console.log(`Exported ${vocabulary.length} words into ${chunkFiles.length} chunk files for ${TRACK_ID}.`);
