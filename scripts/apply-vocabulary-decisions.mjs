import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import xlsx from "xlsx";
import {
  findSourceWorkbookPath,
  TRACK_DEFINITIONS
} from "./vocabulary-source-definitions.mjs";
import {
  parseTrailingTranslation,
  readTrackSourceRows
} from "./check-vocabulary-content.mjs";

const ROOT = process.cwd();
const TASK_ROOT = path.join(ROOT, "docs", "tasks", "vocab-review-20261021");
const PARTS_ROOT = path.join(TASK_ROOT, "parts");
const DECISIONS_ROOT = path.join(TASK_ROOT, "judge");
const XLSX_PATCHER_PATH = path.join(ROOT, "scripts", "patch-xlsx-cell-values.py");

const DEFAULT_BACKUP_DIR = "backup-round3";
const DEFAULT_REPORT_PATH = "writeback-round3-report.md";
const DEFAULT_TRACK_CONFIGS = [
  {
    id: "toeic",
    expected: 469,
    expectedParts: 11,
    statuses: { accept: 309, revise: 160, reject: 0 }
  }
];

const FINAL_FIELDS = new Set(["word", "meaning", "example_en", "example_zh"]);

function asText(value) {
  return String(value ?? "");
}

function trimText(value) {
  return asText(value).trim();
}

export function normalizeWord(value) {
  return trimText(value).toLowerCase().replace(/\s+/gu, " ");
}

export function formatBilingualExample(english, chinese) {
  const normalizedEnglish = trimText(english);
  const normalizedChinese = trimText(chinese);
  if (normalizedEnglish && normalizedChinese) {
    return `${normalizedEnglish} (${normalizedChinese})`;
  }
  return normalizedEnglish || normalizedChinese;
}

export function splitToeicMeaning(value, currentPos = "") {
  const match = /^([A-Za-z]+(?:\s*\/\s*[A-Za-z]+)*)\.\s+([\s\S]*)$/u.exec(value);
  if (!match) {
    if (trimText(currentPos)) {
      throw new Error("TOEIC meaning updates must include a part-of-speech prefix.");
    }
    return { pos: "", meaning: value };
  }

  const pos = match[1].replace(/\s+/gu, " ").trim();
  const meaning = match[2];
  if (`${pos}. ${meaning}` !== value) {
    throw new Error("TOEIC meaning updates must use one space after the part-of-speech prefix.");
  }
  return { pos, meaning };
}

function fileHash(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readJsonLines(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing JSONL file: ${path.relative(ROOT, filePath)}`);
  }
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid JSON in ${path.relative(ROOT, filePath)} line ${index + 1}: ${error.message}`);
      }
    });
}

function sortedPartFiles(directory, pattern) {
  if (!fs.existsSync(directory)) {
    throw new Error(`Missing directory: ${path.relative(ROOT, directory)}`);
  }
  return fs.readdirSync(directory)
    .filter((name) => pattern.test(name))
    .sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
}

function loadTrackInputs(config) {
  const partDir = path.join(PARTS_ROOT, config.id);
  const decisionDir = path.join(DECISIONS_ROOT, config.id);
  const partFiles = sortedPartFiles(partDir, /^part-\d+\.jsonl$/u);
  const decisionFiles = sortedPartFiles(decisionDir, /^part-\d+\.decisions\.jsonl$/u);
  if (partFiles.length !== config.expectedParts || decisionFiles.length !== config.expectedParts) {
    throw new Error(`${config.id} must have ${config.expectedParts} part and decision files; found ${partFiles.length} and ${decisionFiles.length}.`);
  }

  const partRecords = [];
  const decisions = [];
  const partIds = new Set();
  for (const partFile of partFiles) {
    for (const record of readJsonLines(path.join(partDir, partFile))) {
      if (record.track !== config.id || !record.id) {
        throw new Error(`Unexpected part record in ${config.id}/${partFile}.`);
      }
      if (partIds.has(record.id)) {
        throw new Error(`Duplicate part id in ${config.id}: ${record.id}.`);
      }
      partIds.add(record.id);
      partRecords.push(record);
    }
  }

  const decisionIds = new Set();
  for (const decisionFile of decisionFiles) {
    const partFile = decisionFile.replace(/\.decisions\.jsonl$/u, ".jsonl");
    if (!partFiles.includes(partFile)) {
      throw new Error(`Decision file has no matching part file: ${config.id}/${decisionFile}.`);
    }
    for (const decision of readJsonLines(path.join(decisionDir, decisionFile))) {
      if (decisionIds.has(decision.id)) {
        throw new Error(`Duplicate decision id in ${config.id}: ${decision.id}.`);
      }
      decisionIds.add(decision.id);
      decisions.push(decision);
    }
  }

  const statusCounts = { accept: 0, revise: 0, reject: 0 };
  for (const decision of decisions) {
    if (!Object.hasOwn(statusCounts, decision.decision)) {
      throw new Error(`Unknown decision for ${config.id}/${decision.id}: ${decision.decision}.`);
    }
    statusCounts[decision.decision] += 1;
  }
  if (decisions.length !== config.expected) {
    throw new Error(`Expected ${config.expected} ${config.id} decisions, found ${decisions.length}.`);
  }
  for (const [status, expected] of Object.entries(config.statuses)) {
    if (statusCounts[status] !== expected) {
      throw new Error(`Expected ${expected} ${config.id} ${status} decisions, found ${statusCounts[status]}.`);
    }
  }

  return { partRecords, decisions, statusCounts };
}

function sourceContentKey(record) {
  return JSON.stringify([
    trimText(record.word),
    trimText(record.meaning),
    trimText(record.example)
  ]);
}

export function mapDecisionsToSources({ track, decisions, partRecords, sourceRecords }) {
  const partById = new Map(partRecords.map((record) => [record.id, record]));
  const sourcesByContent = new Map();
  for (const sourceRecord of sourceRecords) {
    const key = sourceContentKey(sourceRecord);
    const matches = sourcesByContent.get(key) ?? [];
    matches.push(sourceRecord);
    sourcesByContent.set(key, matches);
  }

  const mapped = [];
  const notWritten = [];
  for (const decision of decisions) {
    const part = partById.get(decision.id);
    if (!part) {
      throw new Error(`Decision id is missing from ${track} parts: ${decision.id}.`);
    }
    if (normalizeWord(decision.word) !== normalizeWord(part.word)) {
      throw new Error(`Decision word does not match its part record: ${track}/${decision.id}.`);
    }
    if (decision.decision === "reject") {
      notWritten.push({
        track,
        id: decision.id,
        word: part.word,
        reason: `判讀為 reject：${trimText(decision.reason) || "維持原值"}`
      });
      continue;
    }

    const final = decision.final ?? {};
    const unknownFields = Object.keys(final).filter((field) => !FINAL_FIELDS.has(field));
    if (unknownFields.length) {
      throw new Error(`Unsupported final field(s) for ${track}/${decision.id}: ${unknownFields.join(", ")}.`);
    }
    for (const [field, value] of Object.entries(final)) {
      if (typeof value !== "string") {
        throw new Error(`Final ${field} must be text for ${track}/${decision.id}.`);
      }
    }
    if (!Object.keys(final).length) {
      notWritten.push({ track, id: decision.id, word: part.word, reason: "final 沒有指定要修改的欄位。" });
      continue;
    }

    const matches = sourcesByContent.get(sourceContentKey(part)) ?? [];
    if (matches.length > 1) {
      notWritten.push({
        track,
        id: decision.id,
        word: part.word,
        reason: `來源工作簿有 ${matches.length} 列內容完全相同，無法唯一對應列號；為避免改錯列而未寫回。`
      });
      continue;
    }

    let sourceRecord;
    let exampleSourceRecords;
    if (matches.length === 1) {
      sourceRecord = matches[0];
      exampleSourceRecords = [sourceRecord];
      const parsedPartExample = parseTrailingTranslation(part.example);
      if (
        trimText(sourceRecord.word) !== trimText(part.word)
        || trimText(sourceRecord.meaning) !== trimText(part.meaning)
        || trimText(sourceRecord.englishExample) !== trimText(parsedPartExample.english)
        || trimText(sourceRecord.chineseTranslation) !== trimText(parsedPartExample.translation)
      ) {
        throw new Error(`Mapped source values diverge from the part record: ${track}/${decision.id}.`);
      }
    } else if (track === "gept-high-intermediate") {
      const groupedRecords = sourceRecords
        .filter((record) =>
          normalizeWord(record.word) === normalizeWord(part.word)
          && trimText(record.exportLevel) === trimText(part.level)
        )
        .sort((left, right) => left.row - right.row);
      const groupedMeanings = [...new Set(groupedRecords.map((record) => trimText(record.meaning)))]
        .join("\n");
      if (
        groupedRecords.length < 2
        || groupedMeanings !== trimText(part.meaning)
        || trimText(groupedRecords[0].example) !== trimText(part.example)
        || Object.hasOwn(final, "word")
        || Object.hasOwn(final, "meaning")
      ) {
        throw new Error(`Could not safely map grouped GEPT source rows: ${track}/${decision.id} (${part.word}).`);
      }
      sourceRecord = groupedRecords[0];
      exampleSourceRecords = groupedRecords;
    } else {
      throw new Error(`Could not map part record to a source workbook row: ${track}/${decision.id} (${part.word}).`);
    }

    mapped.push({ track, decision, part, sourceRecord, exampleSourceRecords, final, writtenFields: [] });
  }
  return { mapped, notWritten };
}

export function findWordCollisionBlocks(sourceRecords, mappedDecisions) {
  const active = new Map();
  const mappedBySourceId = new Map();
  for (const item of mappedDecisions) {
    mappedBySourceId.set(item.sourceRecord.id, item);
    if (Object.hasOwn(item.final, "word") && item.final.word !== item.sourceRecord.word) {
      active.set(item.sourceRecord.id, item);
    }
  }

  const blocked = new Map();
  while (true) {
    const groups = new Map();
    for (const record of sourceRecords) {
      const candidate = active.get(record.id);
      const word = candidate ? candidate.final.word : record.word;
      const key = normalizeWord(word);
      if (!key) {
        continue;
      }
      const group = groups.get(key) ?? [];
      group.push({ record, candidate });
      groups.set(key, group);
    }

    const newlyBlocked = [];
    for (const [wordKey, group] of groups) {
      if (group.length < 2) {
        continue;
      }
      for (const member of group) {
        if (member.candidate) {
          const conflicts = group
            .filter((other) => other.record.id !== member.record.id)
            .map((other) => `${other.record.word} (${other.record.worksheet}!${other.record.row})`);
          newlyBlocked.push({
            sourceId: member.record.id,
            item: member.candidate,
            wordKey,
            conflicts
          });
        }
      }
    }
    if (!newlyBlocked.length) {
      break;
    }
    for (const entry of newlyBlocked) {
      if (blocked.has(entry.sourceId)) {
        continue;
      }
      active.delete(entry.sourceId);
      blocked.set(entry.sourceId, {
        item: entry.item,
        reason: `改成「${entry.item.final.word}」會與同辭庫其他詞條重複：${entry.conflicts.join("、")}。`
      });
    }
  }

  const blockedItems = [];
  for (const [sourceId, entry] of blocked) {
    blockedItems.push({ ...entry.item, sourceId, reason: entry.reason });
  }
  return { blockedItems, activeWordDecisionIds: new Set([...active.values()].map((item) => item.decision.id)), mappedBySourceId };
}

function headerColumn(sheet, headerName) {
  const rows = xlsx.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: true
  });
  const index = (rows[0] ?? []).findIndex((header) => asText(header) === headerName);
  if (index < 0) {
    throw new Error(`Could not resolve source workbook header ${headerName}.`);
  }
  return index;
}

function columnForField(definition, sheet, field) {
  const sourceField = field === "example_en" ? "englishExample"
    : field === "example_zh" ? "chineseExample"
      : field;
  if (definition.columnsByHeader) {
    const header = definition.columnsByHeader[sourceField];
    if (!header) {
      throw new Error(`No ${sourceField} header is defined for ${definition.id}.`);
    }
    return headerColumn(sheet, header);
  }
  if (definition.columns?.[sourceField] == null) {
    throw new Error(`No ${sourceField} source column is defined for ${definition.id}.`);
  }
  return definition.columns[sourceField];
}

function combinedExampleColumn(definition, sheet, rowNumber) {
  if (definition.type === "gept-workbook") {
    return definition.columns.fallbackExample;
  }
  if (definition.type !== "level-workbook") {
    throw new Error(`Combined example storage is not supported for ${definition.id}.`);
  }
  const columns = definition.columns;
  const preferred = columns.englishExample;
  const fallback = columns.fallbackExample;
  const preferredAddress = xlsx.utils.encode_cell({ r: rowNumber - 1, c: preferred });
  return trimText(sheet[preferredAddress]?.v) ? preferred : fallback;
}

function fieldOriginalValue(item, field) {
  if (field === "word") return item.sourceRecord.word;
  if (field === "meaning") return item.sourceRecord.meaning;
  if (field === "example_en") return item.sourceRecord.englishExample;
  if (field === "example_zh") return item.sourceRecord.chineseTranslation;
  throw new Error(`Unknown source field: ${field}`);
}

function addCellOperation(operations, item, workbookPath, worksheet, rowNumber, column, field, newValue, sheet) {
  const address = xlsx.utils.encode_cell({ r: rowNumber - 1, c: column });
  const cell = sheet[address];
  const oldValue = asText(cell?.v);
  if (oldValue === newValue) {
    return false;
  }
  if (cell?.f) {
    throw new Error(`Cannot overwrite a formula cell: ${path.basename(workbookPath)}/${worksheet}!${address}.`);
  }
  const key = `${workbookPath}\u0000${worksheet}\u0000${address}`;
  const existing = operations.get(key);
  if (existing && existing.newValue !== newValue) {
    throw new Error(`Conflicting changes planned for ${path.basename(workbookPath)}/${worksheet}!${address}.`);
  }
  if (!existing) {
    operations.set(key, {
      workbookPath,
      relativePath: path.relative(ROOT, workbookPath).replaceAll("\\", "/"),
      worksheet,
      address,
      row: rowNumber,
      column,
      field,
      oldValue,
      newValue,
      decisionId: item.decision.id,
      track: item.track,
      word: item.part.word,
      style: cell?.s ?? null,
      type: cell?.t ?? null,
      formula: cell?.f ?? null
    });
  }
  return true;
}

function buildCellOperations(items, definitionByTrack, workbookStates) {
  const operations = new Map();
  const noChangeItems = [];

  for (const item of items) {
    const definition = definitionByTrack.get(item.track);
    const workbookPath = findSourceWorkbookPath(definition, ROOT);
    const workbook = workbookStates.get(workbookPath).workbook;
    const sheet = workbook.Sheets[item.sourceRecord.worksheet];
    if (!sheet) {
      throw new Error(`Missing worksheet ${item.sourceRecord.worksheet} in ${path.basename(workbookPath)}.`);
    }
    const rowNumber = item.sourceRecord.row;
    let changedAnyCell = false;

    for (const field of ["word", "meaning"]) {
      if (!Object.hasOwn(item.final, field)) {
        continue;
      }
      let newValue = item.final[field];
      if (field === "meaning" && definition.type === "gept-workbook") {
        const posColumn = columnForField(definition, sheet, "pos");
        const meaningColumn = columnForField(definition, sheet, "meaning");
        const posChanged = addCellOperation(
          operations,
          item,
          workbookPath,
          item.sourceRecord.worksheet,
          rowNumber,
          posColumn,
          "pos",
          "",
          sheet
        );
        const meaningChanged = addCellOperation(
          operations,
          item,
          workbookPath,
          item.sourceRecord.worksheet,
          rowNumber,
          meaningColumn,
          field,
          newValue,
          sheet
        );
        changedAnyCell ||= posChanged || meaningChanged;
        if (posChanged || meaningChanged) {
          item.writtenFields.push(field);
        }
        continue;
      }
      if (field === "meaning" && definition.type === "toeic-workbook" && definition.columns.pos != null) {
        const split = splitToeicMeaning(newValue, item.sourceRecord.rawFields?.pos);
        const posColumn = columnForField(definition, sheet, "pos");
        const meaningColumn = columnForField(definition, sheet, field);
        const posChanged = addCellOperation(
          operations,
          item,
          workbookPath,
          item.sourceRecord.worksheet,
          rowNumber,
          posColumn,
          "pos",
          split.pos,
          sheet
        );
        const meaningChanged = addCellOperation(
          operations,
          item,
          workbookPath,
          item.sourceRecord.worksheet,
          rowNumber,
          meaningColumn,
          field,
          split.meaning,
          sheet
        );
        changedAnyCell ||= posChanged || meaningChanged;
        if (posChanged || meaningChanged) {
          item.writtenFields.push(field);
        }
        continue;
      }
      const column = columnForField(definition, sheet, field);
      const changed = addCellOperation(operations, item, workbookPath, item.sourceRecord.worksheet, rowNumber, column, field, newValue, sheet);
      changedAnyCell ||= changed;
      if (changed) {
        item.writtenFields.push(field);
      }
    }

    const hasSeparateExampleColumns = definition.columnsByHeader
      ? Boolean(definition.columnsByHeader.englishExample && definition.columnsByHeader.chineseExample)
      : definition.columns?.englishExample != null && definition.columns?.chineseExample != null;
    const hasExampleUpdate = Object.hasOwn(item.final, "example_en") || Object.hasOwn(item.final, "example_zh");
    if (hasExampleUpdate && hasSeparateExampleColumns) {
      for (const field of ["example_en", "example_zh"]) {
        if (!Object.hasOwn(item.final, field)) {
          continue;
        }
        const column = columnForField(definition, sheet, field);
        const changed = addCellOperation(operations, item, workbookPath, item.sourceRecord.worksheet, rowNumber, column, field, item.final[field], sheet);
        changedAnyCell ||= changed;
        if (changed) {
          item.writtenFields.push(field);
        }
      }
    } else if (hasExampleUpdate) {
      const originalExample = parseTrailingTranslation(item.part.example);
      const english = item.final.example_en ?? originalExample.english;
      const chinese = item.final.example_zh ?? originalExample.translation;
      const newValue = formatBilingualExample(english, chinese);
      const parsed = parseTrailingTranslation(newValue);
      if (formatBilingualExample(parsed.english, parsed.translation) !== newValue) {
        throw new Error(`Combined example does not round-trip through the source parser for ${item.track}/${item.decision.id}.`);
      }
      for (const exampleRecord of item.exampleSourceRecords ?? [item.sourceRecord]) {
        const exampleSheet = workbook.Sheets[exampleRecord.worksheet];
        if (!exampleSheet) {
          throw new Error(`Missing worksheet ${exampleRecord.worksheet} in ${path.basename(workbookPath)}.`);
        }
        const column = combinedExampleColumn(definition, exampleSheet, exampleRecord.row);
        const changed = addCellOperation(
          operations,
          item,
          workbookPath,
          exampleRecord.worksheet,
          exampleRecord.row,
          column,
          "example",
          newValue,
          exampleSheet
        );
        changedAnyCell ||= changed;
      }
      for (const field of ["example_en", "example_zh"]) {
        if (Object.hasOwn(item.final, field) && item.final[field] !== fieldOriginalValue(item, field)) {
          item.writtenFields.push(field);
        }
      }
    }

    item.writtenFields = [...new Set(item.writtenFields)];
    if (!changedAnyCell) {
      noChangeItems.push(item);
    }
  }

  return { operations: [...operations.values()], noChangeItems };
}

function dimensions(columns, mapper) {
  return (columns ?? []).map((entry) => entry == null ? null : mapper(entry));
}

export function workbookSnapshot(workbook) {
  const sheets = new Map();
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const cells = new Map();
    for (const [address, cell] of Object.entries(sheet)) {
      if (!/^[A-Z]+\d+$/u.test(address) || (!Object.hasOwn(cell, "v") && !Object.hasOwn(cell, "f"))) {
        continue;
      }
      const value = cell.v instanceof Date ? { date: cell.v.toISOString() } : cell.v;
      cells.set(address, JSON.stringify({
        value,
        type: cell.t ?? null,
        formula: cell.f ?? null,
        style: cell.s ?? null
      }));
    }
    const widths = dimensions(sheet["!cols"], (column) => ({
      width: column.width ?? null,
      wch: column.wch ?? null,
      wpx: column.wpx ?? null,
      hidden: column.hidden ?? null,
      level: column.level ?? null
    }));
    const heights = dimensions(sheet["!rows"], (row) => ({
      height: row.hpt ?? null,
      hpx: row.hpx ?? null,
      hidden: row.hidden ?? null,
      level: row.level ?? null,
      outlineLevel: row.outlineLevel ?? null,
      collapsed: row.collapsed ?? null
    }));
    sheets.set(sheetName, {
      ref: sheet["!ref"] ?? "",
      cells,
      widths: JSON.stringify(widths),
      heights: JSON.stringify(heights),
      merges: JSON.stringify((sheet["!merges"] ?? []).map((merge) => xlsx.utils.encode_range(merge)))
    });
  }
  return { sheetNames: [...workbook.SheetNames], sheets };
}

export function verifyAgainstSnapshot(baseline, candidate, operations = []) {
  if (JSON.stringify(baseline.sheetNames) !== JSON.stringify(candidate.sheetNames)) {
    throw new Error("Workbook worksheet names or order changed.");
  }
  const expectedBySheet = new Map();
  for (const operation of operations) {
    const entries = expectedBySheet.get(operation.worksheet) ?? new Map();
    entries.set(operation.address, operation);
    expectedBySheet.set(operation.worksheet, entries);
  }

  let changedCells = 0;
  for (const sheetName of baseline.sheetNames) {
    const before = baseline.sheets.get(sheetName);
    const after = candidate.sheets.get(sheetName);
    if (!after) throw new Error(`Worksheet disappeared: ${sheetName}.`);
    if (before.ref !== after.ref) throw new Error(`Worksheet range changed in ${sheetName}: ${before.ref} -> ${after.ref}.`);
    if (before.widths !== after.widths) throw new Error(`Column widths changed in ${sheetName}.`);
    if (before.heights !== after.heights) throw new Error(`Row heights changed in ${sheetName}.`);
    if (before.merges !== after.merges) throw new Error(`Merged cells changed in ${sheetName}.`);

    const expectedCells = expectedBySheet.get(sheetName) ?? new Map();
    const addresses = new Set([...before.cells.keys(), ...after.cells.keys()]);
    for (const address of addresses) {
      const beforeText = before.cells.get(address) ?? null;
      const afterText = after.cells.get(address) ?? null;
      const expected = expectedCells.get(address);
      if (!expected) {
        if (beforeText !== afterText) {
          throw new Error(`Unexpected cell value or style change at ${sheetName}!${address}.`);
        }
        continue;
      }
      const oldState = beforeText ? JSON.parse(beforeText) : null;
      const newState = afterText ? JSON.parse(afterText) : null;
      if (!newState || newState.value !== expected.newValue) {
        throw new Error(`Expected value missing at ${sheetName}!${address}.`);
      }
      const oldStyle = JSON.stringify(oldState?.style ?? null);
      const newStyle = JSON.stringify(newState?.style ?? null);
      if (oldState && (oldState.formula !== newState.formula || oldStyle !== newStyle)) {
        throw new Error(`Cell formula or style changed at ${sheetName}!${address}.`);
      }
      if (!oldState && newState.formula) {
        throw new Error(`Unexpected formula created at ${sheetName}!${address}.`);
      }
      if (oldState?.value !== newState.value) {
        changedCells += 1;
      }
    }
  }
  return {
    expectedCells: operations.length,
    changedCells,
    otherCells: "通過：其餘所有工作表儲存格值相同",
    structure: "通過：工作表、欄寬、列高與合併儲存格相同"
  };
}

function loadWorkbookStates(workbookPaths) {
  const states = new Map();
  for (const workbookPath of workbookPaths) {
    states.set(workbookPath, {
      path: workbookPath,
      workbook: xlsx.readFile(workbookPath, { cellStyles: true, cellNF: true, cellDates: true })
    });
  }
  return states;
}

function buildPlan(trackConfigs = DEFAULT_TRACK_CONFIGS) {
  const definitionByTrack = new Map(TRACK_DEFINITIONS.map((definition) => [definition.id, definition]));
  const trackPlans = [];
  const sourceRecordsByTrack = new Map();
  const allMapped = [];
  const notWritten = [];
  const sourceWorkbookPaths = new Set();

  for (const config of trackConfigs) {
    const definition = definitionByTrack.get(config.id);
    if (!definition) throw new Error(`No source definition exists for ${config.id}.`);
    const input = loadTrackInputs(config);
    const workbookPath = findSourceWorkbookPath(definition, ROOT);
    const sourceRecords = readTrackSourceRows(definition, ROOT);
    const mapping = mapDecisionsToSources({
      track: config.id,
      decisions: input.decisions,
      partRecords: input.partRecords,
      sourceRecords
    });
    const collisions = findWordCollisionBlocks(sourceRecords, mapping.mapped);
    const blockedIds = new Set(collisions.blockedItems.map((item) => item.decision.id));
    const eligible = mapping.mapped.filter((item) => !blockedIds.has(item.decision.id));
    const collisionNotWritten = collisions.blockedItems.map((item) => ({
      track: item.track,
      id: item.decision.id,
      word: item.part.word,
      proposedWord: item.final.word,
      sourceWorkbook: item.sourceRecord.sourceWorkbook,
      worksheet: item.sourceRecord.worksheet,
      row: item.sourceRecord.row,
      reason: item.reason
    }));
    notWritten.push(...mapping.notWritten, ...collisionNotWritten);
    allMapped.push(...eligible);
    sourceRecordsByTrack.set(config.id, sourceRecords);
    sourceWorkbookPaths.add(workbookPath);
    trackPlans.push({
      ...config,
      statusCounts: input.statusCounts,
      sourceWorkbook: path.relative(ROOT, workbookPath).replaceAll("\\", "/"),
      sourceRowCount: sourceRecords.length,
      decisionCount: input.decisions.length,
      mappedCount: mapping.mapped.length,
      collisionCount: collisions.blockedItems.length,
      mapped: eligible
    });
  }

  const workbookStates = loadWorkbookStates(sourceWorkbookPaths);
  const cellPlan = buildCellOperations(allMapped, definitionByTrack, workbookStates);
  const noChangeIds = new Set(cellPlan.noChangeItems.map((item) => item.decision.id));
  for (const item of cellPlan.noChangeItems) {
    notWritten.push({
      track: item.track,
      id: item.decision.id,
      word: item.part.word,
      sourceWorkbook: item.sourceRecord.sourceWorkbook,
      worksheet: item.sourceRecord.worksheet,
      row: item.sourceRecord.row,
      reason: "final 的欄位值與來源相同，沒有需要寫入的儲存格。"
    });
  }
  const applicable = allMapped.filter((item) => !noChangeIds.has(item.decision.id));
  for (const trackPlan of trackPlans) {
    trackPlan.writtenRecords = applicable.filter((item) => item.track === trackPlan.id).length;
    trackPlan.fieldCounts = Object.fromEntries(["word", "meaning", "example_en", "example_zh"].map((field) => [
      field,
      applicable.filter((item) => item.track === trackPlan.id && item.writtenFields.includes(field)).length
    ]));
    trackPlan.wordChanges = applicable
      .filter((item) => item.track === trackPlan.id && item.writtenFields.includes("word"))
      .map((item) => ({
        id: item.decision.id,
        oldWord: item.sourceRecord.word,
        newWord: item.final.word,
        sourceWorkbook: item.sourceRecord.sourceWorkbook,
        worksheet: item.sourceRecord.worksheet,
        row: item.sourceRecord.row,
        decision: item.decision.decision
      }));
  }

  return {
    trackPlans,
    sourceRecordsByTrack,
    workbookStates,
    sourceWorkbookPaths: [...sourceWorkbookPaths],
    items: applicable,
    notWritten,
    operations: cellPlan.operations
  };
}

function ensureBackups(workbookPaths, backupRoot) {
  fs.mkdirSync(backupRoot, { recursive: true });
  const backups = new Map();
  for (const workbookPath of workbookPaths) {
    const backupPath = path.join(backupRoot, path.basename(workbookPath));
    const sourceHash = fileHash(workbookPath);
    if (fs.existsSync(backupPath)) {
      if (fileHash(backupPath) !== sourceHash) {
        throw new Error(`Existing backup does not match ${path.relative(ROOT, workbookPath)}.`);
      }
    } else {
      fs.copyFileSync(workbookPath, backupPath, fs.constants.COPYFILE_EXCL);
    }
    const backupHash = fileHash(backupPath);
    if (backupHash !== sourceHash) {
      throw new Error(`SHA-256 mismatch for ${path.relative(ROOT, backupPath)}.`);
    }
    backups.set(workbookPath, { path: backupPath, sourceHash, backupHash });
  }
  return backups;
}

function verifySourceReadback(plan) {
  const definitionByTrack = new Map(TRACK_DEFINITIONS.map((definition) => [definition.id, definition]));
  const byTrack = new Map();
  for (const trackPlan of plan.trackPlans) {
    const rows = readTrackSourceRows(definitionByTrack.get(trackPlan.id), ROOT);
    byTrack.set(trackPlan.id, new Map(rows.map((record) => [record.id, record])));
  }
  for (const item of plan.items) {
    const sourceRows = byTrack.get(item.track);
    const actual = sourceRows.get(item.sourceRecord.id);
    if (!actual) throw new Error(`Written source row disappeared: ${item.track}/${item.sourceRecord.id}.`);
    const originalExample = parseTrailingTranslation(item.part.example);
    const expected = {
      word: item.final.word ?? item.sourceRecord.word,
      meaning: item.final.meaning ?? item.sourceRecord.meaning,
      example_en: item.final.example_en ?? originalExample.english,
      example_zh: item.final.example_zh ?? originalExample.translation
    };
    const actualFields = {
      word: actual.word,
      meaning: actual.meaning,
      example_en: actual.englishExample,
      example_zh: actual.chineseTranslation
    };
    for (const [field, value] of Object.entries(expected)) {
      if (trimText(actualFields[field]) !== trimText(value)) {
        throw new Error(`Source readback mismatch for ${item.track}/${item.sourceRecord.worksheet}!row ${item.sourceRecord.row} ${field}.`);
      }
      if (Object.hasOwn(item.final, field) && actualFields[field] !== value) {
        throw new Error(`Final value was not written exactly for ${item.track}/${item.decision.id} ${field}.`);
      }
    }
    const expectedExample = formatBilingualExample(expected.example_en, expected.example_zh);
    const hasExampleUpdate = Object.hasOwn(item.final, "example_en") || Object.hasOwn(item.final, "example_zh");
    if (hasExampleUpdate) {
      for (const target of item.exampleSourceRecords ?? [item.sourceRecord]) {
        const targetActual = sourceRows.get(target.id);
        if (!targetActual) throw new Error(`Written source row disappeared: ${item.track}/${target.id}.`);
        if (
          trimText(targetActual.englishExample) !== trimText(expected.example_en)
          || trimText(targetActual.chineseTranslation) !== trimText(expected.example_zh)
          || trimText(targetActual.example) !== expectedExample
        ) {
          throw new Error(`Exported source example did not round-trip for ${item.track}/${item.decision.id} at row ${target.row}.`);
        }
      }
    }
  }
  return Object.fromEntries(plan.trackPlans.map((trackPlan) => [
    trackPlan.id,
    plan.items.filter((item) => item.track === trackPlan.id).length
  ]));
}

function applyPlan(plan, backupRoot) {
  if (!plan.operations.length) {
    throw new Error("No source cells are eligible for writeback.");
  }
  const affectedPaths = [...new Set(plan.operations.map((operation) => operation.workbookPath))];
  const backups = ensureBackups(affectedPaths, backupRoot);
  const backupSnapshots = new Map();
  for (const [workbookPath, backup] of backups) {
    const backupWorkbook = xlsx.readFile(backup.path, { cellStyles: true, cellNF: true, cellDates: true });
    const sourceWorkbook = plan.workbookStates.get(workbookPath).workbook;
    const baseline = workbookSnapshot(backupWorkbook);
    verifyAgainstSnapshot(baseline, workbookSnapshot(sourceWorkbook));
    backupSnapshots.set(workbookPath, baseline);
  }

  const operationsByWorkbook = new Map();
  for (const operation of plan.operations) {
    const group = operationsByWorkbook.get(operation.workbookPath) ?? [];
    group.push(operation);
    operationsByWorkbook.set(operation.workbookPath, group);
    const sheet = plan.workbookStates.get(operation.workbookPath).workbook.Sheets[operation.worksheet];
    const cell = sheet[operation.address] ?? { t: "s", v: "" };
    cell.v = operation.newValue;
    if (!cell.t || cell.t === "z") cell.t = "s";
    delete cell.w;
    sheet[operation.address] = cell;
  }

  const tempFiles = new Map();
  const operationFiles = new Set();
  const replaced = [];
  try {
    for (const [workbookPath, operations] of operationsByWorkbook) {
      const tempPath = path.join(backupRoot, `.round-writeback-${process.pid}-${path.basename(workbookPath)}`);
      const operationPath = path.join(backupRoot, `.round-writeback-${process.pid}-${path.basename(workbookPath)}.json`);
      if (fs.existsSync(tempPath)) throw new Error(`Temporary workbook already exists: ${tempPath}.`);
      if (fs.existsSync(operationPath)) throw new Error(`Temporary operation file already exists: ${operationPath}.`);
      fs.writeFileSync(operationPath, JSON.stringify(operations.map(({ worksheet, address, oldValue, newValue }) => ({
        worksheet,
        address,
        oldValue,
        newValue
      }))), "utf8");
      operationFiles.add(operationPath);
      const patchResult = spawnSync("python", [XLSX_PATCHER_PATH, workbookPath, operationPath, tempPath], {
        encoding: "utf8",
        windowsHide: true
      });
      if (patchResult.error || patchResult.status !== 0) {
        const detail = patchResult.stderr || patchResult.stdout || patchResult.error?.message || "unknown patcher error";
        throw new Error(`OOXML cell patch failed for ${path.basename(workbookPath)}: ${detail.trim()}`);
      }
      tempFiles.set(workbookPath, tempPath);
      const writtenWorkbook = xlsx.readFile(tempPath, { cellStyles: true, cellNF: true, cellDates: true });
      verifyAgainstSnapshot(
        backupSnapshots.get(workbookPath),
        workbookSnapshot(writtenWorkbook),
        operations
      );
    }

    for (const [workbookPath, tempPath] of tempFiles) {
      fs.copyFileSync(tempPath, workbookPath);
      replaced.push(workbookPath);
    }

    const verification = new Map();
    for (const [workbookPath, backup] of backups) {
      const writtenWorkbook = xlsx.readFile(workbookPath, { cellStyles: true, cellNF: true, cellDates: true });
      const result = verifyAgainstSnapshot(
        backupSnapshots.get(workbookPath),
        workbookSnapshot(writtenWorkbook),
        operationsByWorkbook.get(workbookPath) ?? []
      );
      if (fileHash(workbookPath) === backup.backupHash) {
        throw new Error(`Source file hash did not change after writeback: ${path.basename(workbookPath)}.`);
      }
      verification.set(workbookPath, result);
    }

    const sourceReadback = verifySourceReadback(plan);
    return {
      backups,
      verification,
      sourceReadback
    };
  } catch (error) {
    for (const workbookPath of replaced.reverse()) {
      fs.copyFileSync(backups.get(workbookPath).path, workbookPath);
    }
    throw error;
  } finally {
    for (const tempPath of tempFiles.values()) {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
    for (const operationPath of operationFiles) {
      if (fs.existsSync(operationPath)) fs.unlinkSync(operationPath);
    }
  }
}

function summarizePlan(plan, applied = null) {
  const cellFieldNames = ["word", "pos", "meaning", "example_en", "example_zh", "example"];
  return {
    tracks: plan.trackPlans.map((trackPlan) => ({
      track: trackPlan.id,
      sourceWorkbook: trackPlan.sourceWorkbook,
      decisionCount: trackPlan.decisionCount,
      statusCounts: trackPlan.statusCounts,
      sourceRows: trackPlan.sourceRowCount,
      mappedDecisions: trackPlan.mappedCount,
      writtenRecords: trackPlan.writtenRecords,
      fieldsWritten: trackPlan.fieldCounts,
      wordChanges: trackPlan.wordChanges
    })),
    cellCount: plan.operations.length,
    changedCellsByField: Object.fromEntries(cellFieldNames.map((field) => [
      field,
      plan.operations.filter((operation) => operation.field === field).length
    ]).filter(([, count]) => count > 0)),
    notWritten: plan.notWritten,
    backups: applied ? [...applied.backups.entries()].map(([workbookPath, backup]) => ({
      workbook: path.relative(ROOT, workbookPath).replaceAll("\\", "/"),
      backup: path.relative(ROOT, backup.path).replaceAll("\\", "/"),
      sourceSha256: backup.sourceHash,
      backupSha256: backup.backupHash
    })) : [],
    workbookVerification: applied ? [...applied.verification.entries()].map(([workbookPath, result]) => ({
      workbook: path.relative(ROOT, workbookPath).replaceAll("\\", "/"),
      ...result
    })) : [],
    sourceReadback: applied?.sourceReadback ?? null
  };
}

function parseCliOptions(args) {
  const recognized = new Set([
    "--track",
    "--expected",
    "--expected-parts",
    "--accept",
    "--revise",
    "--reject",
    "--backup-dir",
    "--report"
  ]);
  const values = new Map();
  let apply = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--apply") {
      apply = true;
      continue;
    }
    if (!recognized.has(argument)) {
      throw new Error(`Unknown argument: ${argument}.`);
    }
    if (values.has(argument)) {
      throw new Error(`Argument may only be supplied once: ${argument}.`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Argument requires a value: ${argument}.`);
    }
    values.set(argument, value);
    index += 1;
  }

  const countOptions = ["--expected", "--expected-parts", "--accept", "--revise", "--reject"];
  const hasTrack = values.has("--track");
  if (!hasTrack && countOptions.some((option) => values.has(option))) {
    throw new Error("Decision count options require --track.");
  }

  let trackConfigs = DEFAULT_TRACK_CONFIGS;
  if (hasTrack) {
    for (const option of countOptions) {
      if (!values.has(option)) {
        throw new Error(`--track requires ${option}.`);
      }
    }
    const readCount = (option, allowZero = true) => {
      const value = Number(values.get(option));
      if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
        throw new Error(`Invalid count for ${option}: ${values.get(option)}.`);
      }
      return value;
    };
    const expected = readCount("--expected", false);
    const statuses = {
      accept: readCount("--accept"),
      revise: readCount("--revise"),
      reject: readCount("--reject")
    };
    if (Object.values(statuses).reduce((sum, count) => sum + count, 0) !== expected) {
      throw new Error("Decision status counts must add up to --expected.");
    }
    trackConfigs = [{
      id: values.get("--track"),
      expected,
      expectedParts: readCount("--expected-parts", false),
      statuses
    }];
  }

  const resolveTaskPath = (value, label) => {
    if (path.isAbsolute(value)) {
      throw new Error(`${label} must be relative to the task directory.`);
    }
    const resolved = path.resolve(TASK_ROOT, value);
    const relative = path.relative(TASK_ROOT, resolved);
    if (!relative || relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
      throw new Error(`${label} must stay inside the task directory.`);
    }
    return resolved;
  };

  const backupDir = values.get("--backup-dir") ?? DEFAULT_BACKUP_DIR;
  const reportFile = values.get("--report") ?? DEFAULT_REPORT_PATH;
  return {
    apply,
    trackConfigs,
    backupRoot: resolveTaskPath(backupDir, "--backup-dir"),
    reportPath: resolveTaskPath(reportFile, "--report")
  };
}

function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const plan = buildPlan(options.trackConfigs);
  const applied = options.apply ? applyPlan(plan, options.backupRoot) : null;
  console.log(JSON.stringify(summarizePlan(plan, applied), null, 2));
  if (applied) {
    console.log(`Writeback verified. Report target: ${path.relative(ROOT, options.reportPath).replaceAll("\\", "/")}.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(error.stack ?? error.message ?? String(error));
    process.exitCode = 1;
  }
}

export { buildPlan, sourceContentKey };
