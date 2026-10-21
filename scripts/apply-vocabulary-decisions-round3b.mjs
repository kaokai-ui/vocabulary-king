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
  exampleUsesHeadword,
  parseTrailingTranslation,
  readTrackSourceRows
} from "./check-vocabulary-content.mjs";
import {
  formatBilingualExample,
  normalizeWord,
  splitToeicMeaning,
  verifyAgainstSnapshot,
  workbookSnapshot
} from "./apply-vocabulary-decisions.mjs";

const ROOT = process.cwd();
const TASK_ROOT = path.join(ROOT, "docs", "tasks", "vocab-review-20261021");
const PARTS_ROOT = path.join(TASK_ROOT, "parts");
const DECISIONS_ROOT = path.join(TASK_ROOT, "judge");
const BACKUP_ROOT = path.join(TASK_ROOT, "backup-round3b");
const CELL_PATCHER_PATH = path.join(ROOT, "scripts", "patch-xlsx-cell-values.py");
const ROW_DELETER_PATH = path.join(ROOT, "scripts", "delete-xlsx-row.py");
const DELETE_ROW = {
  track: "toefl",
  worksheet: "工作表1",
  row: 2413,
  wordColumn: "A",
  previousWord: "misinterpret",
  targetWord: "misinterprete"
};

const TARGETS = [
  {
    track: "toeic",
    id: "L3-moral-a-n",
    worksheet: "Sheet1",
    row: 2008,
    final: {
      example_en: "The company established a code of conduct to ensure that every supplier meets its moral standards.",
      example_zh: "公司制定行為準則，確保每家供應商都符合其道德標準。"
    },
    reason: "原例句使用 morale（士氣），沒有使用本詞 moral（道德的）；改寫為符合道德義的例句，並讓英文例句明確出現詞頭。"
  },
  {
    track: "toeic",
    id: "L3-being-n",
    worksheet: "Sheet1",
    row: 380,
    final: {
      meaning: "n. 存在；生存；人；生物",
      example_en: "Every human being at the company must complete the annual safety training.",
      example_zh: "公司每位員工都必須完成年度安全訓練。"
    },
    reason: "例句改用 human being，明確包含詞頭並符合名詞用法；補上「人」義以對應例句。"
  },
  {
    track: "toeic",
    id: "TOEIC-headquarter-n",
    worksheet: "Sheet1",
    row: 1485,
    final: {
      word: "headquarters",
      meaning: "n. 總部",
      example_en: "The multinational corporation decided to relocate its global headquarters to New York City.",
      example_zh: "這家跨國公司決定將全球總部遷至紐約市。"
    },
    reason: "將例句改為使用複數詞頭 headquarters，並保留原義與相符的中文翻譯。"
  },
  {
    track: "toefl",
    id: "TOEFL-neurilemmal-mfu7jj5",
    worksheet: "工作表1",
    row: 286,
    final: {
      example_en: "Neurologists study how glial cells protect cortical networks along neurilemmal boundaries.",
      example_zh: "神經學家研究神經膠細胞如何沿著神經鞘邊界保護皮質網路。"
    },
    reason: "保留原例句與 neurilemmal 修飾語，並將中文「網絡」改為臺灣慣用的「網路」。"
  },
  {
    track: "toefl",
    id: "TOEFL-monolithic-memc6s2",
    worksheet: "工作表1",
    row: 440,
    final: {
      example_en: "The agency replaced its monolithic computer system with smaller modules that teams could update independently.",
      example_zh: "該機關以較小的模組取代原本龐大而僵化的電腦系統，讓各團隊能獨立更新。"
    },
    reason: "改寫例句以直接使用 monolithic，並以僵化的大型系統呈現其詞義。"
  },
  {
    track: "toeic-advanced",
    id: "TOEIC-ADV-dressed-in-suit-mg09gc6",
    worksheet: "KK",
    row: 953,
    final: {
      word: "dressed in a suit",
      example_en: "The CEO appeared at the press conference dressed in a suit, projecting a professional and confident image."
    },
    reason: "詞頭缺少冠詞，修正為 dressed in a suit；現有英文例句已使用修正後的完整片語。"
  },
  {
    track: "toeic-advanced",
    id: "TOEIC-ADV-in-the-distance-past-m1ufm0oy",
    worksheet: "KK",
    row: 1541,
    final: {
      word: "in the distant past",
      example_en: "The company's history is rooted in the distant past, beginning as a small family business.",
      example_zh: "公司的歷史可追溯至遙遠的過去，起初是一家小型家族企業。"
    },
    reason: "詞頭把 distance 誤當形容詞，修正為 in the distant past；例句與翻譯均使用正確詞組。"
  }
];

const TRACK_BY_ID = new Map(TRACK_DEFINITIONS.map((definition) => [definition.id, definition]));

function asText(value) {
  return String(value ?? "");
}

function trimText(value) {
  return asText(value).trim();
}

function fileHash(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readJsonlDirectory(directory, pattern) {
  const result = [];
  for (const fileName of fs.readdirSync(directory).filter((name) => pattern.test(name)).sort()) {
    const filePath = path.join(directory, fileName);
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/u);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      if (!lines[lineIndex].trim()) continue;
      let record;
      try {
        record = JSON.parse(lines[lineIndex]);
      } catch (error) {
        throw new Error(`Invalid JSON in ${path.relative(ROOT, filePath)} line ${lineIndex + 1}: ${error.message}`);
      }
      result.push({ record, filePath, lineIndex, originalLine: lines[lineIndex] });
    }
  }
  return result;
}

function readTrackInputs(track) {
  const parts = readJsonlDirectory(path.join(PARTS_ROOT, track), /^part-\d+\.jsonl$/u);
  const decisions = readJsonlDirectory(path.join(DECISIONS_ROOT, track), /^part-\d+\.decisions\.jsonl$/u);
  const partsById = new Map();
  const decisionsById = new Map();
  for (const entry of parts) {
    if (partsById.has(entry.record.id)) throw new Error(`Duplicate part id: ${track}/${entry.record.id}`);
    partsById.set(entry.record.id, entry);
  }
  for (const entry of decisions) {
    if (decisionsById.has(entry.record.id)) throw new Error(`Duplicate decision id: ${track}/${entry.record.id}`);
    decisionsById.set(entry.record.id, entry);
  }
  return { partsById, decisionsById };
}

function findWorkbookRow(workbook, worksheet, row) {
  const sheet = workbook.Sheets[worksheet];
  if (!sheet) throw new Error(`Missing worksheet ${worksheet}.`);
  return sheet;
}

function readWorkbookCell(sheet, row, column) {
  const address = xlsx.utils.encode_cell({ r: row - 1, c: column });
  return { address, cell: sheet[address], value: asText(sheet[address]?.v) };
}

function resolveColumn(definition, sheet, field) {
  const sourceField = field === "example_en" ? "englishExample"
    : field === "example_zh" ? "chineseExample"
      : field;
  if (definition.columnsByHeader) {
    const header = definition.columnsByHeader[sourceField];
    if (!header) throw new Error(`No ${sourceField} header is defined for ${definition.id}.`);
    const headers = xlsx.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: true
    })[0] ?? [];
    const column = headers.findIndex((value) => asText(value) === header);
    if (column < 0) throw new Error(`Could not resolve source workbook header ${header}.`);
    return column;
  }
  if (definition.columns?.[sourceField] == null) {
    throw new Error(`No ${sourceField} source column is defined for ${definition.id}.`);
  }
  return definition.columns[sourceField];
}

function expectedValuesBeforeWrite(part, decision) {
  const previousFinal = decision.final ?? {};
  const parsedPartExample = parseTrailingTranslation(part.example);
  return {
    word: previousFinal.word ?? part.word,
    meaning: previousFinal.meaning ?? part.meaning,
    example_en: previousFinal.example_en ?? parsedPartExample.english,
    example_zh: previousFinal.example_zh ?? parsedPartExample.translation
  };
}

function assertSourceMatchesOldDecision(item) {
  const expected = expectedValuesBeforeWrite(item.part, item.decision);
  const actual = {
    word: item.sourceRecord.word,
    meaning: item.sourceRecord.meaning,
    example_en: item.sourceRecord.englishExample,
    example_zh: item.sourceRecord.chineseTranslation
  };
  for (const field of Object.keys(expected)) {
    if (trimText(actual[field]) !== trimText(expected[field])) {
      throw new Error(`Prewrite mismatch for ${item.track}/${item.decision.id} ${field}: source no longer matches its existing decision.`);
    }
  }
}

function assertWorkbookRowMatchesSource(item, workbook, definition) {
  const sheet = findWorkbookRow(workbook, item.sourceRecord.worksheet, item.sourceRecord.row);
  const word = readWorkbookCell(sheet, item.sourceRecord.row, resolveColumn(definition, sheet, "word")).value;
  if (word !== item.sourceRecord.word) {
    throw new Error(`Workbook row mismatch at ${item.sourceRecord.worksheet}!row ${item.sourceRecord.row} word.`);
  }
  const meaningColumn = resolveColumn(definition, sheet, "meaning");
  const meaningCell = readWorkbookCell(sheet, item.sourceRecord.row, meaningColumn).value;
  if (definition.type === "toeic-workbook" && definition.columns.pos != null) {
    const posColumn = resolveColumn(definition, sheet, "pos");
    const pos = readWorkbookCell(sheet, item.sourceRecord.row, posColumn).value;
    const composite = pos ? `${pos}. ${meaningCell}` : meaningCell;
    if (composite !== item.sourceRecord.meaning) {
      throw new Error(`Workbook row mismatch at ${item.sourceRecord.worksheet}!row ${item.sourceRecord.row} meaning.`);
    }
  } else if (meaningCell !== item.sourceRecord.meaning) {
    throw new Error(`Workbook row mismatch at ${item.sourceRecord.worksheet}!row ${item.sourceRecord.row} meaning.`);
  }
  for (const [field, sourceField] of [["example_en", "englishExample"], ["example_zh", "chineseTranslation"]]) {
    const column = resolveColumn(definition, sheet, field);
    const value = readWorkbookCell(sheet, item.sourceRecord.row, column).value;
    if (value !== item.sourceRecord[sourceField]) {
      throw new Error(`Workbook row mismatch at ${item.sourceRecord.worksheet}!row ${item.sourceRecord.row} ${field}.`);
    }
  }
}

function buildItems(sourceRowsByTrack, inputsByTrack) {
  return TARGETS.map((target) => {
    const inputs = inputsByTrack.get(target.track);
    const partEntry = inputs.partsById.get(target.id);
    const decisionEntry = inputs.decisionsById.get(target.id);
    if (!partEntry || !decisionEntry) throw new Error(`Missing part/decision record for ${target.track}/${target.id}.`);
    const part = partEntry.record;
    const decision = decisionEntry.record;
    if (decision.id !== part.id || decision.word !== part.word || part.track !== target.track) {
      throw new Error(`Part/decision identity mismatch for ${target.track}/${target.id}.`);
    }
    const sourceRecord = sourceRowsByTrack.get(target.track).find((record) =>
      record.worksheet === target.worksheet && record.row === target.row
    );
    if (!sourceRecord) throw new Error(`Could not locate ${target.track}/${target.worksheet}!${target.row}.`);
    const previousWord = decision.final?.word ?? part.word;
    if (normalizeWord(sourceRecord.word) !== normalizeWord(previousWord)) {
      throw new Error(`Unexpected current word at ${target.track}/${target.worksheet}!${target.row}: ${sourceRecord.word}.`);
    }
    const item = {
      ...target,
      part,
      decision,
      sourceRecord,
      final: { ...(decision.final ?? {}), ...target.final }
    };
    assertSourceMatchesOldDecision(item);
    const example = item.final.example_en ?? parseTrailingTranslation(part.example).english;
    const finalWord = item.final.word ?? part.word;
    if (!exampleUsesHeadword(finalWord, example)) {
      throw new Error(`Final example does not use its headword: ${target.track}/${target.id}.`);
    }
    for (const field of Object.keys(item.final)) {
      if (typeof item.final[field] !== "string") {
        throw new Error(`Final ${field} must be text for ${target.track}/${target.id}.`);
      }
    }
    return item;
  });
}

function verifyProposedWords(sourceRowsByTrack, items) {
  const changedWords = items.filter((item) =>
    Object.hasOwn(item.final, "word") && trimText(item.final.word) !== trimText(item.sourceRecord.word)
  );
  const changedByTrack = new Map();
  for (const item of changedWords) {
    const group = changedByTrack.get(item.track) ?? new Map();
    group.set(item.sourceRecord.id, item.final.word);
    changedByTrack.set(item.track, group);
  }
  for (const [track, rows] of sourceRowsByTrack) {
    const wordChanges = changedByTrack.get(track) ?? new Map();
    for (const item of items.filter((candidate) => candidate.track === track)) {
      if (item.sourceRecord.worksheet === DELETE_ROW.worksheet
        && item.sourceRecord.row === DELETE_ROW.row
        && track === DELETE_ROW.track) {
        throw new Error("A writeback target overlaps the row scheduled for deletion.");
      }
    }
    const projected = rows.filter((record) => !(
      track === DELETE_ROW.track
      && record.worksheet === DELETE_ROW.worksheet
      && record.row === DELETE_ROW.row
    )).map((record) => ({
      id: record.id,
      word: wordChanges.get(record.id) ?? record.word
    }));
    for (const item of changedWords.filter((candidate) => candidate.track === track)) {
      const collisions = projected.filter((record) =>
        record.id !== item.sourceRecord.id && normalizeWord(record.word) === normalizeWord(item.final.word)
      );
      if (collisions.length) {
        throw new Error(`Proposed word ${item.final.word} would duplicate ${collisions.map((row) => row.id).join(", ")}.`);
      }
    }
  }
  return changedWords;
}

function createOperation(operationsByWorkbook, item, workbookPath, sheet, column, field, newValue) {
  const { address, cell, value: oldValue } = readWorkbookCell(sheet, item.sourceRecord.row, column);
  if (oldValue === newValue) return false;
  if (cell?.f) throw new Error(`Cannot overwrite formula cell ${path.basename(workbookPath)}/${item.sourceRecord.worksheet}!${address}.`);
  const operations = operationsByWorkbook.get(workbookPath) ?? [];
  const existing = operations.find((operation) => operation.worksheet === item.sourceRecord.worksheet && operation.address === address);
  if (existing && existing.newValue !== newValue) throw new Error(`Conflicting cell operations for ${item.sourceRecord.worksheet}!${address}.`);
  if (!existing) {
    operations.push({
      workbookPath,
      relativePath: path.relative(ROOT, workbookPath).replaceAll("\\", "/"),
      worksheet: item.sourceRecord.worksheet,
      address,
      row: item.sourceRecord.row,
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
    operationsByWorkbook.set(workbookPath, operations);
  }
  return true;
}

function buildCellOperations(items, workbookByPath, definitionByTrack) {
  const operationsByWorkbook = new Map();
  for (const item of items) {
    const definition = definitionByTrack.get(item.track);
    const workbookPath = findSourceWorkbookPath(definition, ROOT);
    const workbook = workbookByPath.get(workbookPath);
    const sheet = findWorkbookRow(workbook, item.sourceRecord.worksheet, item.sourceRecord.row);
    assertWorkbookRowMatchesSource(item, workbook, definition);

    if (Object.hasOwn(item.final, "word")) {
      createOperation(operationsByWorkbook, item, workbookPath, sheet, resolveColumn(definition, sheet, "word"), "word", item.final.word);
    }

    if (Object.hasOwn(item.final, "meaning")) {
      if (definition.type === "toeic-workbook" && definition.columns.pos != null) {
        const split = splitToeicMeaning(item.final.meaning, item.sourceRecord.rawFields?.pos ?? "");
        createOperation(operationsByWorkbook, item, workbookPath, sheet, resolveColumn(definition, sheet, "pos"), "pos", split.pos);
        createOperation(operationsByWorkbook, item, workbookPath, sheet, resolveColumn(definition, sheet, "meaning"), "meaning", split.meaning);
      } else {
        createOperation(operationsByWorkbook, item, workbookPath, sheet, resolveColumn(definition, sheet, "meaning"), "meaning", item.final.meaning);
      }
    }

    for (const field of ["example_en", "example_zh"]) {
      if (!Object.hasOwn(item.final, field)) continue;
      const column = resolveColumn(definition, sheet, field);
      createOperation(operationsByWorkbook, item, workbookPath, sheet, column, field, item.final[field]);
    }
  }
  return operationsByWorkbook;
}

function shiftAddress(address, deletedRow) {
  const match = /^([A-Z]{1,3})(\d+)$/u.exec(address);
  if (!match) return address;
  const row = Number(match[2]);
  if (row === deletedRow) return null;
  return `${match[1]}${row > deletedRow ? row - 1 : row}`;
}

function shiftRangeText(text, deletedRow) {
  return text.replace(/(\$?[A-Z]{1,3}\$?)(\d+)/gu, (whole, column, rawRow) => {
    const row = Number(rawRow);
    return `${column}${row > deletedRow ? row - 1 : row}`;
  });
}

function verifyRowDeletionAgainstSnapshot(baseline, candidate, deletedRow, operations = []) {
  if (JSON.stringify(baseline.sheetNames) !== JSON.stringify(candidate.sheetNames)) {
    throw new Error("Row deletion changed worksheet names or order.");
  }
  const operationByAddress = new Map();
  for (const operation of operations) {
    const entries = operationByAddress.get(operation.worksheet) ?? new Map();
    entries.set(operation.address, operation);
    operationByAddress.set(operation.worksheet, entries);
  }
  let keptCells = 0;
  let deletedRowCells = 0;
  let updatedCells = 0;
  for (const sheetName of baseline.sheetNames) {
    const before = baseline.sheets.get(sheetName);
    const after = candidate.sheets.get(sheetName);
    if (!after) throw new Error(`Worksheet disappeared: ${sheetName}.`);
    const expectedRef = shiftRangeText(before.ref, deletedRow);
    if (expectedRef !== after.ref) throw new Error(`Worksheet range mismatch after row deletion in ${sheetName}: ${expectedRef} -> ${after.ref}.`);
    if (before.widths !== after.widths) throw new Error(`Column widths changed in ${sheetName}.`);
    const expectedHeights = JSON.parse(before.heights);
    if (expectedHeights.length >= deletedRow) expectedHeights.splice(deletedRow - 1, 1);
    if (JSON.stringify(expectedHeights) !== after.heights) throw new Error(`Row heights did not follow the deleted row in ${sheetName}.`);
    const expectedMerges = JSON.parse(before.merges).map((range) => shiftRangeText(range, deletedRow));
    if (JSON.stringify(expectedMerges) !== after.merges) throw new Error(`Merged cells changed in ${sheetName}.`);

    const expectedAddresses = new Set();
    const sheetOperations = operationByAddress.get(sheetName) ?? new Map();
    for (const [address, beforeText] of before.cells) {
      const mappedAddress = shiftAddress(address, deletedRow);
      if (mappedAddress == null) {
        deletedRowCells += 1;
        continue;
      }
      expectedAddresses.add(mappedAddress);
      keptCells += 1;
      const afterText = after.cells.get(mappedAddress) ?? null;
      const operation = sheetOperations.get(mappedAddress);
      if (!operation) {
        if (beforeText !== afterText) throw new Error(`Unexpected cell change after row deletion at ${sheetName}!${address} -> ${mappedAddress}.`);
        continue;
      }
      const beforeState = JSON.parse(beforeText);
      const afterState = afterText ? JSON.parse(afterText) : null;
      if (!afterState || afterState.value !== operation.newValue) {
        throw new Error(`Expected written value missing at ${sheetName}!${mappedAddress}.`);
      }
      if (JSON.stringify(beforeState.style ?? null) !== JSON.stringify(afterState.style ?? null)
        || beforeState.formula !== afterState.formula) {
        throw new Error(`Cell formula or style changed at ${sheetName}!${mappedAddress}.`);
      }
      if (beforeState.value !== afterState.value) updatedCells += 1;
    }
    if (expectedAddresses.size !== after.cells.size) {
      throw new Error(`Unexpected cell count after row deletion in ${sheetName}: expected ${expectedAddresses.size}, found ${after.cells.size}.`);
    }
    for (const address of after.cells.keys()) {
      if (!expectedAddresses.has(address)) throw new Error(`Unexpected new cell after row deletion at ${sheetName}!${address}.`);
    }
  }
  return {
    retainedCells: keptCells,
    deletedRowCells,
    updatedCells,
    unexpectedCells: 0,
    structure: "worksheet names/order, column widths, mapped row heights, and merged ranges verified"
  };
}

function runRtkPython(scriptPath, args) {
  const result = spawnSync("rtk", ["python", scriptPath, ...args.map(String)], {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true
  });
  if (result.error || result.status !== 0) {
    const detail = result.stderr || result.stdout || result.error?.message || "unknown Python error";
    throw new Error(detail.trim());
  }
}

function runCellPatcher(inputPath, operations, outputPath, operationPath) {
  fs.writeFileSync(operationPath, JSON.stringify(operations.map(({ worksheet, address, oldValue, newValue }) => ({
    worksheet,
    address,
    oldValue,
    newValue
  }))), "utf8");
  runRtkPython(CELL_PATCHER_PATH, [inputPath, operationPath, outputPath]);
}

function prepareDecisionFileChanges(items) {
  const changesByFile = new Map();
  for (const item of items) {
    if (!changesByFile.has(item.decisionEntry.filePath)) {
      const filePath = item.decisionEntry.filePath;
      const oldText = fs.readFileSync(filePath, "utf8");
      const newline = oldText.includes("\r\n") ? "\r\n" : "\n";
      const lines = oldText.split(/\r?\n/u);
      changesByFile.set(filePath, { oldText, newline, lines, updated: [] });
    }
    const change = changesByFile.get(item.decisionEntry.filePath);
    const currentRecord = JSON.parse(change.lines[item.decisionEntry.lineIndex]);
    if (currentRecord.id !== item.decision.id || JSON.stringify(currentRecord.final ?? {}) !== JSON.stringify(item.decision.final ?? {})) {
      throw new Error(`Decision changed during writeback planning: ${item.track}/${item.decision.id}.`);
    }
    const revised = {
      ...currentRecord,
      final: { ...(currentRecord.final ?? {}), ...item.finalUpdate },
      reason: item.reason
    };
    change.lines[item.decisionEntry.lineIndex] = JSON.stringify(revised);
    change.updated.push({ id: revised.id, final: revised.final, reason: revised.reason });
  }
  return new Map([...changesByFile.entries()].map(([filePath, change]) => [filePath, {
    ...change,
    newText: change.lines.join(change.newline)
  }]));
}

function verifySourceReadback(items, sourceRowsByTrack) {
  const definitionByTrack = new Map(TRACK_DEFINITIONS.map((definition) => [definition.id, definition]));
  const postRowsByTrack = new Map();
  for (const track of new Set(items.map((item) => item.track))) {
    postRowsByTrack.set(track, readTrackSourceRows(definitionByTrack.get(track), ROOT));
  }
  for (const item of items) {
    const actual = postRowsByTrack.get(item.track).find((record) =>
      record.worksheet === item.worksheet && record.row === item.row
    );
    if (!actual) throw new Error(`Written row disappeared: ${item.track}/${item.worksheet}!${item.row}.`);
    const originalExample = parseTrailingTranslation(item.part.example);
    const expected = {
      word: item.final.word ?? item.part.word,
      meaning: item.final.meaning ?? item.part.meaning,
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
        throw new Error(`Source readback mismatch for ${item.track}/${item.worksheet}!${item.row} ${field}.`);
      }
      if (Object.hasOwn(item.final, field) && actualFields[field] !== value) {
        throw new Error(`Final value was not written exactly for ${item.track}/${item.decision.id} ${field}.`);
      }
    }
    if (trimText(actual.example) !== formatBilingualExample(expected.example_en, expected.example_zh)) {
      throw new Error(`Bilingual example did not round-trip for ${item.track}/${item.decision.id}.`);
    }
  }

  const toeflRows = readTrackSourceRows(TRACK_BY_ID.get("toefl"), ROOT);
  const misinterpretCount = toeflRows.filter((record) => normalizeWord(record.word) === "misinterpret").length;
  const misinterpreteCount = toeflRows.filter((record) => normalizeWord(record.word) === "misinterprete").length;
  if (toeflRows.length !== 3799 || misinterpretCount !== 1 || misinterpreteCount !== 0) {
    throw new Error(`TOEFL deletion readback mismatch: rows=${toeflRows.length}, misinterpret=${misinterpretCount}, misinterprete=${misinterpreteCount}.`);
  }

  return {
    tracks: Object.fromEntries([...postRowsByTrack.entries()].map(([track, rows]) => [track, rows.length])),
    toefl: { sourceRows: toeflRows.length, misinterpret: misinterpretCount, misinterprete: misinterpreteCount }
  };
}

function applyWriteback() {
  fs.mkdirSync(BACKUP_ROOT, { recursive: true });
  const sourcePaths = new Map();
  const backups = new Map();
  for (const track of ["toeic", "toefl", "toeic-advanced"]) {
    const definition = TRACK_BY_ID.get(track);
    const sourcePath = findSourceWorkbookPath(definition, ROOT);
    const backupPath = path.join(BACKUP_ROOT, path.basename(sourcePath));
    if (!fs.existsSync(backupPath)) throw new Error(`Missing round3b workbook backup: ${path.relative(ROOT, backupPath)}.`);
    const sourceHash = fileHash(sourcePath);
    const backupHash = fileHash(backupPath);
    if (sourceHash !== backupHash) throw new Error(`Source changed after its round3b backup: ${path.relative(ROOT, sourcePath)}.`);
    sourcePaths.set(track, sourcePath);
    backups.set(sourcePath, { path: backupPath, sourceHash, backupHash });
  }

  const sourceRowsByTrack = new Map();
  const inputsByTrack = new Map();
  for (const track of ["toeic", "toefl", "toeic-advanced"]) {
    sourceRowsByTrack.set(track, readTrackSourceRows(TRACK_BY_ID.get(track), ROOT));
    inputsByTrack.set(track, readTrackInputs(track));
  }

  const deletionSourceRows = sourceRowsByTrack.get(DELETE_ROW.track);
  const currentDeleteRow = deletionSourceRows.find((record) =>
    record.worksheet === DELETE_ROW.worksheet && record.row === DELETE_ROW.row
  );
  const currentPreviousRow = deletionSourceRows.find((record) =>
    record.worksheet === DELETE_ROW.worksheet && record.row === DELETE_ROW.row - 1
  );
  if (currentPreviousRow?.word !== DELETE_ROW.previousWord || currentDeleteRow?.word !== DELETE_ROW.targetWord) {
    throw new Error(`Deletion guard failed in source workbook: expected row ${DELETE_ROW.row - 1} ${DELETE_ROW.previousWord} and row ${DELETE_ROW.row} ${DELETE_ROW.targetWord}.`);
  }

  const items = buildItems(sourceRowsByTrack, inputsByTrack);
  for (const item of items) {
    item.finalUpdate = { ...item.final };
    item.reason = item.reason;
    item.decisionEntry = inputsByTrack.get(item.track).decisionsById.get(item.id);
  }
  const changedWords = verifyProposedWords(sourceRowsByTrack, items);
  const decisionFileChanges = prepareDecisionFileChanges(items);

  const workbookByPath = new Map();
  const baselineByPath = new Map();
  for (const [sourcePath, backup] of backups) {
    const workbook = xlsx.readFile(backup.path, { cellStyles: true, cellNF: true, cellDates: true });
    workbookByPath.set(sourcePath, workbook);
    baselineByPath.set(sourcePath, workbookSnapshot(workbook));
  }
  const operationsByWorkbook = buildCellOperations(items, workbookByPath, TRACK_BY_ID);
  const allOperations = [...operationsByWorkbook.values()].flat();
  if (!allOperations.length) throw new Error("No source cell changes are eligible for writeback.");

  const toeflPath = sourcePaths.get("toefl");
  const toeflBackupPath = backups.get(toeflPath).path;
  const toeflDefinition = TRACK_BY_ID.get("toefl");
  const toeflBaselineWorkbook = workbookByPath.get(toeflPath);
  const toeflBaselineSheet = findWorkbookRow(toeflBaselineWorkbook, DELETE_ROW.worksheet, DELETE_ROW.row);
  const wordColumn = resolveColumn(toeflDefinition, toeflBaselineSheet, "word");
  const previousWord = readWorkbookCell(toeflBaselineSheet, DELETE_ROW.row - 1, wordColumn).value;
  const targetWord = readWorkbookCell(toeflBaselineSheet, DELETE_ROW.row, wordColumn).value;
  if (previousWord !== DELETE_ROW.previousWord || targetWord !== DELETE_ROW.targetWord) {
    throw new Error(`Deletion guard failed in backup: row ${DELETE_ROW.row - 1}=${previousWord}, row ${DELETE_ROW.row}=${targetWord}.`);
  }

  const token = `${process.pid}-${Date.now()}`;
  const tempOutputs = new Map();
  const tempFiles = new Set();
  const operationFiles = new Set();
  const replacedSources = [];
  const writtenDecisionFiles = [];
  let deletionOnlyPath = path.join(BACKUP_ROOT, `.round3b-${token}-toefl-delete-only.xlsx`);
  let deletionOnlyComparison = null;
  const finalVerification = new Map();

  try {
    runRtkPython(ROW_DELETER_PATH, [
      toeflBackupPath,
      deletionOnlyPath,
      DELETE_ROW.worksheet,
      DELETE_ROW.row,
      DELETE_ROW.wordColumn,
      DELETE_ROW.previousWord,
      DELETE_ROW.targetWord
    ]);
    tempFiles.add(deletionOnlyPath);
    const deletionOnlyWorkbook = xlsx.readFile(deletionOnlyPath, { cellStyles: true, cellNF: true, cellDates: true });
    deletionOnlyComparison = verifyRowDeletionAgainstSnapshot(
      baselineByPath.get(toeflPath),
      workbookSnapshot(deletionOnlyWorkbook),
      DELETE_ROW.row
    );
    if (deletionOnlyComparison.deletedRowCells !== 4) {
      throw new Error(`Expected four populated cells to be removed from row ${DELETE_ROW.row}, found ${deletionOnlyComparison.deletedRowCells}.`);
    }

    for (const [sourcePath, operations] of operationsByWorkbook) {
      const baseName = path.basename(sourcePath);
      const outputPath = path.join(BACKUP_ROOT, `.round3b-${token}-${baseName}`);
      const operationPath = path.join(BACKUP_ROOT, `.round3b-${token}-${baseName}.json`);
      if (fs.existsSync(outputPath) || fs.existsSync(operationPath)) {
        throw new Error(`Round3b temporary output already exists for ${baseName}.`);
      }
      const inputPath = sourcePath === toeflPath ? deletionOnlyPath : backups.get(sourcePath).path;
      runCellPatcher(inputPath, operations, outputPath, operationPath);
      tempOutputs.set(sourcePath, outputPath);
      tempFiles.add(outputPath);
      operationFiles.add(operationPath);
      const candidate = xlsx.readFile(outputPath, { cellStyles: true, cellNF: true, cellDates: true });
      const result = sourcePath === toeflPath
        ? verifyRowDeletionAgainstSnapshot(
          baselineByPath.get(sourcePath),
          workbookSnapshot(candidate),
          DELETE_ROW.row,
          operations
        )
        : verifyAgainstSnapshot(baselineByPath.get(sourcePath), workbookSnapshot(candidate), operations);
      finalVerification.set(sourcePath, result);
    }

    for (const [sourcePath, backup] of backups) {
      if (fileHash(sourcePath) !== backup.sourceHash) {
        throw new Error(`Source changed before replacement: ${path.relative(ROOT, sourcePath)}.`);
      }
      const outputPath = tempOutputs.get(sourcePath);
      if (!outputPath) throw new Error(`No writeback output was created for ${path.basename(sourcePath)}.`);
      fs.copyFileSync(outputPath, sourcePath);
      replacedSources.push(sourcePath);
    }

    const sourceReadback = verifySourceReadback(items, sourceRowsByTrack);
    for (const [filePath, change] of decisionFileChanges) {
      fs.writeFileSync(filePath, change.newText, "utf8");
      writtenDecisionFiles.push(filePath);
    }
    for (const item of items) {
      const filePath = item.decisionEntry.filePath;
      const updatedLines = fs.readFileSync(filePath, "utf8").split(/\r?\n/u);
      const updated = JSON.parse(updatedLines[item.decisionEntry.lineIndex]);
      if (updated.reason !== item.reason || JSON.stringify(updated.final) !== JSON.stringify({ ...(item.decision.final ?? {}), ...item.finalUpdate })) {
        throw new Error(`Decision readback mismatch for ${item.track}/${item.id}.`);
      }
    }

    return {
      writtenRecords: items.length,
      notWritten: 0,
      changedDecisionWords: changedWords.map((item) => ({ track: item.track, id: item.id, oldWord: item.sourceRecord.word, newWord: item.final.word })),
      updatedCells: allOperations.map(({ track, decisionId, worksheet, address, field, oldValue, newValue }) => ({
        track,
        id: decisionId,
        worksheet,
        address,
        field,
        oldValue,
        newValue
      })),
      deletedRow: {
        track: DELETE_ROW.track,
        workbook: path.relative(ROOT, toeflPath).replaceAll("\\", "/"),
        worksheet: DELETE_ROW.worksheet,
        row: DELETE_ROW.row,
        word: DELETE_ROW.targetWord,
        previousWord: DELETE_ROW.previousWord,
        comparison: deletionOnlyComparison
      },
      backups: [...backups.entries()].map(([sourcePath, backup]) => ({
        workbook: path.relative(ROOT, sourcePath).replaceAll("\\", "/"),
        backup: path.relative(ROOT, backup.path).replaceAll("\\", "/"),
        sourceSha256: backup.sourceHash,
        backupSha256: backup.backupHash
      })),
      workbookVerification: [...finalVerification.entries()].map(([sourcePath, result]) => ({
        workbook: path.relative(ROOT, sourcePath).replaceAll("\\", "/"),
        ...result
      })),
      sourceReadback,
      decisionFiles: [...decisionFileChanges.keys()].map((filePath) => path.relative(ROOT, filePath).replaceAll("\\", "/"))
    };
  } catch (error) {
    for (const sourcePath of replacedSources.reverse()) {
      fs.copyFileSync(backups.get(sourcePath).path, sourcePath);
    }
    for (const filePath of writtenDecisionFiles) {
      const oldText = decisionFileChanges.get(filePath).oldText;
      fs.writeFileSync(filePath, oldText, "utf8");
    }
    throw error;
  } finally {
    for (const filePath of [...tempFiles, ...operationFiles]) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  }
}

function main() {
  if (process.argv.length !== 3 || process.argv[2] !== "--apply") {
    throw new Error("Usage: node scripts/apply-vocabulary-decisions-round3b.mjs --apply");
  }
  console.log(JSON.stringify(applyWriteback(), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  }
}
