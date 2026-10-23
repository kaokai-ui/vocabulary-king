import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyVocabularyDecisionsToFile, planVocabularyWriteback } from "./apply-vocabulary-decisions-to-source.mjs";
import { buildTrackExportRecords } from "./vocabulary-data-utils.mjs";

const temporaryDirectories = [];

function makeSourceRow(overrides = {}) {
  return {
    track: "toefl",
    uid: "toefl-abundant-fruit-v1",
    level: "TOEFL",
    word: "abundant",
    pos: "",
    kk: "",
    meaning_zh: "豐富的",
    example_en: "The region has abundant rainfall.",
    example_zh: "這個地區雨量充沛。",
    meaning_ja: "",
    example_ja: "",
    meaning_ko: "",
    example_ko: "",
    example_format: { before: " (", after: ")" },
    ...overrides
  };
}

function makeSnapshot(sourceRows) {
  const { sourceIndex: _sourceIndex, ...snapshot } = buildTrackExportRecords("toefl", sourceRows)[0];
  return snapshot;
}

function makeDecision(snapshot, final) {
  return {
    uid: snapshot.uid,
    word: snapshot.word,
    decision: "revise",
    final,
    reason: "test"
  };
}

function createTempDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vocabulary-writeback-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("vocabulary source writeback", () => {
  it("writes one changed field while preserving the other source values", () => {
    const sourceRows = [makeSourceRow()];
    const snapshot = makeSnapshot(sourceRows);
    const directory = createTempDirectory();
    const sourcePath = path.join(directory, "toefl.jsonl");
    const snapshotPath = path.join(directory, "snapshot.jsonl");
    const decisionsPath = path.join(directory, "decisions.jsonl");
    fs.writeFileSync(sourcePath, `${JSON.stringify(sourceRows[0])}\n`, "utf8");
    fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot)}\n`, "utf8");
    fs.writeFileSync(decisionsPath, `${JSON.stringify(makeDecision(snapshot, { example_zh: "該地區有充沛的降雨。" }))}\n`, "utf8");

    const result = applyVocabularyDecisionsToFile({ track: "toefl", sourcePath, snapshotPath, decisionsPath });
    const updated = JSON.parse(fs.readFileSync(sourcePath, "utf8").trim());

    expect(result.cellChanges).toEqual([
      {
        uid: snapshot.uid,
        field: "example_zh",
        from: "這個地區雨量充沛。",
        to: "該地區有充沛的降雨。"
      }
    ]);
    expect(updated.example_zh).toBe("該地區有充沛的降雨。");
    expect(updated.example_en).toBe(sourceRows[0].example_en);
    expect(result.cellChanges[0].uid).toBe(snapshot.uid);
  });

  it("writes Japanese and Korean fields without changing the vocabulary id", () => {
    const sourceRows = [makeSourceRow()];
    const snapshot = makeSnapshot(sourceRows);
    const directory = createTempDirectory();
    const sourcePath = path.join(directory, "toefl.jsonl");
    const snapshotPath = path.join(directory, "snapshot.jsonl");
    const decisionsPath = path.join(directory, "decisions.jsonl");
    const translations = {
      meaning_ja: "豊富な",
      example_ja: "その地域は豊富な降雨がある。",
      meaning_ko: "풍부한",
      example_ko: "그 지역은 강우량이 풍부하다."
    };
    fs.writeFileSync(sourcePath, `${JSON.stringify(sourceRows[0])}\n`, "utf8");
    fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot)}\n`, "utf8");
    fs.writeFileSync(decisionsPath, `${JSON.stringify(makeDecision(snapshot, translations))}\n`, "utf8");

    const result = applyVocabularyDecisionsToFile({
      track: "toefl",
      sourcePath,
      snapshotPath,
      decisionsPath
    });
    const updatedSource = JSON.parse(fs.readFileSync(sourcePath, "utf8").trim());

    expect(updatedSource).toMatchObject(translations);
    expect(buildTrackExportRecords("toefl", [updatedSource])[0].id).toBe(snapshot.uid);
    expect(buildTrackExportRecords("toefl", [updatedSource])[0].uid).toBe(snapshot.uid);
    expect(result.updatedRows[0].uid).toBe(snapshot.uid);
    expect(result.cellChanges.map(({ field }) => field)).toEqual(Object.keys(translations));
  });

  it("keeps the uid when the headword changes", () => {
    const sourceRows = [makeSourceRow()];
    const snapshot = makeSnapshot(sourceRows);
    const result = planVocabularyWriteback({
      track: "toefl",
      sourceRows,
      snapshotRows: [snapshot],
      decisions: [makeDecision(snapshot, { word: "plentiful" })]
    });

    expect(result.updatedRows[0].word).toBe("plentiful");
    expect(result.updatedRows[0].uid).toBe(snapshot.uid);
    expect(buildTrackExportRecords("toefl", result.updatedRows)[0].id).toBe(snapshot.uid);
  });

  it("keeps the uid when the meaning changes", () => {
    const sourceRows = [makeSourceRow()];
    const snapshot = makeSnapshot(sourceRows);
    const result = planVocabularyWriteback({
      track: "toefl",
      sourceRows,
      snapshotRows: [snapshot],
      decisions: [makeDecision(snapshot, { meaning: "充足的" })]
    });

    expect(result.updatedRows[0].meaning_zh).toBe("充足的");
    expect(result.updatedRows[0].uid).toBe(snapshot.uid);
    expect(buildTrackExportRecords("toefl", result.updatedRows)[0].id).toBe(snapshot.uid);
  });

  it("rejects uid changes through final", () => {
    const sourceRows = [makeSourceRow()];
    const snapshot = makeSnapshot(sourceRows);

    expect(() => planVocabularyWriteback({
      track: "toefl",
      sourceRows,
      snapshotRows: [snapshot],
      decisions: [makeDecision(snapshot, { uid: "replacement-uid" })]
    })).toThrow(/uid.*immutable/u);
  });

  it("stops before writing when a reviewed source value is stale", () => {
    const original = makeSourceRow();
    const snapshot = makeSnapshot([original]);
    const changedSource = makeSourceRow({ example_en: "The area receives abundant rain." });

    expect(() => planVocabularyWriteback({
      track: "toefl",
      sourceRows: [changedSource],
      snapshotRows: [snapshot],
      decisions: [makeDecision(snapshot, { example_zh: "該地區有充沛的降雨。" })]
    })).toThrow(/Stale source.*example/u);
    expect(changedSource.example_en).toBe("The area receives abundant rain.");
  });

  it("does not write the source file during a dry run", () => {
    const sourceRows = [makeSourceRow()];
    const snapshot = makeSnapshot(sourceRows);
    const directory = createTempDirectory();
    const sourcePath = path.join(directory, "toefl.jsonl");
    const snapshotPath = path.join(directory, "snapshot.jsonl");
    const decisionsPath = path.join(directory, "decisions.jsonl");
    const originalSource = `${JSON.stringify(sourceRows[0])}\n`;
    fs.writeFileSync(sourcePath, originalSource, "utf8");
    fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot)}\n`, "utf8");
    fs.writeFileSync(decisionsPath, `${JSON.stringify(makeDecision(snapshot, { example_zh: "該地區有充沛的降雨。" }))}\n`, "utf8");

    const result = applyVocabularyDecisionsToFile({ track: "toefl", sourcePath, snapshotPath, decisionsPath, dryRun: true });

    expect(result.cellChanges).toHaveLength(1);
    expect(fs.readFileSync(sourcePath, "utf8")).toBe(originalSource);
  });
});
