import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { exportIosVocabularyLocales } from "./export-ios-locales.mjs";
import { TRACK_DEFINITIONS } from "./vocabulary-source-definitions.mjs";

const temporaryDirectories = [];

function createTemporaryRoot() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vocabulary-ios-export-"));
  temporaryDirectories.push(directory);
  return directory;
}

function createSourceRepo(root) {
  const dataDirectory = path.join(root, "data");
  fs.mkdirSync(dataDirectory, { recursive: true });

  for (const definition of TRACK_DEFINITIONS.filter(({ available }) => available)) {
    const row = {
      track: definition.id,
      uid: definition.id === "toeic" ? "junior-high-uid-1" : `${definition.id}-uid-1`,
      level: "L1",
      word: `${definition.id}-word`,
      pos: "",
      meaning_zh: "中文意思",
      example_en: "This is an example.",
      example_zh: "這是一個例句。",
      meaning_ja: definition.id === "junior-high" ? "豊富な" : "",
      example_ja: "",
      meaning_ko: definition.id === "junior-high" ? "풍부한" : "",
      example_ko: "",
      example_vi: definition.id === "junior-high" ? "Đây là câu ví dụ." : "",
      example_th: definition.id === "junior-high" ? "นี่คือตัวอย่างประโยค" : "",
      example_id: definition.id === "junior-high" ? "Ini contoh kalimat." : "",
      example_hi: definition.id === "junior-high" ? "यह एक उदाहरण वाक्य है।" : "",
      senses: [{
        pos: "",
        meaning_zh: "中文意思",
        meaning_ja: definition.id === "junior-high" ? "豊富な" : "",
        meaning_ko: definition.id === "junior-high" ? "풍부한" : "",
        meaning_vi: definition.id === "junior-high" ? "phong phú" : "",
        meaning_th: definition.id === "junior-high" ? "อุดมสมบูรณ์" : "",
        meaning_id: definition.id === "junior-high" ? "melimpah" : "",
        meaning_hi: definition.id === "junior-high" ? "प्रचुर" : ""
      }],
      example_format: { before: " (", after: ")" }
    };
    fs.writeFileSync(path.join(dataDirectory, `${definition.id}.jsonl`), `${JSON.stringify(row)}\n`, "utf8");
  }
  fs.writeFileSync(path.join(dataDirectory, "uid-aliases.json"), `${JSON.stringify({
    aliases: [{ track: "junior-high", aliasUid: "old-junior-high-uid", targetUid: "junior-high-uid-1" }],
    deleted: [{ track: "toefl", uid: "deleted-toefl-uid" }]
  })}\n`, "utf8");
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("iOS locale export", () => {
  it("writes base data and all six locale overlays into the explicit external folder", () => {
    const temporaryRoot = createTemporaryRoot();
    const projectRoot = path.join(temporaryRoot, "VocabularyKing");
    const dataRepoRoot = path.join(temporaryRoot, "VocabularyKing-data");
    const outPath = path.join(temporaryRoot, "ios-export");
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.mkdirSync(dataRepoRoot, { recursive: true });
    createSourceRepo(dataRepoRoot);

    const result = exportIosVocabularyLocales({ outPath, dataRepoRoot, projectRoot });
    const catalog = JSON.parse(fs.readFileSync(path.join(outPath, "catalog.json"), "utf8"));
    const toeicChunk = JSON.parse(fs.readFileSync(path.join(outPath, "tracks", "toeic", "chunk-001.json"), "utf8"));

    expect(result.localeCounts.ja).toBe(1);
    expect(result.localeCounts.ko).toBe(1);
    expect(result.localeCounts.vi).toBe(1);
    expect(result.localeCounts.th).toBe(1);
    expect(result.localeCounts.id).toBe(1);
    expect(result.localeCounts.hi).toBe(1);
    expect(catalog.tracks["junior-high"].locales.ja.totalWords).toBe(1);
    expect(catalog.tracks["junior-high"].locales.ko.totalWords).toBe(1);
    for (const [locale, meaning, example] of [
      ["vi", "phong phú", "Đây là câu ví dụ."],
      ["th", "อุดมสมบูรณ์", "นี่คือตัวอย่างประโยค"],
      ["id", "melimpah", "Ini contoh kalimat."],
      ["hi", "प्रचुर", "यह एक उदाहरण वाक्य है।"]
    ]) {
      expect(catalog.tracks["junior-high"].locales[locale].totalWords).toBe(1);
      const localeChunk = JSON.parse(fs.readFileSync(path.join(outPath, "tracks", "junior-high", locale, "chunk-001.json"), "utf8"));
      expect(localeChunk).toEqual([{ id: "junior-high-uid-1", meaning, example }]);
    }
    expect(toeicChunk[0].id).toBe("junior-high-uid-1");
    expect(toeicChunk[0]).toMatchObject({
      senses: [{ pos: "", meaning_zh: "中文意思", meaning_ja: "", meaning_ko: "" }],
      ipa_us: "",
      ipa_uk: ""
    });
    expect(fs.existsSync(path.join(outPath, "tracks", "junior-high", "ja", "chunk-001.json"))).toBe(true);
    expect(fs.existsSync(path.join(outPath, "tracks", "junior-high", "ko", "chunk-001.json"))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(outPath, "uid-aliases.json"), "utf8"))).toEqual({
      aliases: [{ track: "junior-high", aliasUid: "old-junior-high-uid", targetUid: "junior-high-uid-1" }],
      deleted: [{ track: "toefl", uid: "deleted-toefl-uid" }]
    });
  });

  it("rejects output folders inside either repository", () => {
    const temporaryRoot = createTemporaryRoot();
    const projectRoot = path.join(temporaryRoot, "VocabularyKing");
    const dataRepoRoot = path.join(temporaryRoot, "VocabularyKing-data");
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.mkdirSync(dataRepoRoot, { recursive: true });

    for (const outPath of [path.join(projectRoot, "ios-export"), path.join(dataRepoRoot, "ios-export")]) {
      expect(() => exportIosVocabularyLocales({ outPath, dataRepoRoot, projectRoot })).toThrow(/outside both/);
    }
    expect(fs.existsSync(path.join(projectRoot, "ios-export"))).toBe(false);
    expect(fs.existsSync(path.join(dataRepoRoot, "ios-export"))).toBe(false);
  });

  it("rejects non-empty output folders to avoid overwriting local files", () => {
    const temporaryRoot = createTemporaryRoot();
    const projectRoot = path.join(temporaryRoot, "VocabularyKing");
    const dataRepoRoot = path.join(temporaryRoot, "VocabularyKing-data");
    const outPath = path.join(temporaryRoot, "ios-export");
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.mkdirSync(dataRepoRoot, { recursive: true });
    fs.mkdirSync(outPath, { recursive: true });
    fs.writeFileSync(path.join(outPath, "keep.txt"), "keep", "utf8");

    expect(() => exportIosVocabularyLocales({ outPath, dataRepoRoot, projectRoot })).toThrow(/must be empty/);
    expect(fs.readFileSync(path.join(outPath, "keep.txt"), "utf8")).toBe("keep");
  });
});
