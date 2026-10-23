import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { TRACK_DEFINITIONS } from "./vocabulary-source-definitions.mjs";
import {
  inferSensesFromLegacyRow,
  snapshotLegacyDisplay,
  syncCompatibilityFieldsFromSenses,
  validateSenseRow
} from "./vocabulary-senses.mjs";

const DEFAULT_DATA_REPO = "D:\\Game\\VocabularyKing-data";
const REPORT_DIRECTORY = "reports";
const REPORT_FILE = "vocab-senses-migration.json";
const UNRESOLVED_FILE = "vocab-senses-unresolved.jsonl";

function parseArguments(args) {
  const options = { dataDir: process.env.VOCABULARY_DATA_REPO || DEFAULT_DATA_REPO, rebuildSenses: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--data-dir") {
      options.dataDir = args[++index] ?? "";
    } else if (argument.startsWith("--data-dir=")) {
      options.dataDir = argument.slice("--data-dir=".length);
    } else if (argument === "--rebuild-senses") {
      options.rebuildSenses = true;
    } else {
      throw new Error("Usage: npm run migrate:vocab-senses -- --data-dir <repo> [--rebuild-senses]");
    }
  }
  if (!String(options.dataDir).trim()) {
    throw new Error("Usage: npm run migrate:vocab-senses -- --data-dir <repo> [--rebuild-senses]");
  }
  return { ...options, dataDir: path.resolve(options.dataDir) };
}

function readJsonl(filePath) {
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid JSON in ${filePath}:${index + 1}: ${error instanceof Error ? error.message : error}`);
      }
    });
}

function writeJsonl(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

function calculatePercentage(value, total) {
  return total === 0 ? 0 : Number((value * 100 / total).toFixed(2));
}

export function migrateVocabularySenses({
  dataDir = process.env.VOCABULARY_DATA_REPO || DEFAULT_DATA_REPO,
  rebuildSenses = false
} = {}) {
  const dataRepoRoot = path.resolve(dataDir);
  if (!fs.existsSync(path.join(dataRepoRoot, "data"))) {
    throw new Error(`Vocabulary data repo has no data directory: ${dataRepoRoot}`);
  }

  const perTrack = {};
  const unresolvedRows = [];

  for (const definition of TRACK_DEFINITIONS.filter((track) => track.available)) {
    const filePath = path.join(dataRepoRoot, "data", `${definition.id}.jsonl`);
    if (!fs.existsSync(filePath)) throw new Error(`Missing vocabulary source JSONL: ${filePath}`);
    const rows = readJsonl(filePath);
    let autoParsed = 0;

    for (const [index, row] of rows.entries()) {
      if (row.track !== definition.id) {
        throw new Error(`Unexpected track '${row.track}' in ${filePath}:${index + 1}; expected '${definition.id}'.`);
      }

      const hadSenses = Array.isArray(row.senses) && row.senses.length > 0;
      const oldDisplay = row.legacy_display ?? snapshotLegacyDisplay(row);
      const sourceForParsing = { ...row, ...oldDisplay };
      const inferred = inferSensesFromLegacyRow(sourceForParsing);

      if (hadSenses && !rebuildSenses) {
        const errors = validateSenseRow(row, `${definition.id} uid ${row.uid ?? "(missing uid)"}`);
        if (errors.length) throw new Error(errors.join("; "));
      } else {
        row.senses = inferred.senses;
      }

      row.legacy_display ??= oldDisplay;
      row.ipa_us ??= "";
      row.ipa_uk ??= "";
      syncCompatibilityFieldsFromSenses(row);
      const errors = validateSenseRow(row, `${definition.id} uid ${row.uid ?? "(missing uid)"}`);
      if (errors.length) throw new Error(errors.join("; "));

      const isResolved = inferred.parsed || row.senses.some((sense) => Boolean(sense.pos));
      if (isResolved) {
        autoParsed += 1;
      } else {
        unresolvedRows.push({
          track: definition.id,
          uid: String(row.uid ?? ""),
          word: String(row.word ?? ""),
          meaning: String(oldDisplay.meaning_zh ?? "")
        });
      }
    }

    writeJsonl(filePath, rows);
    const unresolved = rows.length - autoParsed;
    perTrack[definition.id] = {
      total: rows.length,
      autoParsed,
      autoParsedPercent: calculatePercentage(autoParsed, rows.length),
      unresolved
    };
  }

  const report = {
    schemaVersion: 1,
    tracks: perTrack,
    totals: {
      rows: Object.values(perTrack).reduce((total, track) => total + track.total, 0),
      autoParsed: Object.values(perTrack).reduce((total, track) => total + track.autoParsed, 0),
      unresolved: unresolvedRows.length
    },
    unresolvedFile: path.join(REPORT_DIRECTORY, UNRESOLVED_FILE).replaceAll("\\", "/")
  };
  const reportRoot = path.join(dataRepoRoot, REPORT_DIRECTORY);
  fs.mkdirSync(reportRoot, { recursive: true });
  fs.writeFileSync(path.join(reportRoot, REPORT_FILE), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeJsonl(path.join(reportRoot, UNRESOLVED_FILE), unresolvedRows);

  for (const [track, summary] of Object.entries(perTrack)) {
    console.log(`${track}: ${summary.autoParsed}/${summary.total} auto-parsed (${summary.autoParsedPercent}%), ${summary.unresolved} unresolved`);
  }
  console.log(`Unresolved rows: ${path.join(reportRoot, UNRESOLVED_FILE)}`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    migrateVocabularySenses(parseArguments(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
