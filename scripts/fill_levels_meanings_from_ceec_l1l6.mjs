import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const sourceWorkbookPath = path.join(
  repoRoot,
  "outputs",
  "ceec_vocab_levels",
  "詞彙分級表_levels_附意思例句_補voc2000_補國中單字王2000.xlsx",
);
const pdfJsonPath = path.join(repoRoot, "outputs", "ceec_l1l6_pdf_meanings.json");
const outputDir = path.join(repoRoot, "outputs", "ceec_vocab_levels");
const outputPath = path.join(
  outputDir,
  "詞彙分級表_levels_附意思例句_補voc2000_補國中單字王2000_補大考中心L1L6.xlsx",
);

function normalize(text) {
  return String(text ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("／", "/")
    .replaceAll("…", "...")
    .replace(/\s+/g, " ");
}

function expandParentheticalWord(text) {
  return text.replace(/([^()]*)\(([^)]+)\)/g, "$1$2");
}

function candidateWords(word) {
  const raw = normalize(word);
  const withoutNumberParens = raw.replace(/\s*\(\d+\)/g, "").trim();
  const withoutAnyParens = withoutNumberParens.replace(/\([^)]*\)/g, "").trim();
  const expandedParens = expandParentheticalWord(withoutNumberParens).trim();

  const candidates = [raw, withoutNumberParens, withoutAnyParens, expandedParens];
  for (const base of [withoutNumberParens, withoutAnyParens, expandedParens]) {
    for (const part of base.split("/")) {
      const candidate = part.trim();
      if (candidate) candidates.push(candidate);
    }
  }
  return [...new Set(candidates.filter(Boolean))];
}

function resolveMeaning(word, levelMap) {
  const meanings = [];
  const raw = normalize(word);
  const baseForNumbered = raw
    .replace(/\s*\(\d+\)/g, "")
    .replace(/\([^)]*\)/g, "")
    .trim();

  for (const candidate of candidateWords(word)) {
    if (levelMap.has(candidate)) {
      const meaning = levelMap.get(candidate);
      if (meaning && !meanings.includes(meaning)) meanings.push(meaning);
    }
  }
  if (baseForNumbered) {
    for (const [key, meaning] of levelMap.entries()) {
      if (key.startsWith(baseForNumbered) && /\d+$/.test(key.slice(baseForNumbered.length))) {
        if (meaning && !meanings.includes(meaning)) meanings.push(meaning);
      }
    }
  }
  return meanings.join("；");
}

async function importWorkbook(filePath) {
  const blob = await FileBlob.load(filePath);
  return SpreadsheetFile.importXlsx(blob);
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });

  const workbook = await importWorkbook(sourceWorkbookPath);
  const ceecMeanings = JSON.parse(await fs.readFile(pdfJsonPath, "utf8"));
  const summary = [];

  for (const sheetName of ["Level 1", "Level 2", "Level 3", "Level 4", "Level 5", "Level 6"]) {
    const sheet = workbook.worksheets.getItem(sheetName);
    const values = sheet.getUsedRange().values;
    const lastRow = values.length;
    const updates = [];
    let filled = 0;
    const levelMap = new Map(
      Object.entries(ceecMeanings[sheetName] ?? {}).map(([word, meaning]) => [normalize(word), meaning]),
    );

    for (let rowIndex = 1; rowIndex < lastRow; rowIndex += 1) {
      const currentMeaning = values[rowIndex]?.[2] ?? "";
      if (currentMeaning) {
        updates.push([currentMeaning]);
        continue;
      }

      const word = values[rowIndex]?.[1] ?? "";
      const meaning = resolveMeaning(word, levelMap);
      if (meaning) filled += 1;
      updates.push([meaning]);
    }

    sheet.getRange(`C2:C${lastRow}`).values = updates;
    summary.push({ sheetName, filled });
  }

  const inspect = await workbook.inspect({
    kind: "table",
    range: "Level 3!A1:D12",
    include: "values",
    tableMaxRows: 12,
    tableMaxCols: 4,
  });
  console.log(inspect.ndjson);
  console.log(JSON.stringify(summary));

  const preview = await workbook.render({
    sheetName: "Level 3",
    range: "A1:D18",
    scale: 1.2,
    format: "png",
  });
  await fs.writeFile(
    path.join(outputDir, "level3_ceec_preview.png"),
    new Uint8Array(await preview.arrayBuffer()),
  );

  const xlsx = await SpreadsheetFile.exportXlsx(workbook);
  await xlsx.save(outputPath);

  console.log(outputPath);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
