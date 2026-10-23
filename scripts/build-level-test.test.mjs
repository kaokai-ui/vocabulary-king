import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildLevelTestPayload,
  LEVEL_TEST_TRACK_IDS,
  parseDataDirArgument
} from "./build-level-test.mjs";

let temporaryRoots = [];

function createSourceRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vocabulary-king-level-test-"));
  temporaryRoots.push(root);
  fs.mkdirSync(path.join(root, "sources", "open-lists"), { recursive: true });
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "sources", "open-lists", "ngsl31k.csv"),
    "Lemma,Rank\ncommon,1\nshared,2\nschool,3\nexam,4\nphrase,5\n"
  );

  for (const trackId of LEVEL_TEST_TRACK_IDS) {
    const rows = [];
    if (trackId === "toeic" || trackId === "toeic-advanced") {
      rows.push({
        uid: trackId + "-shared",
        track: trackId,
        word: "shared",
        pos: "n.",
        level: "L1",
        senses: [{ pos: "n.", meaning_zh: trackId + " meaning" }]
      });
    }
    if (trackId === "toeic") {
      rows.push({
        uid: "toeic-phrase",
        track: trackId,
        word: "phrase",
        pos: "n.",
        level: "Phrase: common",
        senses: [{ meaning_zh: "片語" }]
      });
      rows.push({
        uid: "toeic-space",
        track: trackId,
        word: "common word",
        pos: "n.",
        level: "L1",
        senses: [{ meaning_zh: "兩個字" }]
      });
      rows.push({
        uid: "toeic-common",
        track: trackId,
        word: "common",
        pos: "n.",
        level: "L1",
        senses: [{ pos: "n.", meaning_zh: "常見的" }]
      });
    }
    if (trackId === "elementary") {
      rows.push({
        uid: "elementary-school",
        track: trackId,
        word: "school",
        pos: "n.",
        level: "L1",
        senses: [{ pos: "n.", meaning_zh: "學校" }]
      });
    }
    fs.writeFileSync(
      path.join(root, "data", trackId + ".jsonl"),
      rows.map((row) => JSON.stringify(row)).join("\n") + "\n"
    );
  }

  return root;
}

afterEach(() => {
  for (const root of temporaryRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  temporaryRoots = [];
});

describe("build level test data", () => {
  it("uses unique frequency ranks, priority tracks, first-sense meanings, and excludes phrases", () => {
    const root = createSourceRepo();
    const payload = buildLevelTestPayload(root);
    const shared = payload.questions.find((question) => question.word === "shared");

    expect(shared).toMatchObject({
      uid: "toeic-shared",
      track: "toeic",
      rank: 2,
      meaning: "toeic meaning"
    });
    expect(payload.questions.some((question) => question.word === "phrase")).toBe(false);
    expect(payload.questions.some((question) => question.word === "common word")).toBe(false);
    expect(payload.tracks).toHaveLength(13);
    expect(payload.tracks.find((track) => track.id === "elementary").median).toBe(3);
  });

  it("reproduces the same sampled question data for the same seed", () => {
    const root = createSourceRepo();
    expect(buildLevelTestPayload(root)).toEqual(buildLevelTestPayload(root));
  });

  it("uses --data-dir before the environment default", () => {
    expect(parseDataDirArgument(["--data-dir", "D:/custom-data"], {
      VOCABULARY_DATA_REPO: "D:/environment-data"
    })).toBe(path.resolve("D:/custom-data"));
    expect(parseDataDirArgument([], {
      VOCABULARY_DATA_REPO: "D:/environment-data"
    })).toBe(path.resolve("D:/environment-data"));
  });
});
