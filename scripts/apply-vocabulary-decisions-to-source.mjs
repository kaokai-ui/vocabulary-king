import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildTrackExportRecords, formatSourceExample, formatSourceMeaning } from "./vocabulary-data-utils.mjs";

const DEFAULT_DATA_REPO = "D:\\Game\\VocabularyKing-data";
const FINAL_FIELDS = new Set([
  "word",
  "meaning",
  "example_en",
  "example_zh",
  "meaning_ja",
  "example_ja",
  "meaning_ko",
  "example_ko"
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

function indexById(records, label) {
  const indexed = new Map();

  for (const record of records) {
    if (!record.id) {
      throw new Error(`${label} contains a record without id.`);
    }
    if (indexed.has(record.id)) {
      throw new Error(`${label} contains duplicate id '${record.id}'.`);
    }
    indexed.set(record.id, record);
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

function sourceSnapshotMap(snapshotRows) {
  const snapshots = new Map();

  for (const row of snapshotRows) {
    if (!row.id) {
      throw new Error("The review snapshot contains a record without id.");
    }
    if (snapshots.has(row.id)) {
      throw new Error(`The review snapshot contains duplicate id '${row.id}'.`);
    }
    snapshots.set(row.id, row);
  }

  return snapshots;
}

export function planVocabularyWriteback({ track, sourceRows, snapshotRows, decisions }) {
  if (!track) {
    throw new Error("A vocabulary track is required.");
  }

  const currentRecords = buildTrackExportRecords(track, sourceRows);
  const currentById = indexById(currentRecords, "Current source data");
  const snapshots = sourceSnapshotMap(snapshotRows);
  const updatedRows = sourceRows.map((row) => ({ ...row }));
  const seenDecisionIds = new Set();
  const plannedUpdates = [];

  for (const decision of decisions) {
    const id = String(decision?.id ?? "");

    if (!id || seenDecisionIds.has(id)) {
      throw new Error(`Missing or duplicate decision id: ${id || "(empty)"}.`);
    }
    seenDecisionIds.add(id);

    const snapshot = snapshots.get(id);
    const current = currentById.get(id);

    if (!snapshot) {
      throw new Error(`No review snapshot row found for id '${id}'.`);
    }
    if (!current) {
      throw new Error(`Current source no longer has id '${id}'. Refusing to write stale decisions.`);
    }
    if (normalizeText(decision.word) !== normalizeText(snapshot.word)) {
      throw new Error(`Decision word does not match its review snapshot for id '${id}'.`);
    }

    for (const field of ["level", "word", "meaning", "example"]) {
      if (normalizeText(current[field]) !== normalizeText(snapshot[field])) {
        throw new Error(
          `Stale source for id '${id}': ${field} was ${JSON.stringify(snapshot[field])} during review ` +
            `but is now ${JSON.stringify(current[field])}. No files were written.`
        );
      }
    }

    const outcome = String(decision.decision ?? "");
    if (!["accept", "revise", "reject"].includes(outcome)) {
      throw new Error(`Unsupported decision '${outcome}' for id '${id}'.`);
    }

    const final = decision.final ?? {};
    if (!final || typeof final !== "object" || Array.isArray(final)) {
      throw new Error(`Invalid final object for id '${id}'.`);
    }
    const unexpectedFields = Object.keys(final).filter((field) => !FINAL_FIELDS.has(field));
    if (unexpectedFields.length) {
      throw new Error(`Unsupported final field(s) for id '${id}': ${unexpectedFields.join(", ")}.`);
    }
    if (outcome === "reject" && Object.keys(final).length) {
      throw new Error(`Rejected decision '${id}' must have an empty final object.`);
    }

    const sourceIndex = current.sourceIndex;
    const sourceRow = updatedRows[sourceIndex];
    if (!sourceRow || sourceRow.track !== track) {
      throw new Error(`Could not map id '${id}' back to source row ${sourceIndex}.`);
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
      meaning_ja: normalizeText(oldRow.meaning_ja),
      example_ja: normalizeText(oldRow.example_ja),
      meaning_ko: normalizeText(oldRow.meaning_ko),
      example_ko: normalizeText(oldRow.example_ko)
    };

    for (const [field, value] of Object.entries(final)) {
      if (typeof value !== "string") {
        throw new Error(`Final field '${field}' for id '${id}' must be a string.`);
      }

      if (field === "word") {
        sourceRow.word = value;
      } else if (field === "meaning") {
        setSourceMeaning(track, sourceRow, value);
      } else {
        sourceRow[field] = value;
      }
    }

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
      example: formatSourceExample(sourceRow)
    };
    const cellChanges = [];

    for (const field of Object.keys(final)) {
      const from = field === "meaning" ? previous.meaning : previous[field];
      const to = field === "meaning" ? next.meaning : next[field];

      if (normalizeText(from) !== normalizeText(to)) {
        cellChanges.push({ id, field, from, to });
      }
    }

    plannedUpdates.push({ id, sourceIndex, cellChanges });
  }

  const updatedRecords = buildTrackExportRecords(track, updatedRows);
  const updatedBySourceIndex = new Map(updatedRecords.map((record) => [record.sourceIndex, record]));

  for (const row of sourceRows.keys()) {
    if (!updatedBySourceIndex.has(row)) {
      throw new Error(`A writeback would merge or drop source row ${row}; no files were written.`);
    }
  }

  const oldToNewIds = plannedUpdates
    .map(({ id, sourceIndex }) => ({ oldId: id, newId: updatedBySourceIndex.get(sourceIndex)?.id }))
    .filter(({ oldId, newId }) => newId && oldId !== newId);

  return {
    updatedRows,
    cellChanges: plannedUpdates.flatMap((update) => update.cellChanges),
    oldToNewIds
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
    console.log(`${change.id} ${change.field}: ${JSON.stringify(change.from)} -> ${JSON.stringify(change.to)}`);
  }

  for (const mapping of plan.oldToNewIds) {
    console.log(`ID ${mapping.oldId} -> ${mapping.newId}`);
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
