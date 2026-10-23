import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  exampleContainsWord,
  planVocabularyRebuild,
  writeVocabularyRebuildPlan
} from "./apply-vocabulary-rebuild.mjs";
import { exportGameVocabulary, summarizeCatalogLevels } from "./export-game-vocabulary.mjs";
import { TRACK_DEFINITIONS } from "./vocabulary-source-definitions.mjs";

const temporaryDirectories = [];
const tracks = TRACK_DEFINITIONS.filter((definition) => definition.available).map(({ id }) => id);

function writeJsonl(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

function oldRow({ uid, word, level = "L1", ipa = "ˈold" }) {
  return {
    track: "toeic",
    uid,
    level,
    word,
    pos: "n",
    kk: "",
    meaning_zh: "舊意思",
    meaning_ja: "古い意味",
    meaning_ko: "이전 뜻",
    example_en: `The old ${word} record is ready.`,
    example_zh: "舊例句。",
    example_ja: "以前の例文です。",
    example_ko: "이전 예문이에요.",
    ipa_us: ipa,
    ipa_uk: "",
    senses: [{ pos: "n.", meaning_zh: "舊意思", meaning_ja: "古い意味", meaning_ko: "이전 뜻" }]
  };
}

function keepOutput({ uid, word, level, example, pos = "n." }) {
  return {
    uid,
    word,
    level,
    decision: "keep",
    senses: [{ pos, meaning_zh: `${word} 的意思`, meaning_ja: `${word} の意味`, meaning_ko: `${word}의 뜻` }],
    example_en: example,
    example_zh: `${word} 的新例句。`,
    example_ja: `${word} の新しい例文です。`,
    example_ko: `${word}의 새 예문이에요.`,
    example_sense: 0,
    group: ""
  };
}

function createFixture({ outputs = {}, omitOutputParts = [], duplicateSameLevelWord = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vocab-rebuild-"));
  temporaryDirectories.push(root);
  const taskRoot = path.join(root, "docs", "tasks", "vocab-rebuild-20261023");
  const dataRoot = path.join(root, "data-repo");
  const outputDirectory = path.join(root, "out");

  const skeletonRows = [
    { track: "toeic", level: "基礎1", word: "alpha", source: "NGSL", freq_rank: 1, reuse: [{ uid: "toeic-alpha" }] },
    { track: "toeic", level: "多益1", word: "beta", source: "TSL", freq_rank: 2, reuse: [] },
    { track: "toeic", level: "延伸（待確認）", word: "discard", source: "old-unlisted", freq_rank: 3, reuse: [{ uid: "toeic-discard" }] },
    { track: "toeic", level: "片語（待分組）", word: "take off", source: "old-phrase", freq_rank: 4, reuse: [{ uid: "toeic-take-off" }] }
  ];
  if (duplicateSameLevelWord) {
    skeletonRows[1].word = skeletonRows[0].word;
    skeletonRows[1].level = skeletonRows[0].level;
  }
  const partRows = [skeletonRows.slice(0, 2), skeletonRows.slice(2)];
  writeJsonl(path.join(taskRoot, "skeleton", "toeic.jsonl"), skeletonRows);
  partRows.forEach((rows, index) => writeJsonl(
    path.join(taskRoot, "parts", "toeic", `part-${String(index + 1).padStart(2, "0")}.jsonl`), rows
  ));

  for (const [index, rows] of Object.entries(outputs)) {
    if (omitOutputParts.includes(Number(index))) continue;
    writeJsonl(path.join(outputDirectory, `part-${String(index).padStart(2, "0")}.jsonl`), rows);
  }

  const sourceByTrack = new Map(tracks.map((track) => [track, []]));
  sourceByTrack.set("toeic", [
    oldRow({ uid: "toeic-alpha", word: "alpha", level: "L2", ipa: "ˈælfə" }),
    oldRow({ uid: "toeic-discard", word: "discard", level: "L3" }),
    oldRow({ uid: "toeic-take-off", word: "take off", level: "phrase" })
  ]);
  for (const track of tracks) {
    if (track !== "toeic") {
      sourceByTrack.set(track, [{ track, uid: `${track}-seed`, level: "L1", word: `${track} seed`, meaning_zh: "意思", example_en: `This ${track} seed is ready.` }]);
    }
  }
  for (const [track, rows] of sourceByTrack) writeJsonl(path.join(dataRoot, "data", `${track}.jsonl`), rows);
  fs.mkdirSync(path.join(dataRoot, "data"), { recursive: true });
  fs.writeFileSync(path.join(dataRoot, "data", "uid-aliases.json"), '{"aliases":[],"deleted":[]}\n', "utf8");
  fs.mkdirSync(path.join(dataRoot, "sources", "cmudict"), { recursive: true });
  fs.writeFileSync(path.join(dataRoot, "sources", "cmudict", "cmudict.dict"), "ALPHA AE1 L F AH0\nBETA B EY1 T AH0\n", "utf8");

  const outputsByPart = {
    1: [
      keepOutput({ uid: "", word: "beta", level: "多益1", example: "Beta improved our results." }),
      keepOutput({ uid: "toeic-alpha", word: "alpha", level: "基礎1", example: "Alpha improved after testing." })
    ],
    2: [
      { ...keepOutput({ uid: "toeic-take-off", word: "take off", level: "片語（待分組）", example: "Please take off your coat before the meeting.", pos: "phr." }), group: "會議與簡報" },
      { uid: "toeic-discard", word: "discard", level: "延伸（待確認）", decision: "drop", reason: "罕用" }
    ]
  };
  for (const [index, rows] of Object.entries(outputs)) {
    outputsByPart[index] = rows;
  }
  for (const [index, rows] of Object.entries(outputsByPart)) {
    if (!omitOutputParts.includes(Number(index))) {
      writeJsonl(path.join(outputDirectory, `part-${String(index).padStart(2, "0")}.jsonl`), rows);
    }
  }

  return { root, taskRoot, dataRoot, outputDirectory };
}

function plan(fixture, overrides = {}) {
  return planVocabularyRebuild({
    track: "toeic",
    directory: fixture.outputDirectory,
    dataDirectory: fixture.dataRoot,
    projectRoot: fixture.root,
    taskInputDirectory: fixture.taskRoot,
    ...overrides
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("apply vocab rebuild", () => {
  it("uses word matches instead of output order, preserves reused uids and IPA, adds CMUdict IPA, groups phrases, and records deleted uids", () => {
    const fixture = createFixture();
    const result = plan(fixture);

    expect(result.fullRebuild).toBe(true);
    expect(result.rows.map((row) => row.word)).toEqual(["alpha", "beta", "take off"]);
    expect(result.rows[0].uid).toBe("toeic-alpha");
    expect(result.rows[0].ipa_us).toBe("ˈælfə");
    expect(result.rows[0].meaning_zh).toContain("alpha 的意思");
    expect(result.rows[0].legacy_display.meaning_zh).toContain("alpha 的意思");
    expect(result.rows[1].uid).toMatch(/^多益1-beta-/u);
    expect(result.rows[1].ipa_us).toBeTruthy();
    expect(result.rows[2].level).toBe("片語：會議與簡報");
    expect(result.rows.some((row) => row.uid === "toeic-discard")).toBe(false);
    expect(result.aliasData.deleted).toEqual([{ track: "toeic", uid: "toeic-discard", reason: "rebuild 10/23" }]);
    expect(new Set(result.rows.map((row) => row.uid)).size).toBe(result.rows.length);
    expect(result.stats).toMatchObject({ updated: 2, deleted: 1, added: 1, partsDone: 2, partsTotal: 2 });
  });

  it("rejects incomplete output for apply and permits partial plans only as dry runs", () => {
    const fixture = createFixture({ omitOutputParts: [2] });
    expect(() => plan(fixture, { dryRun: false })).toThrow(/Output is incomplete: 1\/2/u);
    const partial = plan(fixture, { allowPartial: true, dryRun: true });
    expect(partial.fullRebuild).toBe(false);
    expect(partial.stats.partsDone).toBe(1);
    expect(() => plan(fixture, { allowPartial: true, dryRun: false })).toThrow(/only allowed with --dry-run/u);
  });

  it("reports output uid mismatches and does not use them as the final ids", () => {
    const fixture = createFixture({ outputs: {
      1: [
        keepOutput({ uid: "", word: "beta", level: "多益1", example: "Beta improved our results." }),
        keepOutput({ uid: "wrong-alpha", word: "alpha", level: "基礎1", example: "Alpha improved after testing." })
      ],
      2: [
        { ...keepOutput({ uid: "toeic-take-off", word: "take off", level: "片語（待分組）", example: "Please take off your coat before the meeting.", pos: "phr." }), group: "會議與簡報" },
        { uid: "toeic-discard", word: "discard", level: "延伸（待確認）", decision: "drop" }
      ]
    }});
    expect(() => plan(fixture)).toThrow(/expected \[toeic-alpha\], received \[wrong-alpha\]/u);
  });

  it("does not use output uids to disambiguate repeated words at the same level", () => {
    const fixture = createFixture({
      duplicateSameLevelWord: true,
      outputs: {
        1: [
          keepOutput({ uid: "toeic-alpha", word: "alpha", level: "?箇?1", example: "Alpha improved after testing." }),
          keepOutput({ uid: "", word: "alpha", level: "?箇?1", example: "Alpha is useful in another example." })
        ]
      }
    });
    expect(() => plan(fixture)).toThrow(/cannot unambiguously pair 'alpha' with the skeleton row by word and level; output UID is only a cross-check/u);
  });

  it("rejects repeated POS codes and examples that do not use the headword", () => {
    const fixture = createFixture({ outputs: {
      1: [
        keepOutput({ uid: "", word: "beta", level: "多益1", example: "Beta improved our results." }),
        {
          ...keepOutput({ uid: "toeic-alpha", word: "alpha", level: "基礎1", example: "Customers improved the plan." }),
          senses: [
            { pos: "n.", meaning_zh: "意思", meaning_ja: "意味", meaning_ko: "뜻" },
            { pos: "n.", meaning_zh: "另一個意思", meaning_ja: "別の意味", meaning_ko: "다른 뜻" }
          ]
        }
      ],
      2: [
        { ...keepOutput({ uid: "toeic-take-off", word: "take off", level: "片語（待分組）", example: "Please take off your coat before the meeting.", pos: "phr." }), group: "會議與簡報" },
        { uid: "toeic-discard", word: "discard", level: "延伸（待確認）", decision: "drop" }
      ]
    }});
    let message = "";
    try { plan(fixture); } catch (error) { message = error.message; }
    expect(message).toMatch(/more than one sense for POS n\./u);
    expect(message).toMatch(/does not contain 'alpha'/u);
  });

  it("recognizes regular and irregular inflections but rejects unrelated synonyms", () => {
    expect(exampleContainsWord("The audit team found several errors.", "find")).toBe(true);
    expect(exampleContainsWord("The director thanked the staff.", "thank")).toBe(true);
    expect(exampleContainsWord("The manager admitted the shipment was late.", "admit")).toBe(true);
    expect(exampleContainsWord("The warehouse staff packed the kits.", "pack")).toBe(true);
    expect(exampleContainsWord("The city permitted the company to expand.", "permit")).toBe(true);
    expect(exampleContainsWord("The receptionist hid the access cards.", "hide")).toBe(true);
    expect(exampleContainsWord("The company canceled the meeting.", "cancel")).toBe(true);
    expect(exampleContainsWord("The company offered a ten-percent discount.", "percentage")).toBe(false);
    expect(exampleContainsWord("The security team checked for weapons.", "gun")).toBe(false);
    expect(exampleContainsWord("The old warehouse was torn down.", "tear down")).toBe(true);
    expect(exampleContainsWord("The manager took my advice.", "take one's advice")).toBe(true);
    expect(exampleContainsWord("The team is wrapping a present.", "wrap a present")).toBe(true);
    expect(exampleContainsWord("The southern region gets more rain.", "south")).toBe(false);
  });

  it("rejects POS codes outside the approved list", () => {
    const fixture = createFixture({ outputs: {
      1: [
        keepOutput({ uid: "", word: "beta", level: "多益1", example: "Beta improved our results." }),
        { ...keepOutput({ uid: "toeic-alpha", word: "alpha", level: "基礎1", example: "Alpha improved after testing." }),
          senses: [{ pos: "unknown", meaning_zh: "意思", meaning_ja: "意味", meaning_ko: "뜻" }] }
      ],
      2: [
        { ...keepOutput({ uid: "toeic-take-off", word: "take off", level: "片語（待分組）", example: "Please take off your coat before the meeting.", pos: "phr." }), group: "會議與簡報" },
        { uid: "toeic-discard", word: "discard", level: "延伸（待確認）", decision: "drop" }
      ]
    }});
    expect(() => plan(fixture)).toThrow(/invalid POS code "unknown"/u);
  });

  it("checks new examples against duplicates and keeps partial dry runs read-only", () => {
    const fixture = createFixture({ outputs: {
      1: [
        keepOutput({ uid: "", word: "beta", level: "多益1", example: "Alpha improved after testing." }),
        keepOutput({ uid: "toeic-alpha", word: "alpha", level: "基礎1", example: "Alpha improved after testing." })
      ]
    }, omitOutputParts: [2] });
    const sourceBefore = fs.readFileSync(path.join(fixture.dataRoot, "data", "toeic.jsonl"), "utf8");
    expect(() => plan(fixture, { allowPartial: true, dryRun: true })).toThrow(/shared English example/u);
    expect(fs.readFileSync(path.join(fixture.dataRoot, "data", "toeic.jsonl"), "utf8")).toBe(sourceBefore);
  });

  it("sorts legacy levels numerically and rebuilt levels by their track definitions", () => {
    expect(summarizeCatalogLevels([
      { level: "L4" }, { level: "L5" }, { level: "L2" }, { level: "L1" }, { level: "L12" }, { level: "L2" }
    ]).map(({ id, totalWords }) => [id, totalWords])).toEqual([
      ["L1", 1], ["L2", 2], ["L4", 1], ["L5", 1], ["L12", 1]
    ]);

    const definitions = Object.fromEntries(TRACK_DEFINITIONS
      .filter((definition) => ["toeic", "toeic-advanced", "toefl", "ielts"].includes(definition.id))
      .map((definition) => [definition.id, definition.catalogLevelFamilies]));
    expect(definitions).toEqual({
      toeic: ["基礎", "多益", "延伸", "片語"],
      "toeic-advanced": ["商務", "延伸", "片語"],
      toefl: ["學術核心", "進階", "延伸", "片語"],
      ielts: ["學術核心", "進階", "延伸", "片語"]
    });
    expect(TRACK_DEFINITIONS.filter((definition) => Object.hasOwn(definition, "catalogLevelFamilies"))
      .every((definition) => definition.includeSourceLevels)).toBe(true);

    expect(summarizeCatalogLevels([
      { level: "片語：人事與招募" },
      { level: "延伸（待確認）" },
      { level: "多益2" },
      { level: "基礎4" },
      { level: "延伸2" },
      { level: "基礎1" },
      { level: "多益1" },
      { level: "基礎2" },
      { level: "基礎3" },
      { level: "延伸1" },
      { level: "片語：會議與簡報" }
    ], definitions.toeic).map(({ id }) => id)).toEqual([
      "基礎1", "基礎2", "基礎3", "基礎4", "多益1", "多益2", "延伸1", "延伸2",
      "延伸（待確認）", "片語：會議與簡報", "片語：人事與招募"
    ]);
    expect(summarizeCatalogLevels([
      { level: "片語：會議與簡報" },
      { level: "延伸1" },
      { level: "進階2" },
      { level: "學術核心2" },
      { level: "學術核心1" },
      { level: "進階1" }
    ], definitions.toefl).map(({ id }) => id)).toEqual([
      "學術核心1", "學術核心2", "進階1", "進階2", "延伸1", "片語：會議與簡報"
    ]);
  });

  it("exports catalog levels from the source rows", () => {
    const fixture = createFixture();
    const publicData = path.join(fixture.root, "public-data");
    exportGameVocabulary({ dataRepoRoot: fixture.dataRoot, dataRoot: publicData });
    const catalog = JSON.parse(fs.readFileSync(path.join(publicData, "catalog.json"), "utf8"));
    expect(catalog.tracks.toeic.levels).toEqual([
      { id: "L2", label: "L2", totalWords: 1 },
      { id: "L3", label: "L3", totalWords: 1 },
      { id: "phrase", label: "phrase", totalWords: 1 }
    ]);
    expect(catalog.tracks.ielts.levels).toEqual([{ id: "L1", label: "L1", totalWords: 1 }]);
  });

  it("writes only complete plans and updates the compatibility display from senses", () => {
    const fixture = createFixture();
    const result = plan(fixture, { dryRun: false });
    writeVocabularyRebuildPlan(result);
    const data = fs.readFileSync(path.join(fixture.dataRoot, "data", "toeic.jsonl"), "utf8").trim().split(/\r?\n/u).map((line) => JSON.parse(line));
    expect(data.map((row) => row.word)).toEqual(["alpha", "beta", "take off"]);
    expect(JSON.parse(fs.readFileSync(path.join(fixture.dataRoot, "data", "uid-aliases.json"), "utf8")).deleted[0].reason)
      .toBe("rebuild 10/23");
  });
});
