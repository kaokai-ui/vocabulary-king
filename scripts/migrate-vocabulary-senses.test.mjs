import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inferSensesFromLegacyRow, parsePosList } from "./vocabulary-senses.mjs";
import { migrateVocabularySenses } from "./migrate-vocabulary-senses.mjs";
import { TRACK_DEFINITIONS } from "./vocabulary-source-definitions.mjs";

const temporaryDirectories = [];

function createTemporaryRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vocabulary-senses-migration-"));
  temporaryDirectories.push(root);
  return root;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("vocabulary sense migration", () => {
  it("normalizes GEPT and TOEIC POS aliases and maps line-labelled meanings", () => {
    const gept = inferSensesFromLegacyRow({
      track: "gept-intermediate",
      pos: "noun\nverb",
      meaning_zh: "noun 協議\nverb 商議",
      meaning_ja: "noun 合意\nverb 話し合う",
      meaning_ko: "noun 합의\nverb 의논하다"
    });
    expect(gept).toEqual({
      parsed: true,
      parsedFrom: "pos",
      senses: [
        { pos: "n.", meaning_zh: "協議", meaning_ja: "合意", meaning_ko: "합의" },
        { pos: "v.", meaning_zh: "商議", meaning_ja: "話し合う", meaning_ko: "의논하다" }
      ]
    });

    expect(parsePosList("v / a / ad / n")).toEqual(["v.", "adj.", "adv.", "n."]);
    expect(inferSensesFromLegacyRow({
      track: "toeic",
      pos: "a",
      meaning_zh: "能；可；會",
      meaning_ja: "a. できる",
      meaning_ko: "a. 할 수 있는"
    }).senses).toEqual([
      { pos: "adj.", meaning_zh: "能；可；會", meaning_ja: "できる", meaning_ko: "할 수 있는" }
    ]);
  });

  it("parses IELTS prefixes and combined POS labels, and leaves truly unparsed rows blank", () => {
    expect(inferSensesFromLegacyRow({
      track: "ielts",
      pos: "",
      meaning_zh: "adj. 精確的；準確的",
      meaning_ja: "adj. 正確な；厳密な",
      meaning_ko: "adj. 정확한; 정밀한"
    }).senses).toEqual([
      { pos: "adj.", meaning_zh: "精確的；準確的", meaning_ja: "正確な；厳密な", meaning_ko: "정확한; 정밀한" }
    ]);

    const multiPos = inferSensesFromLegacyRow({
      track: "ielts",
      pos: "",
      meaning_zh: "n./v. 缺乏；不足；缺少",
      meaning_ja: "n./v. 不足；欠乏；欠く",
      meaning_ko: "n./v. 부족; 결핍; 부족하다"
    });
    expect(multiPos.senses.map(({ pos }) => pos)).toEqual(["n.", "v."]);
    expect(multiPos.senses[0].meaning_zh).toBe("缺乏；不足；缺少");
    expect(multiPos.senses[1].meaning_ko).toBe("부족; 결핍; 부족하다");

    const evenlyGrouped = inferSensesFromLegacyRow({
      track: "ielts",
      pos: "",
      meaning_zh: "noun/verb 吵架；爭吵",
      meaning_ja: "",
      meaning_ko: ""
    });
    expect(evenlyGrouped.senses.map(({ meaning_zh }) => meaning_zh)).toEqual(["吵架", "爭吵"]);

    expect(inferSensesFromLegacyRow({
      track: "toefl",
      pos: "",
      meaning_zh: "清澈；透明"
    })).toEqual({
      parsed: false,
      parsedFrom: "",
      senses: [{ pos: "", meaning_zh: "清澈；透明", meaning_ja: "", meaning_ko: "" }]
    });
  });

  it("runs reproducibly and idempotently over every available track", () => {
    const root = createTemporaryRoot();
    const dataDirectory = path.join(root, "data");
    fs.mkdirSync(dataDirectory, { recursive: true });
    for (const definition of TRACK_DEFINITIONS.filter(({ available }) => available)) {
      const row = {
        track: definition.id,
        uid: `${definition.id}-uid-1`,
        level: "L1",
        word: `${definition.id}-word`,
        pos: definition.id === "toeic" ? "v" : "",
        meaning_zh: definition.id === "ielts" ? "adj. 清楚的" : "清楚的",
        meaning_ja: "",
        meaning_ko: "",
        example_en: "It is clear.",
        example_zh: "這很清楚。"
      };
      fs.writeFileSync(path.join(dataDirectory, `${definition.id}.jsonl`), `${JSON.stringify(row)}\n`, "utf8");
    }

    const first = migrateVocabularySenses({ dataDir: root });
    const sourceSnapshots = TRACK_DEFINITIONS.filter(({ available }) => available).map(({ id }) => [
      id,
      fs.readFileSync(path.join(dataDirectory, `${id}.jsonl`), "utf8")
    ]);
    const reportSnapshot = fs.readFileSync(path.join(root, "reports", "vocab-senses-migration.json"), "utf8");
    const unresolvedSnapshot = fs.readFileSync(path.join(root, "reports", "vocab-senses-unresolved.jsonl"), "utf8");

    const second = migrateVocabularySenses({ dataDir: root });

    expect(second).toEqual(first);
    expect(fs.readFileSync(path.join(root, "reports", "vocab-senses-migration.json"), "utf8")).toBe(reportSnapshot);
    expect(fs.readFileSync(path.join(root, "reports", "vocab-senses-unresolved.jsonl"), "utf8")).toBe(unresolvedSnapshot);
    for (const [track, source] of sourceSnapshots) {
      expect(fs.readFileSync(path.join(dataDirectory, `${track}.jsonl`), "utf8")).toBe(source);
      expect(JSON.parse(source.trim())).toHaveProperty("senses");
    }
  });
});
