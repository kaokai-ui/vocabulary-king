import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildIeltsSourceData } from "./build-ielts-source.mjs";

const temporaryDirectories = [];
const taskRelativePath = path.join("docs", "tasks", "ielts-merge-20261022");

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "build-ielts-source-"));
  temporaryDirectories.push(root);
  return root;
}

function makeDataRepo(root) {
  const dataRepoRoot = path.join(root, "vocabulary-data");
  const dataDirectory = path.join(dataRepoRoot, "data");
  fs.mkdirSync(dataDirectory, { recursive: true });
  fs.writeFileSync(path.join(dataDirectory, "ielts.jsonl"), "old data\n", "utf8");
  return dataRepoRoot;
}

function writeJsonl(root, relativePath, records) {
  const filePath = path.join(root, taskRelativePath, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : ""), "utf8");
}

function readJsonlRecords(filePath) {
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map(JSON.parse);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("buildIeltsSourceData", () => {
  it("writes canonical IELTS JSONL from short examples when examples-long is incomplete", () => {
    const root = makeRoot();
    const dataRepoRoot = makeDataRepo(root);
    const shortEntries = [
      { word: "alpha", meaning: "n. α", sense: "n. α", example_en: "Alpha grows well.", example_zh: "α 長得很好。" },
      { word: "beta", meaning: "v. 改善", sense: "v. 改善", example_en: "The plan improved.", example_zh: "計畫有所改善。" }
    ];
    writeJsonl(root, "examples/part-01.jsonl", shortEntries);
    writeJsonl(root, "examples-long/part-01.jsonl", [
      { word: "alpha", sense: "n. α", example_en: "An unapproved longer sentence.", example_zh: "未核准的長句。" }
    ]);

    const result = buildIeltsSourceData({ root, dataRepoRoot, expectedWordCount: 2 });

    expect(result).toMatchObject({ count: 2, usedLongSentences: false, longSentenceCount: 0 });
    expect(result.outputPath).toBe(path.join(dataRepoRoot, "data", "ielts.jsonl"));
    expect(readJsonlRecords(result.outputPath)).toEqual([
      {
        track: "ielts",
        level: "IELTS",
        word: "alpha",
        pos: "n.",
        kk: "",
        meaning_zh: "n. α",
        example_en: "Alpha grows well.",
        example_zh: "α 長得很好。",
        meaning_ja: "",
        example_ja: "",
        meaning_ko: "",
        example_ko: "",
        example_format: { before: " (", after: ")" },
        legacy_display: { pos: "", meaning_zh: "n. α", meaning_ja: "", meaning_ko: "" },
        senses: [{ pos: "n.", meaning_zh: "α", meaning_ja: "", meaning_ko: "" }],
        ipa_us: "",
        ipa_uk: ""
      },
      {
        track: "ielts",
        level: "IELTS",
        word: "beta",
        pos: "v.",
        kk: "",
        meaning_zh: "v. 改善",
        example_en: "The plan improved.",
        example_zh: "計畫有所改善。",
        meaning_ja: "",
        example_ja: "",
        meaning_ko: "",
        example_ko: "",
        example_format: { before: " (", after: ")" },
        legacy_display: { pos: "", meaning_zh: "v. 改善", meaning_ja: "", meaning_ko: "" },
        senses: [{ pos: "v.", meaning_zh: "改善", meaning_ja: "", meaning_ko: "" }],
        ipa_us: "",
        ipa_uk: ""
      }
    ]);
  });

  it("uses completed long examples only for starred words and preserves source order", () => {
    const root = makeRoot();
    const dataRepoRoot = makeDataRepo(root);
    writeJsonl(root, "examples/part-01.jsonl", [
      { word: "alpha", meaning: "n. α", sense: "n. α", example_en: "Alpha grows well.", example_zh: "α 長得很好。" },
      { word: "beta", meaning: "v. 改善", sense: "v. 改善", example_en: "The plan improved.", example_zh: "計畫有所改善。" }
    ]);
    writeJsonl(root, "parts/part-01.jsonl", [
      { word: "alpha", starred: true },
      { word: "beta", starred: false }
    ]);
    writeJsonl(root, "examples-long/part-01.jsonl", [
      { word: "alpha", sense: "n. α", example_en: "Alpha, which thrives in warm soil, can support local farms.", example_zh: "α 在暖土中茁壯，能支持當地農場。" }
    ]);
    const donePath = path.join(root, taskRelativePath, "examples-long", "DONE");
    fs.writeFileSync(donePath, "", "utf8");

    const result = buildIeltsSourceData({ root, dataRepoRoot, expectedWordCount: 2 });

    expect(result).toMatchObject({ count: 2, usedLongSentences: true, longSentenceCount: 1 });
    expect(readJsonlRecords(result.outputPath).map((entry) => [entry.word, entry.example_en, entry.example_zh])).toEqual([
      ["alpha", "Alpha, which thrives in warm soil, can support local farms.", "α 在暖土中茁壯，能支持當地農場。"],
      ["beta", "The plan improved.", "計畫有所改善。"]
    ]);
  });

  it("rejects an incomplete long-example set when the DONE marker is present", () => {
    const root = makeRoot();
    const dataRepoRoot = makeDataRepo(root);
    writeJsonl(root, "examples/part-01.jsonl", [
      { word: "alpha", meaning: "n. α", sense: "n. α", example_en: "Alpha grows well.", example_zh: "α 長得很好。" }
    ]);
    writeJsonl(root, "parts/part-01.jsonl", [{ word: "alpha", starred: true }]);
    writeJsonl(root, "examples-long/part-01.jsonl", []);
    const donePath = path.join(root, taskRelativePath, "examples-long", "DONE");
    fs.writeFileSync(donePath, "", "utf8");

    expect(() => buildIeltsSourceData({ root, dataRepoRoot, expectedWordCount: 1 }))
      .toThrow(/starred words are missing/u);
  });

  it("fails clearly when the configured vocabulary data repo is missing", () => {
    const root = makeRoot();
    writeJsonl(root, "examples/part-01.jsonl", [
      { word: "alpha", meaning: "n. α", sense: "n. α", example_en: "Alpha grows well.", example_zh: "α 長得很好。" }
    ]);
    const missingRepo = path.join(root, "missing-repo");

    expect(() => buildIeltsSourceData({ root, dataRepoRoot: missingRepo, expectedWordCount: 1 }))
      .toThrow(`Vocabulary source repo not found at ${missingRepo}; IELTS updates require the JSONL repo.`);
  });
});
