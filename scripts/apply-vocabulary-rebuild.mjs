import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildDisambiguatedVocabularyId,
  buildStableVocabularyId
} from "../src/lib/vocabularyIdentity.js";
import { TRACK_DEFINITIONS } from "./vocabulary-source-definitions.mjs";
import {
  arpabetToIpa,
  parseCmuDictionary
} from "./fill-vocabulary-ipa.mjs";
import {
  emptyUidAliasData,
  readUidAliasData,
  recordDeletedUid,
  validateVocabularyUidState
} from "./vocabulary-uids.mjs";
import {
  VALID_POS_CODES,
  formatSensesField,
  snapshotLegacyDisplay,
  syncCompatibilityFieldsFromSenses,
  validateSenseRow
} from "./vocabulary-senses.mjs";

const REBUILD_TRACKS = new Set(["toeic", "toeic-advanced", "toefl", "ielts"]);
const PHRASE_GROUPS = new Set([
  "會議與簡報", "財務與會計", "人事與招募", "行銷與銷售",
  "採購與物流", "客服與溝通", "管理與策略", "日常與通用"
]);
const DOUBLE_FINAL_CONSONANT = new Set([
  "admit", "begin", "commit", "control", "defer", "deter", "equip", "excel", "forget", "permit",
  "format", "infer", "occur", "prefer", "propel", "refer", "regret", "submit", "transfer"
]);
const TASK_INPUT_DIRECTORY = path.join("docs", "tasks", "vocab-rebuild-20261023");
const POSITIVE_USAGE = new Map([
  ["be", ["am", "is", "are", "was", "were", "been", "being"]],
  ["have", ["has", "had", "having"]],
  ["do", ["does", "did", "done", "doing"]],
  ["go", ["goes", "went", "gone", "going"]],
  ["person", ["people"]], ["child", ["children"]], ["man", ["men"]],
  ["woman", ["women"]], ["mouse", ["mice"]], ["foot", ["feet"]],
  ["tooth", ["teeth"]], ["good", ["better", "best"]], ["bad", ["worse", "worst"]],
  ["far", ["farther", "farthest", "further", "furthest"]],
  ["little", ["less", "least"]], ["many", ["more", "most"]], ["much", ["more", "most"]],
  ["few", ["fewer", "fewest"]], ["find", ["found"]], ["hide", ["hid", "hidden"]],
  ["blow", ["blew", "blown"]], ["wake", ["woke", "woken"]], ["steal", ["stole", "stolen"]],
  ["shake", ["shook", "shaken"]], ["take", ["took", "taken"]], ["write", ["wrote", "written"]],
  ["speak", ["spoke", "spoken"]], ["break", ["broke", "broken"]], ["choose", ["chose", "chosen"]],
  ["drive", ["drove", "driven"]], ["eat", ["ate", "eaten"]], ["give", ["gave", "given"]],
  ["know", ["knew", "known"]], ["ride", ["rode", "ridden"]], ["rise", ["rose", "risen"]],
  ["run", ["ran"]], ["see", ["saw", "seen"]], ["sell", ["sold"]], ["send", ["sent"]],
  ["sit", ["sat"]], ["stand", ["stood"]], ["swim", ["swam", "swum"]], ["teach", ["taught"]],
  ["think", ["thought"]], ["wear", ["wore", "worn"]], ["win", ["won"]]
]);

function usage() {
  return "Usage: npm run apply:vocab-rebuild -- --track <toeic|toeic-advanced|toefl|ielts> --dir <out-folder> --data-dir <repo> [--dry-run] [--allow-partial]";
}

function parseArguments(args) {
  const options = { track: "", directory: "", dataDirectory: "", dryRun: false, allowPartial: false };
  const seen = new Set();
  const valueFlags = new Map([
    ["--track", "track"], ["--dir", "directory"], ["--data-dir", "dataDirectory"]
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    if (valueFlags.has(argument)) {
      const key = valueFlags.get(argument);
      if (seen.has(argument) || !args[index + 1] || args[index + 1].startsWith("--")) {
        throw new Error(usage());
      }
      seen.add(argument);
      options[key] = args[index + 1];
      index += 1;
      continue;
    }
    if (argument.startsWith("--track=") || argument.startsWith("--dir=") || argument.startsWith("--data-dir=")) {
      const [flag, ...parts] = argument.split("=");
      const key = valueFlags.get(flag);
      const value = parts.join("=");
      if (seen.has(flag) || !value.trim()) throw new Error(usage());
      seen.add(flag);
      options[key] = value;
      continue;
    }
    if (argument === "--dry-run" && !options.dryRun) {
      options.dryRun = true;
      continue;
    }
    if (argument === "--allow-partial" && !options.allowPartial) {
      options.allowPartial = true;
      continue;
    }
    throw new Error(`Unknown or duplicate argument '${argument}'. ${usage()}`);
  }

  if (!options.track || !options.directory || !options.dataDirectory) throw new Error(usage());
  if (!REBUILD_TRACKS.has(options.track)) {
    throw new Error(`Unsupported rebuild track '${options.track}'. Expected one of: ${[...REBUILD_TRACKS].join(", ")}.`);
  }
  if (options.allowPartial && !options.dryRun) {
    throw new Error("--allow-partial is only allowed with --dry-run; partial rebuilds can never be written.");
  }

  return {
    ...options,
    directory: path.resolve(options.directory),
    dataDirectory: path.resolve(options.dataDirectory)
  };
}

function readJsonl(filePath, label = filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/u)
    .flatMap((line, index) => {
      if (!line.trim()) return [];
      try {
        const record = JSON.parse(line);
        if (!record || typeof record !== "object" || Array.isArray(record)) {
          throw new Error("record must be a JSON object");
        }
        return [{ record, lineNumber: index + 1 }];
      } catch (error) {
        throw new Error(`Invalid JSON in ${label}:${index + 1}: ${error instanceof Error ? error.message : error}`);
      }
    });
}

function exactPartFiles(directory) {
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    throw new Error(`Missing part directory: ${directory}`);
  }
  return fs.readdirSync(directory)
    .flatMap((name) => {
      const match = /^part-(\d{2,})\.jsonl$/u.exec(name);
      return match ? [{ name, number: Number(match[1]), filePath: path.join(directory, name) }] : [];
    })
    .sort((left, right) => left.number - right.number);
}

function normalizeWord(word) {
  return String(word ?? "").normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

function skeletonRowKey(row) {
  const reuseUids = (Array.isArray(row?.reuse) ? row.reuse : [])
    .map((reuse) => String(reuse?.uid ?? ""))
    .sort();
  return JSON.stringify([
    String(row?.track ?? ""), normalizeWord(row?.word), String(row?.level ?? ""),
    String(row?.source ?? ""), String(row?.freq_rank ?? ""), reuseUids
  ]);
}

function groupByWord(rows, wordGetter) {
  const grouped = new Map();
  for (const row of rows) {
    const key = normalizeWord(wordGetter(row));
    const group = grouped.get(key) ?? [];
    group.push(row);
    grouped.set(key, group);
  }
  return grouped;
}

function addInflections(word) {
  const normalized = normalizeWord(word);
  const forms = new Set([normalized]);
  if (POSITIVE_USAGE.has(normalized)) {
    for (const form of POSITIVE_USAGE.get(normalized)) forms.add(form);
  }
  if (/\s/u.test(normalized) || !/^[a-z]+$/u.test(normalized)) return forms;

  const final = normalized.at(-1);
  const consonantY = /[^aeiou]y$/u.test(normalized);
  const cvc = (normalized.length <= 4 && /[^aeiou][aeiou][^aeiouwxy]$/u.test(normalized) && !normalized.endsWith("ck")) ||
    DOUBLE_FINAL_CONSONANT.has(normalized);

  forms.add(consonantY ? `${normalized.slice(0, -1)}ies` : /(?:s|x|z|ch|sh)$/u.test(normalized) ? `${normalized}es` : `${normalized}s`);
  forms.add(normalized.endsWith("e") ? `${normalized}d` : consonantY ? `${normalized.slice(0, -1)}ied` : cvc ? `${normalized}${final}ed` : `${normalized}ed`);
  forms.add(normalized.endsWith("ie") ? `${normalized.slice(0, -2)}ying` : normalized.endsWith("e") ? `${normalized.slice(0, -1)}ing` : cvc ? `${normalized}${final}ing` : `${normalized}ing`);
  forms.add(consonantY ? `${normalized.slice(0, -1)}ier` : `${normalized}er`);
  forms.add(consonantY ? `${normalized.slice(0, -1)}iest` : `${normalized}est`);
  if (normalized === "cancel") {
    for (const form of ["canceled", "cancelled", "canceling", "cancelling"]) forms.add(form);
  }
  return forms;
}

export function exampleContainsWord(example, word) {
  const normalizedExample = String(example ?? "").toLocaleLowerCase("en-US").replace(/\s+/gu, " ");
  const forms = addInflections(word);
  for (const form of forms) {
    const escaped = form.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const expression = new RegExp(`(^|[^a-z])${escaped}(?=$|[^a-z])`, "iu");
    if (expression.test(normalizedExample)) return true;
  }
  return false;
}

function isPhrase(baseRow, word) {
  return String(baseRow?.source ?? "") === "old-phrase" ||
    String(baseRow?.level ?? "").includes("片語") || /\s/u.test(String(word ?? "").trim());
}

function levelForOutput(baseRow, outputRow, word, errors, label) {
  const phrase = isPhrase(baseRow, word);
  if (phrase) {
    const group = String(outputRow?.group ?? "").trim();
    if (!PHRASE_GROUPS.has(group)) {
      errors.push(`${label}: phrase group '${group || "(empty)"}' is not one of the approved groups.`);
      return "";
    }
    return `片語：${group}`;
  }
  const expectedLevel = String(baseRow?.level ?? "").trim();
  const outputLevel = String(outputRow?.level ?? "").trim();
  if (!outputLevel) errors.push(`${label}: level is missing.`);
  else if (outputLevel !== expectedLevel) {
    errors.push(`${label}: level '${outputLevel}' differs from skeleton level '${expectedLevel}'.`);
  }
  return expectedLevel;
}

function validateKeepOutput({ track, baseRow, outputRow, word, label, errors }) {
  if (!Array.isArray(outputRow?.senses) || outputRow.senses.length < 1 || outputRow.senses.length > 3) {
    errors.push(`${label}: keep row must have between one and three senses.`);
  } else {
    const senseErrors = validateSenseRow({ senses: outputRow.senses }, label);
    errors.push(...senseErrors);
    outputRow.senses.forEach((sense, index) => {
      if (!VALID_POS_CODES.includes(sense?.pos)) {
        errors.push(`${label}: sense ${index + 1} has an invalid POS code ${JSON.stringify(sense?.pos)}.`);
      }
      for (const field of ["meaning_zh", "meaning_ja", "meaning_ko"]) {
        if (typeof sense?.[field] !== "string" || !sense[field].trim()) {
          errors.push(`${label}: sense ${index + 1} ${field} must be a non-empty string.`);
        }
      }
    });
  }

  for (const field of ["example_en", "example_zh", "example_ja", "example_ko"]) {
    if (typeof outputRow?.[field] !== "string" || !outputRow[field].trim()) {
      errors.push(`${label}: ${field} must be a non-empty string.`);
    }
  }
  if (typeof outputRow?.example_en === "string" && outputRow.example_en.trim() && !exampleContainsWord(outputRow.example_en, word)) {
    errors.push(`${label}: English example does not contain '${word}' or a supported inflection.`);
  }
  if (!Number.isInteger(outputRow?.example_sense) || outputRow.example_sense < 0 || outputRow.example_sense >= (outputRow.senses?.length ?? 0)) {
    errors.push(`${label}: example_sense must refer to an existing sense.`);
  }
  if (outputRow?.decision !== "keep" && outputRow?.decision !== "drop") {
    errors.push(`${label}: decision must be 'keep' or 'drop'.`);
  }
  if (baseRow?.track && baseRow.track !== track) {
    errors.push(`${label}: skeleton track '${baseRow.track}' differs from requested track '${track}'.`);
  }
}

function trackDefinition(track) {
  return TRACK_DEFINITIONS.find((definition) => definition.id === track && definition.available);
}

function readSourceRowsByTrack(dataDirectory) {
  const sourceRowsByTrack = new Map();
  for (const definition of TRACK_DEFINITIONS.filter((item) => item.available)) {
    const filePath = path.join(dataDirectory, "data", `${definition.id}.jsonl`);
    sourceRowsByTrack.set(definition.id, readJsonl(filePath, `source ${definition.id}`).map(({ record }) => record));
  }
  return sourceRowsByTrack;
}

function copyJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeUid({ track, level, word, senses, example, reservedUids }) {
  const meaning = formatSensesField(senses, "meaning_zh", { includePos: false });
  const base = buildStableVocabularyId(level, word, meaning);
  if (!reservedUids.has(base)) return base;

  const disambiguated = buildDisambiguatedVocabularyId(level, word, meaning, example);
  if (!reservedUids.has(disambiguated)) return disambiguated;

  let suffix = 2;
  while (reservedUids.has(`${disambiguated}-${suffix}`)) suffix += 1;
  return `${disambiguated}-${suffix}`;
}

function buildVocabularyRow({ track, baseRow, reuse, outputRow, level, uid, dictionary }) {
  const row = reuse ? copyJson(reuse) : {
    track,
    word: String(baseRow.word).trim(),
    uid,
    pos: "",
    kk: "",
    ipa_us: "",
    ipa_uk: ""
  };

  row.track = track;
  row.word = String(baseRow.word).trim();
  row.level = level;
  row.senses = copyJson(outputRow.senses);
  row.example_en = outputRow.example_en.trim();
  row.example_zh = outputRow.example_zh.trim();
  row.example_ja = outputRow.example_ja.trim();
  row.example_ko = outputRow.example_ko.trim();
  row.example_sense = outputRow.example_sense;
  if (!reuse) {
    const pronunciation = /\s/u.test(row.word) ? null : dictionary.get(row.word.toLocaleLowerCase("en-US"))?.[0];
    row.ipa_us = pronunciation ? arpabetToIpa(pronunciation.arpabet) : "";
    row.ipa_uk = "";
  }
  syncCompatibilityFieldsFromSenses(row);
  row.legacy_display = snapshotLegacyDisplay(row);
  return row;
}

function normalizedExample(example) {
  return String(example ?? "").trim().toLocaleLowerCase("en-US").replace(/\s+/gu, " ");
}

function validateNoSharedExamples({ track, plannedItems, originalRows, affectedUids, errors }) {
  const existingExamples = new Map();
  for (const row of originalRows) {
    if (affectedUids.has(row.uid)) continue;
    const key = normalizedExample(row.example_en);
    if (key) existingExamples.set(key, { uid: row.uid, word: row.word, source: "current source" });
  }

  const plannedExamples = new Map();
  for (const item of plannedItems) {
    const example = String(item.outputRow?.example_en ?? "").trim();
    const key = normalizedExample(example);
    if (!key || item.outputRow?.decision !== "keep") continue;
    const current = plannedExamples.get(key) ?? existingExamples.get(key);
    if (current) {
      errors.push(`${item.label}: shared English example in '${track}' with '${current.word}' (${current.uid || current.source}).`);
    } else {
      plannedExamples.set(key, { uid: item.uid ?? "", word: item.word, source: item.label });
    }
  }
}

function getLevelCounts(rows) {
  const counts = new Map();
  for (const row of rows) {
    if (row.decision === "drop") continue;
    const level = String(row.level ?? "").trim();
    if (level) counts.set(level, (counts.get(level) ?? 0) + 1);
  }
  return [...counts.entries()].map(([level, count]) => ({ level, count }));
}

export function planVocabularyRebuild({
  track,
  directory,
  dataDirectory,
  projectRoot = process.cwd(),
  taskInputDirectory = path.join(projectRoot, TASK_INPUT_DIRECTORY),
  allowPartial = false,
  dryRun = true,
  cmudictPath = path.join(dataDirectory, "sources", "cmudict", "cmudict.dict")
} = {}) {
  if (!REBUILD_TRACKS.has(track) || !trackDefinition(track)) {
    throw new Error(`Unsupported rebuild track '${track}'.`);
  }
  if (allowPartial && !dryRun) throw new Error("--allow-partial is only allowed with --dry-run.");

  const outputDirectory = path.resolve(directory ?? "");
  const dataRoot = path.resolve(dataDirectory ?? "");
  const taskRoot = path.resolve(taskInputDirectory);
  const partsDirectory = path.join(taskRoot, "parts", track);
  const skeletonFile = path.join(taskRoot, "skeleton", `${track}.jsonl`);
  const skeletonParts = exactPartFiles(partsDirectory);
  const outputParts = exactPartFiles(outputDirectory);
  const expectedPartNumbers = new Set(skeletonParts.map((part) => part.number));
  const expectedOutputNumbers = new Set(outputParts.map((part) => part.number));
  const unexpectedParts = outputParts.filter((part) => !expectedPartNumbers.has(part.number));
  if (unexpectedParts.length) {
    throw new Error(`Output contains unknown part file(s): ${unexpectedParts.map((part) => part.name).join(", ")}.`);
  }

  const missingParts = skeletonParts.filter((part) => !expectedOutputNumbers.has(part.number));
  if (missingParts.length && !allowPartial) {
    throw new Error(
      `Output is incomplete: ${outputParts.length}/${skeletonParts.length} complete part files; missing ${missingParts.map((part) => part.name).join(", ")}. Use --allow-partial with --dry-run for test runs only.`
    );
  }
  if (allowPartial && !dryRun) throw new Error("Partial rebuilds cannot be written.");

  const fullSkeleton = readJsonl(skeletonFile, `skeleton ${track}`).map(({ record }) => record);
  const partRowsByNumber = new Map();
  const fullIndicesByKey = new Map();
  fullSkeleton.forEach((row, index) => {
    const key = skeletonRowKey(row);
    const indexes = fullIndicesByKey.get(key) ?? [];
    indexes.push(index);
    fullIndicesByKey.set(key, indexes);
  });

  const sourceRowsByTrack = readSourceRowsByTrack(dataRoot);
  const originalRows = sourceRowsByTrack.get(track);
  const originalByUid = new Map(originalRows.map((row) => [String(row.uid ?? ""), row]));
  const aliasesPath = path.join(dataRoot, "data", "uid-aliases.json");
  const aliasData = fs.existsSync(aliasesPath) ? readUidAliasData(dataRoot) : emptyUidAliasData();
  validateVocabularyUidState({ sourceRowsByTrack, aliasData });

  const errors = [];
  const skeletonUidToReuse = new Map();
  const allPartRows = [];
  for (const part of skeletonParts) {
    const rows = readJsonl(part.filePath, `${track} skeleton ${part.name}`).map(({ record }) => record);
    partRowsByNumber.set(part.number, rows);
    for (const row of rows) {
      for (const reuse of Array.isArray(row.reuse) ? row.reuse : []) {
        const uid = String(reuse?.uid ?? "").trim();
        if (!uid) {
          errors.push(`${part.name}: skeleton reuse row for '${row.word}' is missing uid.`);
          continue;
        }
        if (skeletonUidToReuse.has(uid)) errors.push(`${part.name}: skeleton repeats uid '${track}/${uid}'.`);
        skeletonUidToReuse.set(uid, { row, reuse });
        if (!originalByUid.has(uid)) errors.push(`${part.name}: skeleton uid '${track}/${uid}' is absent from the data repo.`);
      }
      allPartRows.push({ partNumber: part.number, row });
    }
  }

  const sourceUids = new Set(originalByUid.keys());
  for (const uid of sourceUids) {
    if (uid && !skeletonUidToReuse.has(uid)) {
      errors.push(`Source uid '${track}/${uid}' is not represented by the rebuild skeleton; refusing to drop an unlisted row.`);
    }
  }

  const remainingFullIndexes = new Map([...fullIndicesByKey.entries()].map(([key, indexes]) => [key, [...indexes]]));
  const fullIndexByPartRow = new Map();
  for (const { partNumber, row } of allPartRows) {
    const key = skeletonRowKey(row);
    const available = remainingFullIndexes.get(key) ?? [];
    const fullIndex = available.shift();
    if (fullIndex === undefined) {
      errors.push(`parts/${track}/part-${String(partNumber).padStart(2, "0")}.jsonl row '${row.word}' is absent from skeleton/${track}.jsonl.`);
    } else {
      fullIndexByPartRow.set(row, fullIndex);
    }
  }
  for (const [key, indexes] of remainingFullIndexes) {
    if (indexes.length) errors.push(`skeleton/${track}.jsonl has ${indexes.length} row(s) not present in parts; signature ${key}.`);
  }

  const plannedByFullIndex = new Map();
  const affectedUids = new Set();
  const plannedItems = [];
  let parsedOutputRows = 0;

  for (const outputPart of outputParts) {
    const baseRows = partRowsByNumber.get(outputPart.number) ?? [];
    const baseByWord = groupByWord(baseRows, (row) => row.word);
    const outputEntries = readJsonl(outputPart.filePath, `output ${outputPart.name}`);
    const outputRows = outputEntries.map(({ record }) => record);
    parsedOutputRows += outputRows.length;
    const outputByWord = groupByWord(outputRows, (row) => row.word);

    for (const outputWord of outputByWord.keys()) {
      if (!baseByWord.has(outputWord)) {
        errors.push(`${outputPart.name}: word '${outputWord}' is not present in the matching skeleton part.`);
      }
    }

    for (const [wordKey, baseWordRows] of baseByWord) {
      const outputWordRows = outputByWord.get(wordKey) ?? [];
      const expectedItems = [];
      for (const baseRow of baseWordRows) {
        const fullIndex = fullIndexByPartRow.get(baseRow);
        const reuses = Array.isArray(baseRow.reuse) ? baseRow.reuse : [];
        if (!reuses.length) {
          expectedItems.push({ baseRow, fullIndex, reuse: null, uid: "" });
        } else {
          for (const reuse of reuses) {
            expectedItems.push({ baseRow, fullIndex, reuse, uid: String(reuse?.uid ?? "").trim() });
          }
        }
      }

      const receivedUids = outputWordRows.map((row) => String(row?.uid ?? "").trim()).sort();
      const expectedUids = expectedItems.map((item) => item.uid).sort();
      if (JSON.stringify(receivedUids) !== JSON.stringify(expectedUids)) {
        errors.push(
          `${outputPart.name}: UID cross-check failed for '${wordKey}': expected [${expectedUids.map((uid) => uid || "(empty)").join(", ")}], received [${receivedUids.map((uid) => uid || "(empty)").join(", ")}].`
        );
      }
      if (outputWordRows.length !== expectedItems.length) {
        errors.push(`${outputPart.name}: '${wordKey}' has ${outputWordRows.length} output row(s), expected ${expectedItems.length} from the skeleton.`);
        continue;
      }

      const usedOutputRows = new Set();
      for (const expected of expectedItems) {
        const candidates = outputWordRows.filter((row) =>
          !usedOutputRows.has(row) &&
          String(row?.level ?? "").trim() === String(expected.baseRow?.level ?? "").trim()
        );
        let match = candidates.length === 1 ? candidates[0] : null;
        if (!match && expectedItems.length === 1 && outputWordRows.length === 1) match = outputWordRows[0];
        if (!match) {
          errors.push(`${outputPart.name}: cannot unambiguously pair '${wordKey}' with the skeleton row by word and level; output UID is only a cross-check.`);
          continue;
        }
        usedOutputRows.add(match);

        const lineNumber = outputEntries.find((entry) => entry.record === match)?.lineNumber ?? "?";
        const label = `${outputPart.name}:${lineNumber} '${String(match.word ?? wordKey)}'`;
        if (normalizeWord(match.word) !== normalizeWord(expected.baseRow.word)) {
          errors.push(`${label}: word differs from skeleton word '${expected.baseRow.word}'.`);
        }
        const receivedUid = String(match?.uid ?? "").trim();
        if (receivedUid !== expected.uid) {
          errors.push(`${label}: UID mismatch; expected '${expected.uid || "(empty)"}', received '${receivedUid || "(empty)"}'.`);
        }
        if (match.decision !== "keep" && match.decision !== "drop") {
          errors.push(`${label}: decision must be 'keep' or 'drop'.`);
        }
        const level = match.decision === "keep"
          ? levelForOutput(expected.baseRow, match, expected.baseRow.word, errors, label)
          : String(expected.baseRow?.level ?? "").trim();
        if (match.decision === "drop" && String(match.level ?? "").trim() && String(match.level).trim() !== level) {
          errors.push(`${label}: level '${String(match.level).trim()}' differs from skeleton level '${level}'.`);
        }
        if (match.decision === "keep") {
          validateKeepOutput({ track, baseRow: expected.baseRow, outputRow: match, word: expected.baseRow.word, label, errors });
        }
        if (expected.uid) affectedUids.add(expected.uid);
        const item = {
          track,
          partNumber: outputPart.number,
          label,
          baseRow: expected.baseRow,
          fullIndex: expected.fullIndex,
          reuse: expected.reuse,
          uid: expected.uid,
          word: String(expected.baseRow.word).trim(),
          level,
          outputRow: match
        };
        plannedItems.push(item);
        if (Number.isInteger(expected.fullIndex)) {
          const rows = plannedByFullIndex.get(expected.fullIndex) ?? [];
          rows.push(item);
          plannedByFullIndex.set(expected.fullIndex, rows);
        }
      }
    }
  }

  validateNoSharedExamples({ track, plannedItems, originalRows, affectedUids, errors });
  if (errors.length) {
    const candidateKept = plannedItems.filter((item) => item.outputRow?.decision === "keep");
    const candidateLevels = new Map();
    for (const item of candidateKept) candidateLevels.set(item.level, (candidateLevels.get(item.level) ?? 0) + 1);
    const levelSummary = [...candidateLevels.entries()].map(([level, count]) => `  ${level}: ${count}`).join("\n") || "  (none)";
    const candidateUpdated = candidateKept.filter((item) => item.uid).length;
    const candidateDeleted = plannedItems.filter((item) => item.outputRow?.decision === "drop" && item.uid).length;
    const candidateAdded = candidateKept.filter((item) => !item.uid).length;
    const candidateSummary = [
      `Candidate stats (not applied): parts ${outputParts.length}/${skeletonParts.length}; rows ${parsedOutputRows}.`,
      `Candidate updated: ${candidateUpdated}; deleted: ${candidateDeleted}; added: ${candidateAdded}.`,
      "Candidate kept rows by level:",
      levelSummary,
      "No data files were written."
    ].join("\n");
    throw new Error(`Rebuild validation failed (${errors.length} issue(s)).\n${candidateSummary}\n- ${errors.join("\n- ")}`);
  }

  const dictionaryText = fs.readFileSync(cmudictPath, "utf8");
  const dictionary = parseCmuDictionary(dictionaryText);
  const sourceUidSet = new Set(originalRows.map((row) => String(row.uid ?? "")));
  const historicalUidSet = new Set([
    ...aliasData.deleted.filter((record) => record.track === track).map((record) => record.uid),
    ...aliasData.aliases.filter((record) => record.track === track).map((record) => record.aliasUid)
  ]);
  const reservedUids = new Set([...sourceUidSet, ...historicalUidSet]);
  const keptOldUids = new Set();
  const droppedUids = [];
  const addedUids = [];
  const builtRowsByFullIndex = new Map();
  const processedRows = [];

  for (const item of plannedItems) {
    if (item.outputRow.decision === "drop") {
      if (item.uid) droppedUids.push(item.uid);
      processedRows.push({ ...item, decision: "drop" });
      continue;
    }
    let uid = item.uid;
    if (item.reuse) {
      keptOldUids.add(uid);
    } else {
      uid = makeUid({
        track,
        level: item.level,
        word: item.word,
        senses: item.outputRow.senses,
        example: item.outputRow.example_en,
        reservedUids
      });
      reservedUids.add(uid);
      addedUids.push(uid);
    }
    const sourceRow = item.reuse ? originalByUid.get(item.uid) : null;
    const row = buildVocabularyRow({
      track,
      baseRow: item.baseRow,
      reuse: sourceRow,
      outputRow: item.outputRow,
      level: item.level,
      uid,
      dictionary
    });
    processedRows.push({ ...item, uid, decision: "keep", row });
    const rows = builtRowsByFullIndex.get(item.fullIndex) ?? [];
    rows.push({ ...item, uid, decision: "keep", row });
    builtRowsByFullIndex.set(item.fullIndex, rows);
  }

  const fullRebuild = missingParts.length === 0;
  const plannedFinalRows = [];
  if (fullRebuild) {
    for (const [index, skeletonRow] of fullSkeleton.entries()) {
      const items = builtRowsByFullIndex.get(index) ?? [];
      const expectedCount = (Array.isArray(skeletonRow.reuse) && skeletonRow.reuse.length) ? skeletonRow.reuse.length : 1;
      if (!plannedByFullIndex.has(index)) {
        throw new Error(`Full rebuild is missing output for skeleton row '${skeletonRow.word}'.`);
      }
      const decisions = plannedByFullIndex.get(index) ?? [];
      if (decisions.length !== expectedCount) {
        throw new Error(`Full rebuild has ${decisions.length} mapped row(s) for '${skeletonRow.word}', expected ${expectedCount}.`);
      }
      plannedFinalRows.push(...items.map((item) => item.row).filter(Boolean));
    }
  } else {
    const updatesByUid = new Map(processedRows.filter((item) => item.uid && item.decision === "keep").map((item) => [item.uid, item.row]));
    const drops = new Set(droppedUids);
    for (const row of originalRows) {
      if (drops.has(row.uid)) continue;
      plannedFinalRows.push(updatesByUid.get(row.uid) ?? copyJson(row));
    }
    for (const item of processedRows.filter((entry) => entry.decision === "keep" && !entry.reuse)) plannedFinalRows.push(item.row);
  }

  const updatedSourceRowsByTrack = new Map(sourceRowsByTrack);
  updatedSourceRowsByTrack.set(track, plannedFinalRows);
  const finalUidsByTrack = validateVocabularyUidState({
    sourceRowsByTrack: updatedSourceRowsByTrack,
    aliasData: { aliases: [...aliasData.aliases], deleted: [...aliasData.deleted] }
  }).uidsByTrack;
  let nextAliasData = { aliases: [...aliasData.aliases], deleted: [...aliasData.deleted] };
  for (const uid of droppedUids) {
    nextAliasData = recordDeletedUid(nextAliasData, {
      track,
      uid,
      reason: "rebuild 10/23",
      uidsByTrack: finalUidsByTrack
    });
  }
  validateVocabularyUidState({ sourceRowsByTrack: updatedSourceRowsByTrack, aliasData: nextAliasData });

  const stats = {
    updated: keptOldUids.size,
    deleted: droppedUids.length,
    added: addedUids.length,
    partsDone: outputParts.length,
    partsTotal: skeletonParts.length,
    processedRows: parsedOutputRows,
    levelCounts: getLevelCounts(processedRows)
  };

  return {
    track,
    dataRoot,
    outputDirectory,
    fullRebuild,
    dryRun,
    stats,
    updatedRowsByTrack: updatedSourceRowsByTrack,
    aliasData: nextAliasData,
    rows: plannedFinalRows,
    changedFiles: [
      path.join(dataRoot, "data", `${track}.jsonl`),
      ...(JSON.stringify(nextAliasData) !== JSON.stringify(aliasData) ? [aliasesPath] : [])
    ]
  };
}

export function writeVocabularyRebuildPlan(plan) {
  if (!plan?.fullRebuild) throw new Error("A partial rebuild plan cannot be written.");
  const sourceRowsByTrack = readSourceRowsByTrack(plan.dataRoot);
  sourceRowsByTrack.set(plan.track, plan.rows);
  const originalTrackPath = path.join(plan.dataRoot, "data", `${plan.track}.jsonl`);
  const originalText = fs.readFileSync(originalTrackPath, "utf8");
  const newline = originalText.includes("\r\n") ? "\r\n" : "\n";
  const nextText = `${plan.rows.map((row) => JSON.stringify(row)).join(newline)}${newline}`;
  fs.writeFileSync(originalTrackPath, nextText, "utf8");

  const aliasesPath = path.join(plan.dataRoot, "data", "uid-aliases.json");
  const oldAliasesText = fs.existsSync(aliasesPath) ? fs.readFileSync(aliasesPath, "utf8") : "";
  const nextAliasesText = `${JSON.stringify(plan.aliasData, null, 2)}\n`;
  if (oldAliasesText !== nextAliasesText) fs.writeFileSync(aliasesPath, nextAliasesText, "utf8");
  return { files: plan.changedFiles };
}

export function formatRebuildSummary(plan) {
  const mode = plan.fullRebuild ? (plan.dryRun ? "dry-run" : "apply") : "partial dry-run";
  const levelCounts = plan.stats.levelCounts.length
    ? plan.stats.levelCounts.map(({ level, count }) => `  ${level}: ${count}`).join("\n")
    : "  (none)";
  return [
    `Vocabulary rebuild ${mode}: ${plan.track}`,
    `Output parts: ${plan.stats.partsDone}/${plan.stats.partsTotal}; rows: ${plan.stats.processedRows}`,
    `Updated: ${plan.stats.updated}; deleted: ${plan.stats.deleted}; added: ${plan.stats.added}`,
    "Kept output rows by level:",
    levelCounts,
    plan.dryRun ? "No files were written." : `Updated files: ${plan.changedFiles.map((file) => path.relative(plan.dataRoot, file)).join(", ")}`
  ].join("\n");
}

export function runVocabularyRebuild(options) {
  const plan = planVocabularyRebuild(options);
  if (!plan.dryRun) writeVocabularyRebuildPlan(plan);
  console.log(formatRebuildSummary(plan));
  return plan;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
    } else {
      runVocabularyRebuild(options);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
