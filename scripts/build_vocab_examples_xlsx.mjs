import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const jsonPath = path.join(repoRoot, "outputs", "vocab_examples.json");
const outputDir = path.join(repoRoot, "outputs", "vocab_examples");
const outputPath = path.join(outputDir, "英文單字7000_意思例句.xlsx");

async function main() {
  const raw = await fs.readFile(jsonPath, "utf8");
  const rows = JSON.parse(raw);

  await fs.mkdir(outputDir, { recursive: true });

  const workbook = Workbook.create();
  const sheet = workbook.worksheets.add("單字表");

  const values = [
    ["英文單字", "意思", "例句"],
    ...rows.map((row) => [row["英文單字"], row["意思"], row["例句"]]),
  ];
  const lastRow = values.length;

  sheet.getRange(`A1:C${lastRow}`).values = values;
  sheet.getRange("A1:C1").format = {
    fill: "#1F4E78",
    font: { bold: true, color: "#FFFFFF" },
  };
  sheet.getRange(`A1:C${lastRow}`).format.borders = {
    preset: "all",
    style: "thin",
    color: "#D9E2F3",
  };
  sheet.getRange(`A1:A${lastRow}`).format.columnWidthPx = 190;
  sheet.getRange(`B1:B${lastRow}`).format.columnWidthPx = 180;
  sheet.getRange(`C1:C${lastRow}`).format.columnWidthPx = 640;
  sheet.getRange(`A1:C${lastRow}`).format.wrapText = true;
  sheet.freezePanes.freezeRows(1);
  sheet.freezePanes.freezeColumns(1);

  const inspect = await workbook.inspect({
    kind: "table",
    range: "單字表!A1:C8",
    include: "values",
    tableMaxRows: 8,
    tableMaxCols: 3,
  });
  console.log(inspect.ndjson);

  const preview = await workbook.render({
    sheetName: "單字表",
    range: "A1:C18",
    scale: 1.2,
    format: "png",
  });
  await fs.writeFile(
    path.join(outputDir, "preview.png"),
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
