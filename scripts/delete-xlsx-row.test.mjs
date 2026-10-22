import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import xlsx from "xlsx";

const scriptPath = path.join(process.cwd(), "scripts", "delete-xlsx-row.py");
const tempDirectories = new Set();

function makeWorkbook() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vocab-delete-row-"));
  tempDirectories.add(directory);
  const inputPath = path.join(directory, "input.xlsx");
  const outputPath = path.join(directory, "output.xlsx");
  const workbook = xlsx.utils.book_new();
  const sheet = xlsx.utils.aoa_to_sheet([
    ["Word", "Meaning", "Merged", ""],
    ["misinterpret", "correct entry", "", ""],
    ["misinterprete", "duplicate entry", "", ""],
    ["mismanage", "later row", "", ""],
    ["misplace", "last row", "", ""]
  ]);
  sheet["!cols"] = [{ wch: 18 }, { wch: 28 }, { wch: 14 }, { wch: 14 }];
  sheet["!rows"] = [{ hpt: 19 }, { hpt: 25 }, { hpt: 27 }, { hpt: 29 }, { hpt: 31 }];
  sheet["!merges"] = [{ s: { r: 0, c: 2 }, e: { r: 0, c: 3 } }];
  xlsx.utils.book_append_sheet(workbook, sheet, "工作表1");
  xlsx.writeFile(workbook, inputPath, { bookType: "xlsx", bookSST: true, cellStyles: true });
  return { inputPath, outputPath };
}

function runDelete(inputPath, outputPath, previousWord = "misinterpret", targetWord = "misinterprete") {
  const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
  return spawnSync(python, [
    scriptPath,
    inputPath,
    outputPath,
    "工作表1",
    "3",
    "A",
    previousWord,
    targetWord
  ], { encoding: "utf8", windowsHide: true });
}

afterEach(() => {
  for (const directory of tempDirectories) fs.rmSync(directory, { recursive: true, force: true });
  tempDirectories.clear();
});

describe("safe XLSX row deletion", () => {
  it("removes only the guarded row and shifts following row references", () => {
    const { inputPath, outputPath } = makeWorkbook();
    const result = runDelete(inputPath, outputPath);
    expect(result.status, result.stderr || result.stdout).toBe(0);

    const before = xlsx.readFile(inputPath, { cellStyles: true, cellNF: true, cellDates: true });
    const after = xlsx.readFile(outputPath, { cellStyles: true, cellNF: true, cellDates: true });
    const beforeSheet = before.Sheets["工作表1"];
    const afterSheet = after.Sheets["工作表1"];
    expect(afterSheet["!ref"]).toBe("A1:D4");
    expect(afterSheet.A2.v).toBe("misinterpret");
    expect(afterSheet.B2.v).toBe("correct entry");
    expect(afterSheet.A3.v).toBe("mismanage");
    expect(afterSheet.B3.v).toBe("later row");
    expect(afterSheet.A4.v).toBe("misplace");
    expect(afterSheet.B4.v).toBe("last row");
    expect(afterSheet["!cols"]).toEqual(beforeSheet["!cols"]);
    expect(afterSheet["!merges"]).toEqual(beforeSheet["!merges"]);
    expect(afterSheet["!rows"]).toEqual([
      beforeSheet["!rows"][0],
      beforeSheet["!rows"][1],
      beforeSheet["!rows"][3],
      beforeSheet["!rows"][4]
    ]);
  });

  it("refuses to delete when either neighboring word fails the guard", () => {
    const { inputPath, outputPath } = makeWorkbook();
    const wrongPrevious = runDelete(inputPath, outputPath, "mismanage", "misinterprete");
    expect(wrongPrevious.status).not.toBe(0);
    expect(wrongPrevious.stderr).toContain("Deletion guard failed");
    expect(fs.existsSync(outputPath)).toBe(false);

    const wrongTarget = runDelete(inputPath, outputPath, "misinterpret", "misinterpret");
    expect(wrongTarget.status).not.toBe(0);
    expect(wrongTarget.stderr).toContain("Deletion guard failed");
    expect(fs.existsSync(outputPath)).toBe(false);
  });
});
