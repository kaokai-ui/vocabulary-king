import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { TRACK_DEFINITIONS } from "./vocabulary-source-definitions.mjs";
import { buildTrackExportRecords } from "./vocabulary-data-utils.mjs";
import { inferSensesFromLegacyRow } from "./vocabulary-senses.mjs";
import { readUidAliasData, validateVocabularyUidState } from "./vocabulary-uids.mjs";

const DATA_ROOT = path.resolve("public/data");
const TRACKS_ROOT = path.join(DATA_ROOT, "tracks");
const CHUNK_SIZE = 1000;
const DEFAULT_DATA_REPO = "D:\\Game\\VocabularyKing-data";
const EXTRA_LOCALES = {
  ja: { meaningField: "meaning_ja", exampleField: "example_ja" },
  ko: { meaningField: "meaning_ko", exampleField: "example_ko" }
};

export function getVocabularyDataRepoPath(env = process.env) {
  return path.resolve(env.VOCABULARY_DATA_REPO || DEFAULT_DATA_REPO);
}

function normalizeExtraLocales(value) {
  const requested = (Array.isArray(value) ? value : [value])
    .flatMap((item) => String(item ?? "").split(","))
    .map((locale) => locale.trim().toLowerCase())
    .filter(Boolean);
  const unsupported = [...new Set(requested)].filter((locale) => !Object.hasOwn(EXTRA_LOCALES, locale));

  if (unsupported.length > 0) {
    throw new Error(`Unsupported vocabulary export locale(s): ${unsupported.join(", ")}. Supported locales: ja, ko.`);
  }

  const requestedSet = new Set(requested);
  return Object.keys(EXTRA_LOCALES).filter((locale) => requestedSet.has(locale));
}

export function getVocabularyExportExtraLocales(env = process.env) {
  return normalizeExtraLocales(env.VOCAB_EXPORT_EXTRA_LOCALES ?? "");
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
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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

function prepareTracks(dataRepoRoot, extraLocales, { includeSenseData = false, sensesDisplay = false } = {}) {
  const prepared = new Map();
  const sourceRowsByTrack = new Map();

  for (const definition of TRACK_DEFINITIONS) {
    if (!definition.available) {
      prepared.set(definition.id, []);
      continue;
    }

    const sourceRows = readTrackSourceRows(dataRepoRoot, definition.id);
    sourceRowsByTrack.set(definition.id, sourceRows);
    const exportRecords = buildTrackExportRecords(definition.id, sourceRows, { useSensesDisplay: sensesDisplay });
    const records = exportRecords.map(({ level, word, meaning, example, id, sourceIndex }) => {
      const record = { level, word, meaning, example, id };
      if (includeSenseData) {
        const sourceRow = sourceRows[sourceIndex];
        const senses = Array.isArray(sourceRow?.senses) ? sourceRow.senses : inferSensesFromLegacyRow(sourceRow).senses;
        record.senses = senses;
        if (Number.isInteger(sourceRow?.example_sense)) record.example_sense = sourceRow.example_sense;
        record.ipa_us = String(sourceRow?.ipa_us ?? "");
        record.ipa_uk = String(sourceRow?.ipa_uk ?? "");
      }
      return record;
    });

    if (records.length === 0) {
      throw new Error(`Vocabulary source file for '${definition.id}' contains no exportable entries.`);
    }

    const translationsByLocale = Object.fromEntries(
      extraLocales.map((locale) => {
        const fields = EXTRA_LOCALES[locale];
        const translatedRecords = exportRecords
          .map((record) => ({
            id: record.id,
            meaning: String(
              sourceRows[record.sourceIndex]?.legacy_display?.[fields.meaningField] ??
                sourceRows[record.sourceIndex]?.[fields.meaningField] ?? ""
            ).trim(),
            example: String(sourceRows[record.sourceIndex]?.[fields.exampleField] ?? "").trim()
          }))
          .filter((record) => record.meaning || record.example);

        return [locale, translatedRecords];
      })
    );

    prepared.set(definition.id, { records, translationsByLocale });
  }

  const aliasData = readUidAliasData(dataRepoRoot);
  validateVocabularyUidState({ sourceRowsByTrack, aliasData });
  return { preparedTracks: prepared, aliasData };
}

export function exportGameVocabulary({
  dataRepoRoot = getVocabularyDataRepoPath(),
  dataRoot = DATA_ROOT,
  extraLocales = getVocabularyExportExtraLocales(),
  includeUidAliases = false,
  includeSenseData = false,
  sensesDisplay = process.env.VOCAB_EXPORT_SENSES_DISPLAY === "1"
} = {}) {
  const resolvedDataRepoRoot = path.resolve(dataRepoRoot);
  const resolvedDataRoot = path.resolve(dataRoot);
  const localesToExport = normalizeExtraLocales(extraLocales);

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
  const { preparedTracks, aliasData } = prepareTracks(resolvedDataRepoRoot, localesToExport, { includeSenseData, sensesDisplay });
  const tracksRoot = path.join(resolvedDataRoot, "tracks");
  const catalogTracks = {};
  const summaries = [];

  fs.mkdirSync(resolvedDataRoot, { recursive: true });
  fs.rmSync(path.join(resolvedDataRoot, "vocabulary.json"), { force: true });

  for (const definition of TRACK_DEFINITIONS) {
    if (definition.available) {
      const prepared = preparedTracks.get(definition.id) ?? { records: [], translationsByLocale: {} };
      const vocabulary = prepared.records;
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

      const localeCatalog = {};

      for (const locale of localesToExport) {
        const translatedRecords = prepared.translationsByLocale[locale] ?? [];
        if (translatedRecords.length === 0) {
          continue;
        }

        const localeChunks = chunkItems(translatedRecords, CHUNK_SIZE);
        const localeChunkFiles = localeChunks.map((chunk, index) => {
          const fileName = `chunk-${String(index + 1).padStart(3, "0")}.json`;
          const relativePath = `data/tracks/${definition.id}/${locale}/${fileName}`;

          writeJson(path.join(trackOutputDir, locale, fileName), chunk);

          return {
            id: `${definition.id}-${locale}-chunk-${index + 1}`,
            path: relativePath,
            wordCount: chunk.length
          };
        });

        localeCatalog[locale] = {
          totalWords: translatedRecords.length,
          chunkSize: CHUNK_SIZE,
          chunkFiles: localeChunkFiles
        };
      }

      catalogTracks[definition.id] = {
        ...createCatalogTrack(definition, chunkFiles, vocabulary.length),
        ...(Object.keys(localeCatalog).length ? { locales: localeCatalog } : {})
      };
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

  if (includeUidAliases) {
    writeJson(path.join(resolvedDataRoot, "uid-aliases.json"), aliasData);
  }

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
