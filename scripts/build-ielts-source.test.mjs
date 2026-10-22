import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import xlsx from "xlsx";
import { buildIeltsSourceWorkbook } from "./build-ielts-source.mjs";

const temporaryDirectories = [];
const taskRelativePath = path.join("docs", "tasks", "ielts-merge-20261022");

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "build-ielts-source-"));
  temporaryDirectories.push(root);
  return root;
}

function writeJsonl(root, relativePath, records) {
  const filePath = path.join(root, taskRelativePath, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : ""), "utf8");
}

function readWorkbookRows(filePath) {
  const workbook = xlsx.readFile(filePath);
  return xlsx.utils.sheet_to_json(workbook.Sheets.IELTS, { header: 1, defval: "" });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("buildIeltsSourceWorkbook", () => {
  it("writes the TOEFL four-column layout from short examples when examples-long is incomplete", () => {
    const root = makeRoot();
    const shortEntries = [
      { word: "alpha", meaning: "n. 甲", sense: "n. 甲", example_en: "Alpha grows well.", example_zh: "甲生長良好。" },
      { word: "beta", meaning: "v. 改善", sense: "v. 改善", example_en: "The plan improved.", example_zh: "計畫改善了。" }
    ];
    writeJsonl(root, "examples/part-01.jsonl", shortEntries);
    writeJsonl(root, "examples-long/part-01.jsonl", [
      { word: "alpha", sense: "n. 甲", example_en: "An unapproved longer sentence.", example_zh: "未核准的長句。" }
    ]);

    const result = buildIeltsSourceWorkbook({ root, expectedWordCount: 2 });

    expect(result).toMatchObject({ count: 2, usedLongSentences: false, longSentenceCount: 0 });
    expect(readWorkbookRows(result.outputPath)).toEqual([
      ["Word", "Chinese Meaning", "English Example", "Chinese Translation"],
      ["alpha", "n. 甲", "Alpha grows well.", "甲生長良好。"],
      ["beta", "v. 改善", "The plan improved.", "計畫改善了。"]
    ]);
  });

  it("uses completed long examples only for starred words and preserves source order", () => {
    const root = makeRoot();
    writeJsonl(root, "examples/part-01.jsonl", [
      { word: "alpha", meaning: "n. 甲", sense: "n. 甲", example_en: "Alpha grows well.", example_zh: "甲生長良好。" },
      { word: "beta", meaning: "v. 改善", sense: "v. 改善", example_en: "The plan improved.", example_zh: "計畫改善了。" }
    ]);
    writeJsonl(root, "parts/part-01.jsonl", [
      { word: "alpha", starred: true },
      { word: "beta", starred: false }
    ]);
    writeJsonl(root, "examples-long/part-01.jsonl", [
      { word: "alpha", sense: "n. 甲", example_en: "Alpha, which thrives in warm soil, can support local farms.", example_zh: "甲在溫暖土壤中茁壯，能支持當地農場。" }
    ]);
    const donePath = path.join(root, taskRelativePath, "examples-long", "DONE");
    fs.writeFileSync(donePath, "", "utf8");

    const result = buildIeltsSourceWorkbook({ root, expectedWordCount: 2 });

    expect(result).toMatchObject({ count: 2, usedLongSentences: true, longSentenceCount: 1 });
    expect(readWorkbookRows(result.outputPath)).toEqual([
      ["Word", "Chinese Meaning", "English Example", "Chinese Translation"],
      ["alpha", "n. 甲", "Alpha, which thrives in warm soil, can support local farms.", "甲在溫暖土壤中茁壯，能支持當地農場。"],
      ["beta", "v. 改善", "The plan improved.", "計畫改善了。"]
    ]);
  });

  it("rejects an incomplete long-example set when the DONE marker is present", () => {
    const root = makeRoot();
    writeJsonl(root, "examples/part-01.jsonl", [
      { word: "alpha", meaning: "n. 甲", sense: "n. 甲", example_en: "Alpha grows well.", example_zh: "甲生長良好。" }
    ]);
    writeJsonl(root, "parts/part-01.jsonl", [{ word: "alpha", starred: true }]);
    writeJsonl(root, "examples-long/part-01.jsonl", []);
    const donePath = path.join(root, taskRelativePath, "examples-long", "DONE");
    fs.writeFileSync(donePath, "", "utf8");

    expect(() => buildIeltsSourceWorkbook({ root, expectedWordCount: 1 }))
      .toThrow(/starred words are missing/u);
  });
});
