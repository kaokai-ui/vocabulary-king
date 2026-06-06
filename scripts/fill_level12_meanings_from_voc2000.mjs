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
  "詞彙分級表_levels_附意思例句.xlsx",
);
const vocJsonPath = path.join(repoRoot, "outputs", "voc2000_meanings.json");
const outputDir = path.join(repoRoot, "outputs", "ceec_vocab_levels");
const outputPath = path.join(
  outputDir,
  "詞彙分級表_levels_附意思例句_補voc2000.xlsx",
);

function normalize(text) {
  return String(text ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("／", "/")
    .replaceAll("’", "'")
    .replace(/\s+/g, " ");
}

function stripParens(text) {
  return text.replace(/\s*\([^)]*\)/g, "").trim();
}

function firstVariant(text) {
  return stripParens(text)
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)[0];
}

function resolveMeaning(word, vocMap) {
  const raw = normalize(word);
  const base = stripParens(raw);
  if (vocMap.has(raw)) return vocMap.get(raw);
  if (vocMap.has(base)) return vocMap.get(base);

  const first = firstVariant(raw);
  if (first && vocMap.has(first)) return vocMap.get(first);

  return "";
}

async function importWorkbook(filePath) {
  const blob = await FileBlob.load(filePath);
  return SpreadsheetFile.importXlsx(blob);
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });

  const workbook = await importWorkbook(sourceWorkbookPath);
  const vocRows = JSON.parse(await fs.readFile(vocJsonPath, "utf8"));
  const vocMap = new Map(vocRows.map((row) => [normalize(row.word), row.meaning]));

  const summary = [];
  for (const sheetName of ["Level 1", "Level 2"]) {
    const sheet = workbook.worksheets.getItem(sheetName);
    const values = sheet.getUsedRange().values;
    const lastRow = values.length;
    let filled = 0;
    const updates = [];

    for (let rowIndex = 1; rowIndex < lastRow; rowIndex += 1) {
      const word = values[rowIndex]?.[1] ?? "";
      const currentMeaning = values[rowIndex]?.[2] ?? "";
      if (currentMeaning) {
        updates.push([currentMeaning]);
        continue;
      }

      const meaning = resolveMeaning(word, vocMap);
      if (meaning) filled += 1;
      updates.push([meaning]);
    }

    sheet.getRange(`C2:C${lastRow}`).values = updates;
    summary.push({ sheetName, filled });
  }

  const inspect = await workbook.inspect({
    kind: "table",
    range: "Level 1!A1:D12",
    include: "values",
    tableMaxRows: 12,
    tableMaxCols: 4,
  });
  console.log(inspect.ndjson);
  console.log(JSON.stringify(summary));

  const preview = await workbook.render({
    sheetName: "Level 1",
    range: "A1:D18",
    scale: 1.2,
    format: "png",
  });
  await fs.writeFile(
    path.join(outputDir, "level1_voc2000_preview.png"),
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
