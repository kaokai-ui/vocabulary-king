import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildTrackExportRecords, formatSourceExample, formatSourceMeaning } from "./vocabulary-data-utils.mjs";
import {
  inferSensesFromLegacyRow,
  normalizePosCode,
  snapshotLegacyDisplay,
  syncCompatibilityFieldsFromSenses,
  validateSenseRow
} from "./vocabulary-senses.mjs";

const DEFAULT_DATA_REPO = "D:\\Game\\VocabularyKing-data";
const FINAL_FIELDS = new Set([
  "word",
  "meaning",
  "example_en",
  "example_zh",
  "meaning_ja",
  "example_ja",
  "meaning_ko",
  "example_ko",
  "senses",
  "example_sense",
  "ipa_us",
  "ipa_uk"
]);

function parseJsonl(filePath) {
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

function indexByUid(records, label) {
  const indexed = new Map();

  for (const record of records) {
    if (!record.uid) {
      throw new Error(`${label} contains a record without uid.`);
    }
    if (indexed.has(record.uid)) {
      throw new Error(`${label} contains duplicate uid '${record.uid}'.`);
    }
    indexed.set(record.uid, record);
  }

  return indexed;
}

function normalizeText(value) {
  return String(value ?? "");
}

function setSourceMeaning(track, sourceRow, displayMeaning) {
  const value = String(displayMeaning);

  if (track === "toeic") {
    const posPrefix = /^(.+?)\.\s+([\s\S]*)$/u.exec(value);

    if (posPrefix) {
      sourceRow.pos = posPrefix[1];
      sourceRow.meaning_zh = posPrefix[2];
    } else {
      sourceRow.pos = "";
      sourceRow.meaning_zh = value;
    }

    return;
  }

  sourceRow.meaning_zh = value;
}

function ensureSourceSenses(sourceRow) {
  if (!Array.isArray(sourceRow.senses) || sourceRow.senses.length === 0) {
    sourceRow.senses = inferSensesFromLegacyRow(sourceRow).senses;
  }
}

function setLegacyMeaningOnSingleSense(track, sourceRow, field, value) {
  ensureSourceSenses(sourceRow);
  if (sourceRow.senses.length !== 1) {
    throw new Error(`Legacy meaning field '${field}' requires exactly one sense for uid '${sourceRow.uid}'; use final.senses instead.`);
  }

  const sense = { ...sourceRow.senses[0] };
  if (field === "meaning") {
    setSourceMeaning(track, sourceRow, value);
    sense.meaning_zh = String(sourceRow.meaning_zh ?? "");
    if (track === "toeic") sense.pos = normalizePosCode(sourceRow.pos);
  } else {
    const senseField = field;
    sense[senseField] = value;
    sourceRow[senseField] = value;
  }
  sourceRow.senses = [sense];
  syncCompatibilityFieldsFromSenses(sourceRow);
  sourceRow.legacy_display = snapshotLegacyDisplay(sourceRow);
}

function sourceSnapshotMap(snapshotRows) {
  const snapshots = new Map();

  for (const row of snapshotRows) {
    if (!row.uid) {
      throw new Error("The review snapshot contains a record without uid.");
    }
    if (snapshots.has(row.uid)) {
      throw new Error(`The review snapshot contains duplicate uid '${row.uid}'.`);
    }
    snapshots.set(row.uid, row);
  }

  return snapshots;
}

export function planVocabularyWriteback({ track, sourceRows, snapshotRows, decisions }) {
  if (!track) {
    throw new Error("A vocabulary track is required.");
  }

  const currentRecords = buildTrackExportRecords(track, sourceRows);
  const currentByUid = indexByUid(currentRecords, "Current source data");
  const snapshots = sourceSnapshotMap(snapshotRows);
  const updatedRows = sourceRows.map((row) => ({ ...row }));
  const seenDecisionUids = new Set();
  const plannedUpdates = [];

  for (const decision of decisions) {
    const uid = String(decision?.uid ?? "");

    if (!uid || seenDecisionUids.has(uid)) {
      throw new Error(`Missing or duplicate decision uid: ${uid || "(empty)"}.`);
    }
    seenDecisionUids.add(uid);

    const snapshot = snapshots.get(uid);
    const current = currentByUid.get(uid);

    if (!snapshot) {
      throw new Error(`No review snapshot row found for uid '${uid}'.`);
    }
    if (!current) {
      throw new Error(`Current source no longer has uid '${uid}'. Refusing to write stale decisions.`);
    }
    if (normalizeText(decision.word) !== normalizeText(snapshot.word)) {
      throw new Error(`Decision word does not match its review snapshot for uid '${uid}'.`);
    }

    for (const field of ["level", "word", "meaning", "example"]) {
      if (normalizeText(current[field]) !== normalizeText(snapshot[field])) {
        throw new Error(
          `Stale source for uid '${uid}': ${field} was ${JSON.stringify(snapshot[field])} during review ` +
            `but is now ${JSON.stringify(current[field])}. No files were written.`
        );
      }
    }

    const outcome = String(decision.decision ?? "");
    if (!["accept", "revise", "reject"].includes(outcome)) {
      throw new Error(`Unsupported decision '${outcome}' for uid '${uid}'.`);
    }

    const final = decision.final ?? {};
    if (!final || typeof final !== "object" || Array.isArray(final)) {
      throw new Error(`Invalid final object for uid '${uid}'.`);
    }
    if (Object.hasOwn(final, "uid")) {
      throw new Error(`The uid for '${uid}' is immutable and cannot be changed in final.`);
    }
    const unexpectedFields = Object.keys(final).filter((field) => !FINAL_FIELDS.has(field));
    if (unexpectedFields.length) {
      throw new Error(`Unsupported final field(s) for uid '${uid}': ${unexpectedFields.join(", ")}.`);
    }
    if (Object.hasOwn(final, "senses") && ["meaning", "meaning_ja", "meaning_ko"].some((field) => Object.hasOwn(final, field))) {
      throw new Error(`Decision '${uid}' cannot mix final.senses with legacy meaning fields; use final.senses alone.`);
    }
    if (outcome === "reject" && Object.keys(final).length) {
      throw new Error(`Rejected decision '${uid}' must have an empty final object.`);
    }

    const sourceIndex = current.sourceIndex;
    const sourceRow = updatedRows[sourceIndex];
    if (!sourceRow || sourceRow.track !== track) {
      throw new Error(`Could not map uid '${uid}' back to source row ${sourceIndex}.`);
    }

    if (outcome === "reject") {
      continue;
    }

    const oldRow = sourceRows[sourceIndex];
    const previous = {
      word: current.word,
      meaning: current.meaning,
      example_en: normalizeText(oldRow.example_en),
      example_zh: normalizeText(oldRow.example_zh),
      meaning_ja: normalizeText(oldRow.legacy_display?.meaning_ja ?? oldRow.meaning_ja),
      example_ja: normalizeText(oldRow.example_ja),
      meaning_ko: normalizeText(oldRow.legacy_display?.meaning_ko ?? oldRow.meaning_ko),
      example_ko: normalizeText(oldRow.example_ko),
      senses: JSON.stringify(oldRow.senses ?? []),
      example_sense: oldRow.example_sense,
      ipa_us: normalizeText(oldRow.ipa_us),
      ipa_uk: normalizeText(oldRow.ipa_uk)
    };

    for (const [field, value] of Object.entries(final)) {
      if (["word", "meaning", "meaning_ja", "example_en", "example_zh", "example_ja", "meaning_ko", "example_ko", "ipa_us", "ipa_uk"].includes(field) && typeof value !== "string") {
        throw new Error(`Final field '${field}' for uid '${uid}' must be a string.`);
      }

      if (field === "senses") {
        if (!Array.isArray(value)) throw new Error(`Final field 'senses' for uid '${uid}' must be an array.`);
        sourceRow.senses = JSON.parse(JSON.stringify(value));
        syncCompatibilityFieldsFromSenses(sourceRow);
        sourceRow.legacy_display = snapshotLegacyDisplay(sourceRow);
      } else if (field === "example_sense") {
        if (!Number.isInteger(value)) throw new Error(`Final field 'example_sense' for uid '${uid}' must be an integer.`);
        sourceRow.example_sense = value;
      } else if (field === "ipa_us" || field === "ipa_uk") {
        sourceRow[field] = value;
      } else if (field === "meaning" || field === "meaning_ja" || field === "meaning_ko") {
        setLegacyMeaningOnSingleSense(track, sourceRow, field, value);
      } else if (field === "word") {
        sourceRow.word = value;
      } else {
        sourceRow[field] = value;
      }
    }

    const senseErrors = validateSenseRow(sourceRow, `Source row for uid '${uid}'`);
    if (senseErrors.length) throw new Error(senseErrors.join("; "));

    if ("example_en" in final || "example_zh" in final) {
      sourceRow.example_format =
        sourceRow.example_en && sourceRow.example_zh
          ? { before: " (", after: ")" }
          : { before: "", after: "" };
    }

    const next = {
      word: sourceRow.word,
      meaning: formatSourceMeaning(sourceRow),
      example_en: normalizeText(sourceRow.example_en),
      example_zh: normalizeText(sourceRow.example_zh),
      meaning_ja: normalizeText(sourceRow.meaning_ja),
      example_ja: normalizeText(sourceRow.example_ja),
      meaning_ko: normalizeText(sourceRow.meaning_ko),
      example_ko: normalizeText(sourceRow.example_ko),
      senses: JSON.stringify(sourceRow.senses ?? []),
      example_sense: sourceRow.example_sense,
      ipa_us: normalizeText(sourceRow.ipa_us),
      ipa_uk: normalizeText(sourceRow.ipa_uk),
      example: formatSourceExample(sourceRow)
    };
    const cellChanges = [];

    for (const field of Object.keys(final)) {
      const from = field === "meaning" ? previous.meaning : previous[field];
      const to = field === "meaning" ? next.meaning : next[field];

      if (normalizeText(from) !== normalizeText(to)) {
        cellChanges.push({ uid, field, from, to });
      }
    }

    plannedUpdates.push({ uid, sourceIndex, cellChanges });
  }

  const updatedRecords = buildTrackExportRecords(track, updatedRows);
  const updatedBySourceIndex = new Map(updatedRecords.map((record) => [record.sourceIndex, record]));

  for (const row of sourceRows.keys()) {
    if (!updatedBySourceIndex.has(row)) {
      throw new Error(`A writeback would merge or drop source row ${row}; no files were written.`);
    }
  }

  return {
    updatedRows,
    cellChanges: plannedUpdates.flatMap((update) => update.cellChanges)
  };
}

export function applyVocabularyDecisionsToFile({ track, sourcePath, snapshotPath, decisionsPath, dryRun = false }) {
  const sourceRows = parseJsonl(sourcePath);
  const snapshotRows = parseJsonl(snapshotPath);
  const decisions = parseJsonl(decisionsPath);
  const plan = planVocabularyWriteback({ track, sourceRows, snapshotRows, decisions });

  if (!dryRun && plan.cellChanges.length) {
    fs.writeFileSync(sourcePath, plan.updatedRows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
  }

  return plan;
}

function parseArguments(args) {
  const options = {
    track: "",
    decisionsPath: "",
    snapshotPath: "",
    dataDirectory: process.env.VOCABULARY_DATA_REPO || DEFAULT_DATA_REPO,
    dryRun: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === "--track") {
      options.track = args[++index] ?? "";
    } else if (argument === "--decisions") {
      options.decisionsPath = path.resolve(args[++index] ?? "");
    } else if (argument === "--snapshot") {
      options.snapshotPath = path.resolve(args[++index] ?? "");
    } else if (argument === "--data-dir") {
      options.dataDirectory = path.resolve(args[++index] ?? "");
    } else if (argument === "--dry-run") {
      options.dryRun = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!options.track || !options.decisionsPath || !options.snapshotPath) {
    throw new Error("Usage: node scripts/apply-vocabulary-decisions-to-source.mjs --track <id> --decisions <file> --snapshot <file> [--data-dir <repo>] [--dry-run]");
  }

  options.dataDirectory = path.resolve(options.dataDirectory);
  options.sourcePath = path.join(options.dataDirectory, "data", `${options.track}.jsonl`);
  return options;
}

function printPlan(plan, dryRun) {
  if (!plan.cellChanges.length) {
    console.log("No source cells need updating.");
  }

  for (const change of plan.cellChanges) {
    console.log(`${change.uid} ${change.field}: ${JSON.stringify(change.from)} -> ${JSON.stringify(change.to)}`);
  }

  console.log(dryRun ? "Dry run: source file was not written." : "Source writeback completed.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const plan = applyVocabularyDecisionsToFile(options);
    printPlan(plan, options.dryRun);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
