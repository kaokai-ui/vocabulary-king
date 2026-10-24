import fs from "node:fs";
import path from "node:path";
import xlsx from "xlsx";

const PROJECT_ROOT = process.cwd();
const DATA_ROOT = path.resolve(PROJECT_ROOT, "public/data");
const CATALOG_PATH = path.join(DATA_ROOT, "catalog.json");
const OUTPUT_DIR = path.resolve(PROJECT_ROOT, "Source");
const OUTPUT_BASENAME = "merged-9-vocabulary";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeWordKey(value) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, " ");
}

function appendUnique(list, seen, value) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return;
  }

  const key = normalized.toLowerCase();

  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  list.push(normalized);
}

function loadTrackWords(track) {
  const words = [];

  for (const chunkFile of track.chunkFiles ?? []) {
    const chunkPath = path.join(DATA_ROOT, chunkFile.path.replace(/^data[\\/]/, ""));
    const chunkWords = readJson(chunkPath);

    for (const word of chunkWords) {
      words.push(word);
    }
  }

  return words;
}

function buildMergedRows() {
  const catalog = readJson(CATALOG_PATH);
  const merged = new Map();
  let totalRows = 0;
  let activeTrackCount = 0;

  for (const track of Object.values(catalog.tracks ?? {})) {
    if (!track?.available) {
      continue;
    }

    activeTrackCount += 1;
    const words = loadTrackWords(track);

    for (const entry of words) {
      totalRows += 1;

      const normalizedWord = normalizeText(entry.word);
      const wordKey = normalizeWordKey(normalizedWord);

      if (!wordKey) {
        continue;
      }

      const current =
        merged.get(wordKey) ?? {
          word: normalizedWord,
          meanings: [],
          meaningSeen: new Set(),
          levels: [],
          levelSeen: new Set(),
          examples: [],
          exampleSeen: new Set()
        };

      appendUnique(current.meanings, current.meaningSeen, entry.meaning);
      appendUnique(current.levels, current.levelSeen, entry.level);
      appendUnique(current.examples, current.exampleSeen, entry.example);

      if (!current.word) {
        current.word = normalizedWord;
      }

      merged.set(wordKey, current);
    }
  }

  const rows = Array.from(merged.values())
    .sort((left, right) => left.word.localeCompare(right.word, "en", { sensitivity: "base" }))
    .map((entry) => ({
      Word: entry.word,
      "Chinese Meaning": entry.meanings.join("\n"),
      Levels: entry.levels.join(", "),
      "English Example": entry.examples[0] ?? ""
    }));

  return {
    activeTrackCount,
    totalRows,
    uniqueWords: rows.length,
    rows
  };
}

function writeOutputs(rows) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.json_to_sheet(rows);
  xlsx.utils.book_append_sheet(workbook, worksheet, "Merged Vocabulary");

  const xlsxPath = path.join(OUTPUT_DIR, `${OUTPUT_BASENAME}.xlsx`);
  const csvPath = path.join(OUTPUT_DIR, `${OUTPUT_BASENAME}.csv`);

  xlsx.writeFile(workbook, xlsxPath);
  fs.writeFileSync(csvPath, `\ufeff${xlsx.utils.sheet_to_csv(worksheet)}`, "utf8");

  return {
    xlsxPath,
    csvPath
  };
}

const { activeTrackCount, totalRows, uniqueWords, rows } = buildMergedRows();
const { xlsxPath, csvPath } = writeOutputs(rows);

console.log(
  [
    `Merged ${totalRows} rows from ${activeTrackCount} active vocabulary tracks.`,
    `Unique words: ${uniqueWords}`,
    `XLSX: ${xlsxPath}`,
    `CSV: ${csvPath}`
  ].join("\n")
);
