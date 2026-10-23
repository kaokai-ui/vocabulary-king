import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { TRACK_DEFINITIONS } from "./vocabulary-source-definitions.mjs";
import { buildLegacyTrackExportRecords } from "./vocabulary-data-utils.mjs";
import {
  addUidAlias,
  emptyUidAliasData,
  readUidAliasData,
  UID_ALIASES_RELATIVE_PATH,
  validateVocabularyUidState
} from "./vocabulary-uids.mjs";

const DEFAULT_DATA_REPO = "D:\\Game\\VocabularyKing-data";

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

function candidateUidSuffix(baseUid, track, usedUids, reservedLegacyUids) {
  const stem = `${baseUid}--${track}`;
  let candidate = stem;
  let suffix = 2;

  while (usedUids.has(candidate) || reservedLegacyUids.has(candidate)) {
    candidate = `${stem}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export function planEnsureVocabularyUids({ sourceRowsByTrack, aliasData = emptyUidAliasData() }) {
  const updatedRowsByTrack = new Map(
    [...sourceRowsByTrack.entries()].map(([track, rows]) => [track, rows.map((row) => ({ ...row }))])
  );
  const reservedLegacyUids = new Set();
  const missingRows = [];
  const usedUids = new Set();

  for (const [track, rows] of updatedRowsByTrack) {
    const legacyRecords = buildLegacyTrackExportRecords(track, rows);
    const legacyUidBySourceIndex = new Map(legacyRecords.map((record) => [record.sourceIndex, record.uid]));

    if (legacyUidBySourceIndex.size !== rows.length) {
      throw new Error(`Cannot generate one legacy uid per source row in '${track}'; exact duplicate rows exist.`);
    }

    for (const [sourceIndex, row] of rows.entries()) {
      const legacyUid = legacyUidBySourceIndex.get(sourceIndex);
      if (!legacyUid) {
        throw new Error(`Cannot compute a legacy uid for ${track} row ${sourceIndex + 1}.`);
      }
      reservedLegacyUids.add(legacyUid);

      if (row.uid !== undefined && row.uid !== null && String(row.uid).trim()) {
        const uid = String(row.uid);
        if (uid !== uid.trim()) {
          throw new Error(`Existing uid in '${track}' row ${sourceIndex + 1} has surrounding whitespace.`);
        }
        if (usedUids.has(uid)) {
          throw new Error(`Duplicate existing vocabulary uid '${uid}'.`);
        }
        usedUids.add(uid);
      } else {
        missingRows.push({ track, sourceIndex, legacyUid });
      }
    }
  }

  const assignedAliases = [];
  for (const { track, sourceIndex, legacyUid } of missingRows) {
    const row = updatedRowsByTrack.get(track)[sourceIndex];
    let uid = legacyUid;

    if (usedUids.has(uid)) {
      uid = candidateUidSuffix(legacyUid, track, usedUids, reservedLegacyUids);
    }

    row.uid = uid;
    usedUids.add(uid);
    if (uid !== legacyUid) {
      assignedAliases.push({ track, aliasUid: legacyUid, targetUid: uid });
    }
  }

  const normalizedAliasData = {
    aliases: [...(aliasData?.aliases ?? [])],
    deleted: [...(aliasData?.deleted ?? [])]
  };
  const finalRows = new Map(updatedRowsByTrack);
  const { allUids, uidsByTrack } = validateVocabularyUidState({
    sourceRowsByTrack: finalRows,
    aliasData: normalizedAliasData
  });

  let finalAliasData = normalizedAliasData;
  for (const alias of assignedAliases) {
    const existing = finalAliasData.aliases.find((item) => item.track === alias.track && item.aliasUid === alias.aliasUid);
    if (existing) {
      if (existing.targetUid !== alias.targetUid) {
        throw new Error(`Existing alias '${alias.track}/${alias.aliasUid}' targets '${existing.targetUid}', expected '${alias.targetUid}'.`);
      }
      continue;
    }

    finalAliasData = addUidAlias(finalAliasData, {
      ...alias,
      uidsByTrack,
      allUids
    });
  }

  validateVocabularyUidState({ sourceRowsByTrack: finalRows, aliasData: finalAliasData });
  return { updatedRowsByTrack: finalRows, aliasData: finalAliasData, assignedAliases };
}

function parseArguments(args) {
  const options = { dataDirectory: process.env.VOCABULARY_DATA_REPO || DEFAULT_DATA_REPO };

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--data-dir") {
      options.dataDirectory = path.resolve(args[++index] ?? "");
    } else {
      throw new Error("Usage: node scripts/ensure-vocabulary-uids.mjs [--data-dir <repo>]");
    }
  }

  return options;
}

export function ensureVocabularyUids(dataDirectory) {
  const root = path.resolve(dataDirectory);
  const sourceRowsByTrack = new Map();

  for (const definition of TRACK_DEFINITIONS.filter((track) => track.available)) {
    const filePath = path.join(root, "data", `${definition.id}.jsonl`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing vocabulary source file: ${filePath}`);
    }
    sourceRowsByTrack.set(definition.id, readJsonl(filePath));
  }

  const aliasPath = path.join(root, UID_ALIASES_RELATIVE_PATH);
  const oldAliasJson = fs.existsSync(aliasPath) ? fs.readFileSync(aliasPath, "utf8") : "";
  const plan = planEnsureVocabularyUids({
    sourceRowsByTrack,
    aliasData: fs.existsSync(aliasPath) ? readUidAliasData(root) : emptyUidAliasData()
  });

  let updatedFiles = 0;
  for (const [track, rows] of plan.updatedRowsByTrack) {
    const filePath = path.join(root, "data", `${track}.jsonl`);
    const original = fs.readFileSync(filePath, "utf8");
    const newline = original.includes("\r\n") ? "\r\n" : "\n";
    const next = `${rows.map((row) => JSON.stringify(row)).join(newline)}${newline}`;
    if (original !== next) {
      fs.writeFileSync(filePath, next, "utf8");
      updatedFiles += 1;
    }
  }

  const nextAliasJson = `${JSON.stringify(plan.aliasData, null, 2)}\n`;
  if (oldAliasJson !== nextAliasJson) {
    fs.writeFileSync(aliasPath, nextAliasJson, "utf8");
    updatedFiles += 1;
  }

  return { ...plan, updatedFiles };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const { dataDirectory } = parseArguments(process.argv.slice(2));
    const result = ensureVocabularyUids(dataDirectory);
    const assignedCount = [...result.updatedRowsByTrack.values()].flat().filter((row) => row.uid).length;
    console.log(`Ensured uids for ${assignedCount} source rows. Updated ${result.updatedFiles} files; added ${result.assignedAliases.length} aliases for track-scoped legacy IDs.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
