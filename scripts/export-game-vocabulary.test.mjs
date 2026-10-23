import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { exportGameVocabulary } from "./export-game-vocabulary.mjs";
import { TRACK_DEFINITIONS } from "./vocabulary-source-definitions.mjs";

const temporaryDirectories = [];

function createTempDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vocabulary-export-"));
  temporaryDirectories.push(directory);
  return directory;
}

function createSourceRepo(translationsByTrack = {}) {
  const root = createTempDirectory();
  const dataDirectory = path.join(root, "data");
  fs.mkdirSync(dataDirectory, { recursive: true });

  for (const definition of TRACK_DEFINITIONS.filter(({ available }) => available)) {
    const row = {
      track: definition.id,
      uid: `${definition.id}-uid-1`,
      level: "L1",
      word: `${definition.id}-word`,
      pos: "",
      meaning_zh: "中文意思",
      example_en: "This is an example.",
      example_zh: "這是一個例句。",
      meaning_ja: "",
      example_ja: "",
      meaning_ko: "",
      example_ko: "",
      example_format: { before: " (", after: ")" },
      ...translationsByTrack[definition.id]
    };
    fs.writeFileSync(path.join(dataDirectory, `${definition.id}.jsonl`), `${JSON.stringify(row)}\n`, "utf8");
  }

  return root;
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("exportGameVocabulary locale overlays", () => {
  it("exports per-language id, meaning, and example chunks with catalog counts", () => {
    vi.stubEnv("VOCAB_EXPORT_EXTRA_LOCALES", "ja,ko");
    const dataRepoRoot = createSourceRepo({
      "junior-high": {
        meaning_ja: "豊富な",
        example_ja: "これは例文です。"
      },
      "senior-high": {
        meaning_ko: "풍부한"
      }
    });
    const dataRoot = path.join(createTempDirectory(), "public", "data");

    exportGameVocabulary({ dataRepoRoot, dataRoot });

    const catalog = JSON.parse(fs.readFileSync(path.join(dataRoot, "catalog.json"), "utf8"));
    const juniorTrack = catalog.tracks["junior-high"];
    const baseChunk = JSON.parse(fs.readFileSync(path.join(dataRoot, "tracks", "junior-high", "chunk-001.json"), "utf8"));
    const japanesePath = path.join(dataRoot, "tracks", "junior-high", "ja", "chunk-001.json");
    const japaneseChunk = JSON.parse(fs.readFileSync(japanesePath, "utf8"));
    const koreanTrack = catalog.tracks["senior-high"].locales.ko;

    expect(juniorTrack.locales.ja.totalWords).toBe(1);
    expect(juniorTrack.locales.ja.chunkFiles).toEqual([
      {
        id: "junior-high-ja-chunk-1",
        path: "data/tracks/junior-high/ja/chunk-001.json",
        wordCount: 1
      }
    ]);
    expect(koreanTrack.totalWords).toBe(1);
    expect(koreanTrack.chunkFiles[0].path).toBe("data/tracks/senior-high/ko/chunk-001.json");
    expect(japaneseChunk).toEqual([
      {
        id: baseChunk[0].id,
        meaning: "豊富な",
        example: "これは例文です。"
      }
    ]);
    expect(Object.keys(japaneseChunk[0]).sort()).toEqual(["example", "id", "meaning"]);
    expect(baseChunk[0]).not.toHaveProperty("meaning_ja");
    expect(baseChunk[0].id).toBe("junior-high-uid-1");
    expect(catalog.tracks.elementary).not.toHaveProperty("locales");
  });

  it("creates no locale files or catalog metadata when translation fields are blank", () => {
    vi.stubEnv("VOCAB_EXPORT_EXTRA_LOCALES", "");
    const dataRepoRoot = createSourceRepo();
    const dataRoot = path.join(createTempDirectory(), "public", "data");

    exportGameVocabulary({ dataRepoRoot, dataRoot });

    const catalog = JSON.parse(fs.readFileSync(path.join(dataRoot, "catalog.json"), "utf8"));

    expect(catalog.tracks["junior-high"]).not.toHaveProperty("locales");
    expect(fs.existsSync(path.join(dataRoot, "tracks", "junior-high", "ja"))).toBe(false);
    expect(fs.existsSync(path.join(dataRoot, "tracks", "junior-high", "ko"))).toBe(false);
  });

  it("omits locale files and metadata by default even when source translations exist", () => {
    vi.stubEnv("VOCAB_EXPORT_EXTRA_LOCALES", "");
    const dataRepoRoot = createSourceRepo({
      "junior-high": { meaning_ja: "豊富な", meaning_ko: "풍부한" }
    });
    const dataRoot = path.join(createTempDirectory(), "public", "data");

    exportGameVocabulary({ dataRepoRoot, dataRoot });

    const catalog = JSON.parse(fs.readFileSync(path.join(dataRoot, "catalog.json"), "utf8"));

    expect(catalog.tracks["junior-high"]).not.toHaveProperty("locales");
    expect(fs.existsSync(path.join(dataRoot, "tracks", "junior-high", "ja"))).toBe(false);
    expect(fs.existsSync(path.join(dataRoot, "tracks", "junior-high", "ko"))).toBe(false);
  });

  it("rejects unsupported locale values instead of silently ignoring typos", () => {
    vi.stubEnv("VOCAB_EXPORT_EXTRA_LOCALES", "jp");
    const dataRepoRoot = createSourceRepo();
    const dataRoot = path.join(createTempDirectory(), "public", "data");

    expect(() => exportGameVocabulary({ dataRepoRoot, dataRoot })).toThrow(/Unsupported vocabulary export locale/);
    expect(fs.existsSync(dataRoot)).toBe(false);
  });

  it("uses each source uid as the exported vocabulary id", () => {
    const dataRepoRoot = createSourceRepo();
    const dataRoot = path.join(createTempDirectory(), "public", "data");

    exportGameVocabulary({ dataRepoRoot, dataRoot });

    const chunk = JSON.parse(fs.readFileSync(path.join(dataRoot, "tracks", "elementary", "chunk-001.json"), "utf8"));
    expect(chunk[0].id).toBe("elementary-uid-1");
    expect(chunk[0]).not.toHaveProperty("uid");
  });
});
