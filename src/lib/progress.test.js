import { describe, expect, it } from "vitest";
import { getTrackProgress, migrateTrackProgress, setTrackProgress } from "./progress";

const vocabulary = [
  { id: "source-uid-apple", level: "L1", word: "apple", meaning: "fruit", example: "" },
  { id: "source-uid-book", level: "L1", word: "book", meaning: "reading", example: "" }
];

describe("progress helpers", () => {
  it("uses loaded source ids for starred, known, stats, and saved words", () => {
    const sourceUid = "source-uid-9e7d";
    const migrated = migrateTrackProgress(
      {
        starredWordIds: [sourceUid],
        knownWordIds: [sourceUid],
        wordStats: { [sourceUid]: { seenCount: 3, correctCount: 2, wrongCount: 1, lastSeenAt: 17 } },
        quizHistory: []
      },
      [{ id: sourceUid, level: "L1", word: "changed headword", meaning: "changed meaning", example: "" }]
    );

    expect(migrated.starredWordIds).toEqual([sourceUid]);
    expect(migrated.knownWordIds).toEqual([sourceUid]);
    expect(migrated.wordStats[sourceUid].seenCount).toBe(3);
  });

  it("keeps track progress isolated in the namespaced store", () => {
    const progress = setTrackProgress(
      setTrackProgress({ byTrack: {} }, "junior-high", { starredWordIds: ["source-a"] }),
      "senior-high",
      { starredWordIds: ["source-b"] }
    );

    expect(getTrackProgress(progress, "junior-high").starredWordIds).toEqual(["source-a"]);
    expect(getTrackProgress(progress, "senior-high").starredWordIds).toEqual(["source-b"]);
  });

  it("keeps only exact source ids and does not infer ids from old word or meaning text", () => {
    const migrated = migrateTrackProgress(
      {
        starredWordIds: ["source-uid-apple", "L1-1-apple", "L1-apple-fruit"],
        knownWordIds: ["source-uid-book"],
        wordStats: {
          "source-uid-apple": { seenCount: 2, correctCount: 1, wrongCount: 0, lastSeenAt: 10 },
          "L1-1-apple": { seenCount: 99, correctCount: 0, wrongCount: 99, lastSeenAt: 99 }
        },
        quizHistory: []
      },
      vocabulary
    );

    expect(migrated.starredWordIds).toEqual(["source-uid-apple"]);
    expect(migrated.knownWordIds).toEqual(["source-uid-book"]);
    expect(migrated.wordStats).toEqual({
      "source-uid-apple": { seenCount: 2, correctCount: 1, wrongCount: 0, lastSeenAt: 10 }
    });
  });
});
