import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const jsonPath = path.join(repoRoot, "outputs", "vocab_levels.json");
const outputDir = path.join(repoRoot, "outputs", "ceec_vocab_levels");
const outputPath = path.join(outputDir, "詞彙分級表_levels.xlsx");

async function main() {
  const raw = await fs.readFile(jsonPath, "utf8");
  const levels = JSON.parse(raw);

  await fs.mkdir(outputDir, { recursive: true });

  const workbook = Workbook.create();
  const headerFormat = {
    fill: "#1F4E78",
    font: { bold: true, color: "#FFFFFF" },
  };

  for (const [sheetName, words] of Object.entries(levels)) {
    const sheet = workbook.worksheets.add(sheetName);
    const rows = [["No.", "Word"], ...words.map((word, index) => [index + 1, word])];
    const lastRow = rows.length;

    sheet.getRange(`A1:B${lastRow}`).values = rows;
    sheet.getRange("A1:B1").format = headerFormat;
    sheet.getRange(`A1:B${lastRow}`).format.borders = {
      preset: "all",
      style: "thin",
      color: "#D9E2F3",
    };
    sheet.getRange(`A2:A${lastRow}`).format.numberFormat = "0";
    sheet.getRange(`A1:A${lastRow}`).format.columnWidthPx = 64;
    sheet.getRange(`B1:B${lastRow}`).format.columnWidthPx = 300;
    sheet.getRange(`A1:B${lastRow}`).format.wrapText = true;
    sheet.freezePanes.freezeRows(1);
  }

  const inspect = await workbook.inspect({
    kind: "table",
    range: "Level 1!A1:B12",
    include: "values",
    tableMaxRows: 12,
    tableMaxCols: 2,
  });
  console.log(inspect.ndjson);

  for (const sheetName of Object.keys(levels)) {
    const preview = await workbook.render({
      sheetName,
      range: "A1:B30",
      scale: 1.25,
      format: "png",
    });
    await fs.writeFile(
      path.join(outputDir, `${sheetName.toLowerCase().replace(/\s+/g, "_")}_preview.png`),
      new Uint8Array(await preview.arrayBuffer()),
    );
  }

  const xlsx = await SpreadsheetFile.exportXlsx(workbook);
  await xlsx.save(outputPath);

  console.log(outputPath);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
