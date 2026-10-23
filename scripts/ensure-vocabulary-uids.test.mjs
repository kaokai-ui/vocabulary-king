import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildLegacyTrackExportRecords } from "./vocabulary-data-utils.mjs";
import { ensureVocabularyUids, planEnsureVocabularyUids } from "./ensure-vocabulary-uids.mjs";
import { TRACK_DEFINITIONS } from "./vocabulary-source-definitions.mjs";

const temporaryDirectories = [];

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vocabulary-uids-"));
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  temporaryDirectories.push(root);
  return root;
}

function sourceRow(track, overrides = {}) {
  return {
    track,
    level: "L1",
    word: "apple",
    pos: "",
    meaning_zh: "fruit",
    example_en: "An apple is fruit.",
    example_zh: "example",
    example_format: { before: " (", after: ")" },
    ...overrides
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("vocabulary source uid initialization", () => {
  it("initializes a uid to the legacy exported id", () => {
    const row = sourceRow("toefl");
    const legacyId = buildLegacyTrackExportRecords("toefl", [row])[0].id;
    const plan = planEnsureVocabularyUids({ sourceRowsByTrack: new Map([["toefl", [row]]]) });

    expect(plan.updatedRowsByTrack.get("toefl")[0].uid).toBe(legacyId);
  });

  it("gives new rows a unique uid and writes it back to the source file", () => {
    const root = createTempRoot();
    for (const definition of TRACK_DEFINITIONS.filter((track) => track.available)) {
      const row = sourceRow(definition.id, { word: `${definition.id}-word` });
      fs.writeFileSync(path.join(root, "data", `${definition.id}.jsonl`), `${JSON.stringify(row)}\n`, "utf8");
    }

    ensureVocabularyUids(root);
    const toeflPath = path.join(root, "data", "toefl.jsonl");
    const firstRow = JSON.parse(fs.readFileSync(toeflPath, "utf8").trim());
    const addedRow = sourceRow("toefl", { word: "brand-new", example_en: "A brand-new row." });
    fs.appendFileSync(toeflPath, `${JSON.stringify(addedRow)}\n`, "utf8");

    const result = ensureVocabularyUids(root);
    const rows = fs.readFileSync(toeflPath, "utf8").trim().split(/\r?\n/u).map((line) => JSON.parse(line));
    for (const rowsForTrack of result.updatedRowsByTrack.values()) {
      const trackUids = rowsForTrack.map((row) => row.uid);
      expect(new Set(trackUids).size).toBe(trackUids.length);
    }

    expect(rows[0].uid).toBe(firstRow.uid);
    expect(rows[1].uid).toBe(buildLegacyTrackExportRecords("toefl", [addedRow])[0].id);
    expect(rows[1].uid).toBeTruthy();
  });

  it("keeps matching legacy IDs in different tracks unchanged without aliases", () => {
    const left = sourceRow("toefl");
    const right = sourceRow("toeic");
    const plan = planEnsureVocabularyUids({
      sourceRowsByTrack: new Map([["toefl", [left]], ["toeic", [right]]])
    });
    const leftUid = plan.updatedRowsByTrack.get("toefl")[0].uid;
    const rightUid = plan.updatedRowsByTrack.get("toeic")[0].uid;

    expect(leftUid).toBe(buildLegacyTrackExportRecords("toefl", [left])[0].id);
    expect(rightUid).toBe(buildLegacyTrackExportRecords("toeic", [right])[0].id);
    expect(rightUid).toBe(leftUid);
    expect(plan.aliasData.aliases).toEqual([]);
  });

  it("fails when two rows in the same track receive the same legacy ID", () => {
    const first = sourceRow("toefl");
    const second = sourceRow("toefl");

    expect(() => planEnsureVocabularyUids({
      sourceRowsByTrack: new Map([["toefl", [first, second]]])
    })).toThrow(/exact duplicate rows exist|Duplicate vocabulary uid 'toefl\//u);
  });
});
