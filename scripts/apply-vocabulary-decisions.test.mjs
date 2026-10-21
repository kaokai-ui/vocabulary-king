import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import xlsx from "xlsx";
import {
  findWordCollisionBlocks,
  formatBilingualExample,
  mapDecisionsToSources,
  normalizeWord,
  splitToeicMeaning,
  verifyAgainstSnapshot,
  workbookSnapshot
} from "./apply-vocabulary-decisions.mjs";

const patcherPath = path.join(process.cwd(), "scripts", "patch-xlsx-cell-values.py");

function sourceRecord(id, word, meaning = "意思", example = "A sentence. (句子。)") {
  return {
    id,
    track: "fixture",
    word,
    meaning,
    example,
    englishExample: "A sentence.",
    chineseTranslation: "句子。",
    worksheet: "Sheet1",
    row: Number(id.slice(1)),
    sourceWorkbook: "fixture.xlsx"
  };
}

describe("vocabulary decision writeback planning", () => {
  it("maps a part decision to the checker source row by the original exported values", () => {
    const part = {
      track: "fixture",
      id: "export-book",
      word: "book",
      meaning: "書本",
      example: "A sentence. (句子。)"
    };
    const source = sourceRecord("r2", "book", "書本");
    const result = mapDecisionsToSources({
      track: "fixture",
      decisions: [{ id: part.id, word: part.word, decision: "accept", final: { example_zh: "一本書。" } }],
      partRecords: [part],
      sourceRecords: [source]
    });

    expect(result.mapped).toHaveLength(1);
    expect(result.mapped[0].sourceRecord.id).toBe("r2");
    expect(result.notWritten).toEqual([]);
  });

  it("leaves an ambiguous source match unwritten instead of guessing a row", () => {
    const part = {
      track: "fixture",
      id: "export-book",
      word: "book",
      meaning: "書本",
      example: "A sentence. (句子。)"
    };
    const result = mapDecisionsToSources({
      track: "fixture",
      decisions: [{ id: part.id, word: part.word, decision: "accept", final: { meaning: "書籍" } }],
      partRecords: [part],
      sourceRecords: [sourceRecord("r2", "book", "書本"), sourceRecord("r3", "book", "書本")]
    });

    expect(result.mapped).toEqual([]);
    expect(result.notWritten[0].reason).toContain("無法唯一對應列號");
  });

  it("maps a combined GEPT entry to all of its contributing source rows", () => {
    const part = {
      track: "gept-high-intermediate",
      id: "L5-blot-noun-verb",
      level: "L5",
      word: "blot",
      meaning: "noun/verb 墨水漬、汙點\nverb 用紙吸乾液體",
      example: "There is a stain. (襯衫上有汙漬。)"
    };
    const sourceRecords = [
      {
        ...sourceRecord("r2", "blot", "noun/verb 墨水漬、汙點"),
        track: "gept-high-intermediate",
        exportLevel: "L5",
        meaning: "noun/verb 墨水漬、汙點",
        example: part.example
      },
      {
        ...sourceRecord("r3", "blot", "verb 用紙吸乾液體"),
        track: "gept-high-intermediate",
        exportLevel: "L5",
        meaning: "verb 用紙吸乾液體",
        example: part.example
      }
    ];
    const result = mapDecisionsToSources({
      track: "gept-high-intermediate",
      decisions: [{
        id: part.id,
        word: part.word,
        decision: "accept",
        final: {
          example_en: "A blot of ink spread.",
          example_zh: "一團墨水在紙上暈開。"
        }
      }],
      partRecords: [part],
      sourceRecords
    });

    expect(result.mapped).toHaveLength(1);
    expect(result.mapped[0].exampleSourceRecords.map((record) => record.id)).toEqual(["r2", "r3"]);
    expect(result.notWritten).toEqual([]);
  });

  it("blocks a word change that creates a duplicate headword", () => {
    const records = [sourceRecord("r2", "cat"), sourceRecord("r3", "dog")];
    const item = {
      track: "fixture",
      decision: { id: "export-cat" },
      part: { word: "cat" },
      sourceRecord: records[0],
      final: { word: "dog" }
    };
    const result = findWordCollisionBlocks(records, [item]);

    expect(result.blockedItems).toHaveLength(1);
    expect(result.blockedItems[0].reason).toContain("dog (Sheet1!3)");
  });

  it("blocks a word change that matches an existing headword after normalization", () => {
    const records = [sourceRecord("r2", "headquarter"), sourceRecord("r3", "Head quarters")];
    const item = {
      track: "fixture",
      decision: { id: "export-headquarter" },
      part: { word: "headquarter" },
      sourceRecord: records[0],
      final: { word: "  HEAD   QUARTERS " }
    };
    const result = findWordCollisionBlocks(records, [item]);

    expect(result.blockedItems).toHaveLength(1);
    expect(result.blockedItems[0].reason).toContain("Head quarters (Sheet1!3)");
  });

  it("allows coordinated word changes when the resulting dictionary has no duplicate", () => {
    const records = [sourceRecord("r2", "cat"), sourceRecord("r3", "dog")];
    const items = [
      { track: "fixture", decision: { id: "export-cat" }, part: { word: "cat" }, sourceRecord: records[0], final: { word: "dog" } },
      { track: "fixture", decision: { id: "export-dog" }, part: { word: "dog" }, sourceRecord: records[1], final: { word: "cat" } }
    ];

    expect(findWordCollisionBlocks(records, items).blockedItems).toEqual([]);
  });

  it("normalizes headwords and builds the same bilingual example shape as the exporter", () => {
    expect(normalizeWord("  From   Now On ")).toBe("from now on");
    expect(formatBilingualExample(" An example. ", " 中文。 ")).toBe("An example. (中文。)");
    expect(formatBilingualExample("An example.", "")).toBe("An example.");
  });

  it("splits TOEIC meaning text into its part-of-speech and description columns", () => {
    expect(splitToeicMeaning("a. 大量的；充足的", "n")).toEqual({
      pos: "a",
      meaning: "大量的；充足的"
    });
    expect(splitToeicMeaning("n / a. 基礎；基本的", "n / a")).toEqual({
      pos: "n / a",
      meaning: "基礎；基本的"
    });
    expect(() => splitToeicMeaning("沒有詞性標記的內容", "n")).toThrow(/part-of-speech prefix/u);
  });

  it("patches only the requested OOXML cell and preserves dimensions and merges", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vocab-round2-xlsx-"));
    const inputPath = path.join(directory, "input.xlsx");
    const operationsPath = path.join(directory, "operations.json");
    const outputPath = path.join(directory, "output.xlsx");
    try {
      const workbook = xlsx.utils.book_new();
      const sheet = xlsx.utils.aoa_to_sheet([
        ["Word", "Example", "Merged", "", "", "", "", "", "Unused"],
        ["book", "old & value", "keep", "keep too", "", "", "", "", ""],
        ["lamp", "unchanged", "same", "same", "", "", "", "", ""]
      ]);
      sheet["!ref"] = "A1:I3";
      sheet["!cols"] = [{ wch: 16 }, { wch: 32 }, { wch: 12 }, { wch: 12 }];
      sheet["!rows"] = [{ hpt: 19 }, { hpt: 25 }, { hpt: 28 }];
      sheet["!merges"] = [{ s: { r: 0, c: 2 }, e: { r: 0, c: 3 } }];
      xlsx.utils.book_append_sheet(workbook, sheet, "Sheet1");
      xlsx.writeFile(workbook, inputPath, { bookType: "xlsx", bookSST: true, cellStyles: true });

      const beforeWorkbook = xlsx.readFile(inputPath, { cellStyles: true, cellNF: true, cellDates: true });
      fs.writeFileSync(operationsPath, JSON.stringify([
        { worksheet: "Sheet1", address: "B2", oldValue: "old & value", newValue: "new < value" },
        { worksheet: "Sheet1", address: "E2", oldValue: "", newValue: "added into blank cell" }
      ]), "utf8");
      const result = spawnSync("python", [patcherPath, inputPath, operationsPath, outputPath], {
        encoding: "utf8",
        windowsHide: true
      });
      expect(result.status, result.stderr || result.stdout).toBe(0);

      const afterWorkbook = xlsx.readFile(outputPath, { cellStyles: true, cellNF: true, cellDates: true });
      expect(afterWorkbook.Sheets.Sheet1.B2.v).toBe("new < value");
      expect(afterWorkbook.Sheets.Sheet1.E2.v).toBe("added into blank cell");
      expect(afterWorkbook.Sheets.Sheet1.C2.v).toBe("keep");
      expect(afterWorkbook.Sheets.Sheet1.D3.v).toBe("same");
      expect(verifyAgainstSnapshot(
        workbookSnapshot(beforeWorkbook),
        workbookSnapshot(afterWorkbook),
        [
          { worksheet: "Sheet1", address: "B2", newValue: "new < value" },
          { worksheet: "Sheet1", address: "E2", newValue: "added into blank cell" }
        ]
      )).toMatchObject({
        expectedCells: 2,
        changedCells: 2,
        otherCells: "通過：其餘所有工作表儲存格值相同",
        structure: "通過：工作表、欄寬、列高與合併儲存格相同"
      });
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("patches workbooks that store text inline and have no shared string table", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vocab-round2-inline-"));
    const inputPath = path.join(directory, "input.xlsx");
    const operationsPath = path.join(directory, "operations.json");
    const outputPath = path.join(directory, "output.xlsx");
    try {
      const workbook = xlsx.utils.book_new();
      const sheet = xlsx.utils.aoa_to_sheet([["Word", "Example"], ["book", "old text"]]);
      xlsx.utils.book_append_sheet(workbook, sheet, "Sheet1");
      xlsx.writeFile(workbook, inputPath, { bookType: "xlsx", cellStyles: true });
      const archiveCheck = spawnSync("python", ["-c", "import sys,zipfile; print('xl/sharedStrings.xml' in zipfile.ZipFile(sys.argv[1]).namelist())", inputPath], {
        encoding: "utf8",
        windowsHide: true
      });
      expect(archiveCheck.status, archiveCheck.stderr).toBe(0);
      expect(archiveCheck.stdout.trim()).toBe("False");

      const beforeWorkbook = xlsx.readFile(inputPath, { cellStyles: true, cellNF: true, cellDates: true });
      fs.writeFileSync(operationsPath, JSON.stringify([
        { worksheet: "Sheet1", address: "B2", oldValue: "old text", newValue: "new text" }
      ]), "utf8");
      const result = spawnSync("python", [patcherPath, inputPath, operationsPath, outputPath], {
        encoding: "utf8",
        windowsHide: true
      });
      expect(result.status, result.stderr || result.stdout).toBe(0);

      const afterWorkbook = xlsx.readFile(outputPath, { cellStyles: true, cellNF: true, cellDates: true });
      expect(afterWorkbook.Sheets.Sheet1.B2.v).toBe("new text");
      expect(verifyAgainstSnapshot(
        workbookSnapshot(beforeWorkbook),
        workbookSnapshot(afterWorkbook),
        [{ worksheet: "Sheet1", address: "B2", newValue: "new text" }]
      )).toMatchObject({
        expectedCells: 1,
        changedCells: 1,
        otherCells: "通過：其餘所有工作表儲存格值相同"
      });
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
