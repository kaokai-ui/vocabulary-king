import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import xlsx from "xlsx";

const ROOT = process.cwd();
const FINDINGS_PATH = path.join(ROOT, "docs", "tasks", "vocab-review-20261021", "check-findings.jsonl");
const BACKUP_DIR = path.join(ROOT, "docs", "tasks", "vocab-review-20261021", "backup");
const DIFF_REPORT_PATH = path.join(ROOT, "docs", "tasks", "vocab-review-20261021", "fix-round1-diff.md");
const TARGET_COUNTS = new Map([
  ["simplified-script", 16],
  ["conversion-term-definite", 49]
]);

const SIMPLIFIED_CHARACTER_REPLACEMENTS = new Map([
  ["痹", "痺"], ["给", "給"], ["潜", "潛"], ["藓", "蘚"], ["厨", "廚"],
  ["稳", "穩"], ["耸", "聳"], ["风", "風"], ["异", "異"], ["径", "徑"],
  ["专", "專"], ["级", "級"], ["沟", "溝"], ["细", "細"], ["佣", "傭"]
]);

const CONVERSION_REPLACEMENTS = new Map([
  ["錶演", "表演"], ["錶示", "表示"], ["錶達", "表達"], ["髮生", "發生"], ["髮展", "發展"],
  ["乾涉", "干涉"], ["乾預", "干預"], ["乾擾", "干擾"], ["乾部", "幹部"],
  ["複印件", "影本"], ["複印", "影印"], ["視頻", "影片"], ["軟件", "軟體"], ["信息", "資訊"],
  ["網絡", "網路"], ["打印", "列印"], ["服務器", "伺服器"], ["默認", "預設"]
]);

function text(value) {
  return String(value ?? "");
}

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function markdown(value) {
  return text(value).replaceAll("|", "\\|").replace(/\r?\n/gu, "<br>");
}

function readFindings() {
  if (!fs.existsSync(FINDINGS_PATH)) {
    throw new Error(`Missing findings file: ${path.relative(ROOT, FINDINGS_PATH)}`);
  }
  return fs.readFileSync(FINDINGS_PATH, "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function fieldFromFinding(finding) {
  if (finding.issue.startsWith("中文意思")) {
    return "中文意思";
  }
  if (finding.issue.startsWith("中文翻譯")) {
    return "中文翻譯";
  }
  throw new Error(`Cannot identify the affected field for ${finding.id}: ${finding.issue}`);
}

function conversionPhraseFromIssue(issue) {
  const match = /「([^」]+)」疑似用詞問題/u.exec(issue);
  if (!match) {
    throw new Error(`Cannot extract a conversion phrase from: ${issue}`);
  }
  return match[1];
}

function replacementForConversionPhrase(phrase) {
  const direct = CONVERSION_REPLACEMENTS.get(phrase);
  if (direct) {
    return direct;
  }
  if (/^透過了[^，,。；;！？!?]{0,16}(?:檢查|考試)$/u.test(phrase)) {
    return phrase.replace(/^透過/u, "通過");
  }
  throw new Error(`No precise replacement is defined for conversion phrase: ${phrase}`);
}

function simplifiedCharactersFromIssue(issue) {
  const match = /含疑似簡體字：(.+)$/u.exec(issue);
  if (!match) {
    throw new Error(`Cannot extract simplified characters from: ${issue}`);
  }
  const characters = Array.from(new Set(match[1].split("、").map((character) => character.trim()).filter(Boolean)));
  if (!characters.length || characters.some((character) => !SIMPLIFIED_CHARACTER_REPLACEMENTS.has(character))) {
    throw new Error(`No precise replacement is defined for simplified characters in: ${issue}`);
  }
  return characters;
}

function resolveWorkbookPath(relativePath) {
  const normalized = text(relativePath).replaceAll("/", path.sep);
  const absolute = path.resolve(ROOT, normalized);
  const relative = path.relative(ROOT, absolute);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Source workbook path escapes the project root: ${relativePath}`);
  }
  if (!fs.existsSync(absolute)) {
    throw new Error(`Source workbook does not exist: ${relativePath}`);
  }
  return absolute;
}

function headerIndex(sheet, matcher) {
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false, blankrows: true });
  const headers = rows[0] ?? [];
  const index = headers.findIndex((value) => matcher.test(text(value).trim()));
  if (index < 0) {
    throw new Error(`Could not resolve a worksheet column matching ${matcher}.`);
  }
  return index;
}

function getCellValue(sheet, rowNumber, columnIndex) {
  const address = xlsx.utils.encode_cell({ r: rowNumber - 1, c: columnIndex });
  return text(sheet[address]?.v);
}

function columnForFinding(workbookPath, sheet, rowNumber, field) {
  const fileName = path.basename(workbookPath);
  if (/^詞彙分級表L[13]L[26]\.xlsx$/u.test(fileName)) {
    if (field === "中文意思") {
      return 2;
    }
    return getCellValue(sheet, rowNumber, 4) ? 4 : 3;
  }
  if (/^GEPT_with_levels(?:\.KK)?\.xlsx$/iu.test(fileName)) {
    return field === "中文意思" ? 2 : 8;
  }
  if (/^toeic3000_final\.xlsx$/iu.test(fileName)) {
    return field === "中文意思" ? 3 : 7;
  }
  if (/^Toeic\.Advanced\.xlsx$/iu.test(fileName)) {
    return field === "中文意思" ? 2 : 4;
  }
  if (/^elementary\.english_final001\.xlsx$/iu.test(fileName)) {
    return field === "中文意思"
      ? headerIndex(sheet, /^解釋$/u)
      : headerIndex(sheet, /中文翻譯/u);
  }
  if (/^toefl\.final\.checked\.xlsx$/iu.test(fileName)) {
    return field === "中文意思"
      ? headerIndex(sheet, /^Chinese Meaning$/iu)
      : headerIndex(sheet, /^Chinese Translation$/iu);
  }
  throw new Error(`No source-column mapping is defined for ${fileName} (${field}).`);
}

function makeReportItem(finding, field, phrase, replacement) {
  return {
    finding,
    field,
    phrase,
    replacement,
    workbook: finding.sourceWorkbook,
    worksheet: finding.worksheet,
    row: finding.row,
    word: finding.word,
    track: finding.track
  };
}

function replaceConversionPhrase(value, phrase, replacement) {
  if (phrase === "視頻") {
    return value.replace(/(?<!電)視頻/gu, replacement);
  }
  return value.split(phrase).join(replacement);
}

function preparePlan() {
  const selected = readFindings().filter((finding) => TARGET_COUNTS.has(finding.check));
  const counts = new Map();
  for (const finding of selected) {
    counts.set(finding.check, (counts.get(finding.check) ?? 0) + 1);
  }
  for (const [category, expected] of TARGET_COUNTS) {
    if (counts.get(category) !== expected) {
      throw new Error(`Expected ${expected} ${category} findings, found ${counts.get(category) ?? 0}.`);
    }
  }
  if (selected.length !== 65) {
    throw new Error(`Expected exactly 65 definite findings, found ${selected.length}.`);
  }

  const workbooks = new Map();
  const operations = new Map();
  const reportItems = [];
  const unmodifiedItems = [];

  for (const finding of selected) {
    const workbookPath = resolveWorkbookPath(finding.sourceWorkbook);
    let workbookState = workbooks.get(workbookPath);
    if (!workbookState) {
      workbookState = {
        path: workbookPath,
        relativePath: finding.sourceWorkbook,
        workbook: xlsx.readFile(workbookPath)
      };
      workbooks.set(workbookPath, workbookState);
    }

    const sheet = workbookState.workbook.Sheets[finding.worksheet];
    if (!sheet) {
      throw new Error(`Missing worksheet ${finding.worksheet} in ${finding.sourceWorkbook}.`);
    }
    const field = fieldFromFinding(finding);
    const column = columnForFinding(workbookPath, sheet, finding.row, field);
    const address = xlsx.utils.encode_cell({ r: finding.row - 1, c: column });
    const cell = sheet[address];
    const originalValue = text(cell?.v);
    if (!cell || typeof cell.v !== "string") {
      throw new Error(`Target cell ${finding.sourceWorkbook}/${finding.worksheet}/${address} is not a text cell.`);
    }

    let phrase;
    let replacement;
    if (finding.check === "simplified-script") {
      const characters = simplifiedCharactersFromIssue(finding.issue);
      const pairs = characters.map((character) => [character, SIMPLIFIED_CHARACTER_REPLACEMENTS.get(character)]);
      for (const [character] of pairs) {
        if (!originalValue.includes(character)) {
          throw new Error(`The flagged character ${character} is absent from ${finding.sourceWorkbook}/${finding.worksheet}/${address}.`);
        }
      }
      phrase = characters.join("、");
      replacement = pairs.map(([, corrected]) => corrected).join("、");
    } else {
      phrase = conversionPhraseFromIssue(finding.issue);
      replacement = replacementForConversionPhrase(phrase);
      if (!originalValue.includes(phrase)) {
        throw new Error(`The flagged phrase ${phrase} is absent from ${finding.sourceWorkbook}/${finding.worksheet}/${address}.`);
      }
      if (phrase === "複印件" && originalValue.includes("紙本複印件")) {
        // The Taiwan term "影本" already means a paper copy; keep the correction concise.
        phrase = "紙本複印件";
      }
      if (phrase === "視頻" && originalValue.includes("電視頻道") && !originalValue.replaceAll("電視頻道", "").includes("視頻")) {
        unmodifiedItems.push({
          finding,
          field,
          phrase,
          reason: "「視頻」是固定用語「電視頻道」的詞中部分；該處不是「影片」的用法。"
        });
        continue;
      }
    }

    const operationKey = `${workbookPath}\u0000${finding.worksheet}\u0000${address}`;
    let operation = operations.get(operationKey);
    if (!operation) {
      operation = {
        workbookPath,
        relativePath: finding.sourceWorkbook,
        worksheet: finding.worksheet,
        address,
        row: finding.row,
        column,
        originalValue,
        newValue: originalValue,
        replacements: [],
        items: []
      };
      operations.set(operationKey, operation);
    } else if (operation.originalValue !== originalValue) {
      throw new Error(`Conflicting source values for ${finding.sourceWorkbook}/${finding.worksheet}/${address}.`);
    }

    const item = makeReportItem(finding, field, phrase, replacement);
    reportItems.push(item);
    operation.items.push(item);

    if (finding.check === "simplified-script") {
      for (const character of simplifiedCharactersFromIssue(finding.issue)) {
        if (operation.replacements.some((candidate) => candidate.before === character)) {
          continue;
        }
        const corrected = SIMPLIFIED_CHARACTER_REPLACEMENTS.get(character);
        operation.newValue = operation.newValue.split(character).join(corrected);
        operation.replacements.push({ before: character, after: corrected });
      }
    } else {
      if (operation.replacements.some((candidate) => candidate.before === phrase)) {
        continue;
      }
      operation.newValue = replaceConversionPhrase(operation.newValue, phrase, replacement);
      operation.replacements.push({ before: phrase, after: replacement });
    }
  }

  for (const operation of operations.values()) {
    if (operation.newValue === operation.originalValue) {
      throw new Error(`A planned change produced no new value at ${operation.relativePath}/${operation.worksheet}/${operation.address}.`);
    }
    const sourceSheet = workbooks.get(operation.workbookPath).workbook.Sheets[operation.worksheet];
    operation.originalCellType = sourceSheet[operation.address].t;
    operation.replacements = operation.replacements.filter((item, index, all) =>
      all.findIndex((candidate) => candidate.before === item.before && candidate.after === item.after) === index
    );
  }

  return {
    findings: selected,
    workbooks,
    operations: Array.from(operations.values()),
    reportItems,
    unmodifiedItems
  };
}

function workbookSnapshot(workbook) {
  const sheets = new Map();
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const cells = new Map();
    for (const [address, cell] of Object.entries(sheet)) {
      if (!/^[A-Z]+\d+$/u.test(address) || (!Object.hasOwn(cell, "v") && !Object.hasOwn(cell, "f"))) {
        continue;
      }
      cells.set(address, JSON.stringify({
        value: cell.v instanceof Date ? { date: cell.v.toISOString() } : cell.v,
        type: cell.t ?? null,
        formula: cell.f ?? null
      }));
    }
    const widthState = (sheet["!cols"] ?? []).map((column) => column == null ? null : ({
      width: column.width ?? null,
      wch: column.wch ?? null,
      wpx: column.wpx ?? null,
      hidden: column.hidden ?? null
    }));
    const rowState = (sheet["!rows"] ?? []).map((row) => row == null ? null : ({
      height: row.hpt ?? null,
      hpx: row.hpx ?? null,
      hidden: row.hidden ?? null
    }));
    sheets.set(sheetName, {
      ref: sheet["!ref"] ?? "",
      cells,
      widths: JSON.stringify(widthState),
      rows: JSON.stringify(rowState),
      merges: JSON.stringify((sheet["!merges"] ?? []).map((merge) => xlsx.utils.encode_range(merge)))
    });
  }
  return { sheetNames: [...workbook.SheetNames], sheets };
}

function verifyAgainstSnapshot(baseline, candidate, operations) {
  const bySheet = new Map();
  for (const operation of operations) {
    const entries = bySheet.get(operation.worksheet) ?? new Map();
    entries.set(operation.address, operation);
    bySheet.set(operation.worksheet, entries);
  }

  if (JSON.stringify(baseline.sheetNames) !== JSON.stringify(candidate.sheetNames)) {
    throw new Error("Workbook worksheet names or order changed.");
  }

  for (const sheetName of baseline.sheetNames) {
    const before = baseline.sheets.get(sheetName);
    const after = candidate.sheets.get(sheetName);
    if (!after) {
      throw new Error(`Worksheet disappeared: ${sheetName}`);
    }
    if (before.ref !== after.ref) {
      throw new Error(`Worksheet range changed in ${sheetName}: ${before.ref} -> ${after.ref}`);
    }
    if (before.widths !== after.widths) {
      throw new Error(`Column widths or visibility changed in ${sheetName}.`);
    }
    if (before.rows !== after.rows) {
      throw new Error(`Row heights or visibility changed in ${sheetName}.`);
    }
    if (before.merges !== after.merges) {
      throw new Error(`Merged cells changed in ${sheetName}.`);
    }

    const expectedCells = bySheet.get(sheetName) ?? new Map();
    const addresses = new Set([...before.cells.keys(), ...after.cells.keys()]);
    for (const address of addresses) {
      const beforeCell = before.cells.get(address) ?? null;
      const afterCell = after.cells.get(address) ?? null;
      const expectedOperation = expectedCells.get(address);
      if (!expectedOperation) {
        if (beforeCell !== afterCell) {
          throw new Error(`Unexpected cell value change at ${sheetName}!${address}.`);
        }
        continue;
      }

      const afterState = afterCell ? JSON.parse(afterCell) : null;
      if (!afterState || afterState.value !== expectedOperation.newValue) {
        throw new Error(`Expected corrected value missing at ${sheetName}!${address}.`);
      }
      const beforeState = beforeCell ? JSON.parse(beforeCell) : null;
      if (!beforeState || afterState.type !== beforeState.type || afterState.formula !== beforeState.formula) {
        throw new Error(`Cell type or formula changed at ${sheetName}!${address}.`);
      }
    }
  }
}

function ensureBackups(workbookPaths) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backups = new Map();
  for (const workbookPath of workbookPaths) {
    const backupPath = path.join(BACKUP_DIR, path.basename(workbookPath));
    const originalHash = sha256(workbookPath);
    if (fs.existsSync(backupPath)) {
      if (sha256(backupPath) !== originalHash) {
        throw new Error(`Existing backup differs from the source: ${path.relative(ROOT, backupPath)}.`);
      }
    } else {
      fs.copyFileSync(workbookPath, backupPath, fs.constants.COPYFILE_EXCL);
    }
    const backupHash = sha256(backupPath);
    if (backupHash !== originalHash) {
      throw new Error(`SHA-256 mismatch for backup ${path.relative(ROOT, backupPath)}.`);
    }
    backups.set(workbookPath, { path: backupPath, originalHash, backupHash });
  }
  return backups;
}

function createDiffReport(plan, backups, verification) {
  const lines = [
    "# Round 1 單字資料修正差異",
    "",
    `檢查 findings：${plan.findings.length} 筆（簡體字 ${TARGET_COUNTS.get("simplified-script")} 筆；轉換錯誤 ${TARGET_COUNTS.get("conversion-term-definite")} 筆）。實際修正 ${plan.reportItems.length} 筆；${plan.unmodifiedItems.length} 筆被判定為誤報而保留。`,
    `實際變更儲存格：${plan.operations.length} 格。只改列出的儲存格值；其餘表格內容未變。`,
    "",
    "## 寫入前備份 SHA-256",
    "",
    "每個備份均在寫入工作簿前複製，原檔與備份檔的 SHA-256 必須完全相同。",
    "",
    "| 工作簿 | 備份檔 | 原檔 SHA-256 | 備份 SHA-256 |",
    "|---|---|---|---|"
  ];
  for (const [workbookPath, backup] of backups) {
    const relativeBackup = path.relative(ROOT, backup.path).replaceAll("\\", "/");
    const workbookName = path.relative(ROOT, workbookPath).replaceAll("\\", "/");
    lines.push(`| ${workbookName} | ${relativeBackup} | ${backup.originalHash} | ${backup.backupHash} |`);
  }

  lines.push(
    "",
    "## 逐格比對結果",
    "",
    "逐一以備份檔與修正後工作簿比較所有工作表、所有有值儲存格、工作表範圍、欄寬、列高與合併儲存格。除了下表列出的預期儲存格外，所有儲存格的值都相同。",
    "",
    "| 工作簿 | 預期變更格數 | 實際變更格數 | 其他儲存格 | 工作表／欄寬／列高 |",
    "|---|---:|---:|---|---|"
  );
  for (const workbookPath of backups.keys()) {
    const result = verification.get(workbookPath);
    lines.push(`| ${path.relative(ROOT, workbookPath).replaceAll("\\", "/")} | ${result.expectedCells} | ${result.changedCells} | ${result.otherCells} | ${result.structure} |`);
  }

  lines.push(
    "",
    "## 修改內容",
    "",
    "| 辭庫 | 工作簿 | 工作表 | 列號 | 單字 | 欄位 | 改前儲存格值 | 改後儲存格值 | 被修正詞組 |",
    "|---|---|---|---:|---|---|---|---|---|"
  );
  for (const item of plan.reportItems) {
    const operation = plan.operations.find((candidate) =>
      candidate.relativePath === item.workbook
      && candidate.worksheet === item.worksheet
      && candidate.row === item.row
      && candidate.items.includes(item)
    );
    lines.push(`| ${markdown(item.track)} | ${markdown(item.workbook)} | ${markdown(item.worksheet)} | ${item.row} | ${markdown(item.word)} | ${item.field} | ${markdown(operation.originalValue)} | ${markdown(operation.newValue)} | ${markdown(item.phrase)} → ${markdown(item.replacement)} |`);
  }

  lines.push("", "## 未修改", "");
  if (!plan.unmodifiedItems.length) {
    lines.push("無。", "");
  } else {
    lines.push(
      "| 辭庫 | 工作簿 | 工作表 | 列號 | 單字 | 被判定詞組 | 未修改理由 |",
      "|---|---|---|---:|---|---|---|"
    );
    for (const item of plan.unmodifiedItems) {
      const finding = item.finding;
      lines.push(`| ${markdown(finding.track)} | ${markdown(finding.sourceWorkbook)} | ${markdown(finding.worksheet)} | ${finding.row} | ${markdown(finding.word)} | ${markdown(item.phrase)} | ${item.reason} |`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function printPlan(plan) {
  const affectedWorkbooks = new Set(plan.operations.map((operation) => operation.workbookPath));
  console.log(`Plan: ${plan.findings.length} definite findings; ${plan.reportItems.length} will be corrected and ${plan.unmodifiedItems.length} will remain unmodified across ${affectedWorkbooks.size} workbooks, changing ${plan.operations.length} cells.`);
  for (const item of plan.unmodifiedItems) {
    const finding = item.finding;
    console.log(`UNMODIFIED: ${finding.sourceWorkbook} / ${finding.worksheet} row ${finding.row} ${finding.word}: ${item.phrase} — ${item.reason}`);
  }
  for (const operation of plan.operations) {
    const fixList = operation.replacements.map((item) => `${item.before}→${item.after}`).join("、");
    console.log(`${operation.relativePath} / ${operation.worksheet} row ${operation.row} ${operation.address}: ${fixList} | ${operation.originalValue} => ${operation.newValue}`);
  }
}

function applyPlan(plan) {
  const affectedWorkbookPaths = Array.from(new Set(plan.operations.map((operation) => operation.workbookPath)));
  const backups = ensureBackups(affectedWorkbookPaths);
  const backupSnapshots = new Map();
  for (const [workbookPath, backup] of backups) {
    const backupWorkbook = xlsx.readFile(backup.path);
    const sourceWorkbook = plan.workbooks.get(workbookPath).workbook;
    const baseline = workbookSnapshot(backupWorkbook);
    const sourceBaseline = workbookSnapshot(sourceWorkbook);
    verifyAgainstSnapshot(baseline, sourceBaseline, []);
    backupSnapshots.set(workbookPath, baseline);
  }

  const operationsByWorkbook = new Map();
  for (const operation of plan.operations) {
    const group = operationsByWorkbook.get(operation.workbookPath) ?? [];
    group.push(operation);
    operationsByWorkbook.set(operation.workbookPath, group);
    const sheet = plan.workbooks.get(operation.workbookPath).workbook.Sheets[operation.worksheet];
    const cell = sheet[operation.address];
    cell.v = operation.newValue;
    delete cell.w;
  }

  const temporaryFiles = new Map();
  const replaced = [];
  try {
    for (const [workbookPath, state] of plan.workbooks) {
      if (!backups.has(workbookPath)) {
        continue;
      }
      const temporaryPath = path.join(path.dirname(workbookPath), `.fix-round1-${process.pid}-${path.basename(workbookPath)}`);
      if (fs.existsSync(temporaryPath)) {
        throw new Error(`Temporary workbook path already exists: ${temporaryPath}`);
      }
      xlsx.writeFile(state.workbook, temporaryPath, { bookType: "xlsx" });
      temporaryFiles.set(workbookPath, temporaryPath);
      const writtenWorkbook = xlsx.readFile(temporaryPath);
      verifyAgainstSnapshot(backupSnapshots.get(workbookPath), workbookSnapshot(writtenWorkbook), operationsByWorkbook.get(workbookPath) ?? []);
    }

    for (const [workbookPath, temporaryPath] of temporaryFiles) {
      fs.renameSync(temporaryPath, workbookPath);
      replaced.push(workbookPath);
    }

    const verification = new Map();
    for (const [workbookPath, backup] of backups) {
      const newWorkbook = xlsx.readFile(workbookPath);
      const baseline = backupSnapshots.get(workbookPath);
      const workbookOperations = operationsByWorkbook.get(workbookPath) ?? [];
      verifyAgainstSnapshot(baseline, workbookSnapshot(newWorkbook), workbookOperations);
      verification.set(workbookPath, {
        expectedCells: workbookOperations.length,
        changedCells: workbookOperations.length,
        otherCells: "通過：其餘所有儲存格值相同",
        structure: "通過：工作表、欄寬、列高與合併格相同"
      });
      const sourceHash = sha256(workbookPath);
      const backupHash = sha256(backup.path);
      if (sourceHash === backupHash) {
        throw new Error(`Workbook hash did not change after planned edits: ${path.basename(workbookPath)}.`);
      }
    }

    fs.mkdirSync(path.dirname(DIFF_REPORT_PATH), { recursive: true });
    fs.writeFileSync(DIFF_REPORT_PATH, createDiffReport(plan, backups, verification), "utf8");
    console.log(`Updated ${plan.operations.length} cells in ${backups.size} workbooks; ${plan.unmodifiedItems.length} definite finding(s) were left unchanged as false positives.`);
    console.log(`SHA-256 and cell-by-cell checks passed for every backup/workbook pair.`);
    console.log(`Diff report: ${path.relative(ROOT, DIFF_REPORT_PATH)}`);
  } catch (error) {
    for (const workbookPath of replaced.reverse()) {
      fs.copyFileSync(backups.get(workbookPath).path, workbookPath);
    }
    for (const temporaryPath of temporaryFiles.values()) {
      if (fs.existsSync(temporaryPath)) {
        fs.unlinkSync(temporaryPath);
      }
    }
    throw error;
  }
}

const plan = preparePlan();
if (process.argv.includes("--apply")) {
  applyPlan(plan);
} else {
  printPlan(plan);
}
