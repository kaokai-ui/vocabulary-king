import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const levelPath = path.join(repoRoot, "outputs", "ceec_vocab_levels", "詞彙分級表_levels.xlsx");
const examplePath = path.join(repoRoot, "outputs", "vocab_examples", "英文單字7000_意思例句.xlsx");
const outputDir = path.join(repoRoot, "outputs", "ceec_vocab_levels");
const outputPath = path.join(outputDir, "詞彙分級表_levels_附意思例句.xlsx");

const levelSheets = ["Level 1", "Level 2", "Level 3", "Level 4", "Level 5", "Level 6"];

function normalizeWord(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function buildCandidates(entry) {
  const raw = normalizeWord(entry);
  const noParens = raw.replace(/\s*\([^)]*\)/g, "").trim();
  const candidates = [raw, noParens];

  for (const part of noParens.split("/")) {
    const candidate = part.trim();
    if (candidate) candidates.push(candidate);
  }

  return [...new Set(candidates.filter(Boolean))];
}

async function importWorkbook(filePath) {
  const blob = await FileBlob.load(filePath);
  return SpreadsheetFile.importXlsx(blob);
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });

  const levelWorkbook = await importWorkbook(levelPath);
  const exampleWorkbook = await importWorkbook(examplePath);

  const exampleSheet = exampleWorkbook.worksheets.getItem("單字表");
  const exampleRows = exampleSheet.getUsedRange().values.slice(1);
  const exampleMap = new Map();

  for (const row of exampleRows) {
    const [word, meaning, sentence] = row;
    const key = normalizeWord(word);
    if (key) {
      exampleMap.set(key, {
        meaning: meaning ?? "",
        example: sentence ?? "",
      });
    }
  }

  const summary = [];

  for (const sheetName of levelSheets) {
    const sheet = levelWorkbook.worksheets.getItem(sheetName);
    const usedRange = sheet.getUsedRange();
    const values = usedRange.values;
    const lastRow = values.length;
    const outputRows = [];
    let matched = 0;

    for (let rowIndex = 1; rowIndex < lastRow; rowIndex += 1) {
      const vocab = values[rowIndex]?.[1] ?? "";
      let found = null;

      for (const candidate of buildCandidates(vocab)) {
        if (exampleMap.has(candidate)) {
          found = exampleMap.get(candidate);
          break;
        }
      }

      if (found) {
        matched += 1;
        outputRows.push([found.meaning, found.example]);
      } else {
        outputRows.push(["", ""]);
      }
    }

    sheet.getRange("C1:D1").values = [["意思", "例句"]];
    sheet.getRange("C1:D1").format = {
      fill: "#1F4E78",
      font: { bold: true, color: "#FFFFFF" },
    };
    sheet.getRange(`C2:D${lastRow}`).values = outputRows;
    sheet.getRange(`C1:D${lastRow}`).format.borders = {
      preset: "all",
      style: "thin",
      color: "#D9E2F3",
    };
    sheet.getRange(`C1:C${lastRow}`).format.columnWidthPx = 180;
    sheet.getRange(`D1:D${lastRow}`).format.columnWidthPx = 640;
    sheet.getRange(`C1:D${lastRow}`).format.wrapText = true;

    summary.push({ sheetName, rows: lastRow - 1, matched });
  }

  const inspect = await levelWorkbook.inspect({
    kind: "table",
    range: "Level 4!A1:D8",
    include: "values",
    tableMaxRows: 8,
    tableMaxCols: 4,
  });
  console.log(inspect.ndjson);
  console.log(JSON.stringify(summary));

  const preview = await levelWorkbook.render({
    sheetName: "Level 4",
    range: "A1:D18",
    scale: 1.2,
    format: "png",
  });
  await fs.writeFile(
    path.join(outputDir, "level4_merge_preview.png"),
    new Uint8Array(await preview.arrayBuffer()),
  );

  const xlsx = await SpreadsheetFile.exportXlsx(levelWorkbook);
  await xlsx.save(outputPath);

  console.log(outputPath);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
