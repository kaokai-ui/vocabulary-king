import { describe, expect, it } from "vitest";
import { getTrackProgress, migrateTrackProgress, setTrackProgress } from "./progress";
import { buildStableVocabularyId } from "./vocabularyIdentity";

const vocabulary = [
  {
    id: buildStableVocabularyId("L1", "apple", "fruit"),
    level: "L1",
    word: "apple",
    meaning: "fruit",
    example: ""
  },
  {
    id: buildStableVocabularyId("L1", "book", "reading"),
    level: "L1",
    word: "book",
    meaning: "reading",
    example: ""
  }
];

describe("progress helpers", () => {
  it("returns isolated track progress from the namespaced store", () => {
    const progress = setTrackProgress(
      setTrackProgress({ byTrack: {} }, "junior-high", {
        starredWordIds: ["a"]
      }),
      "senior-high",
      {
        starredWordIds: ["b"]
      }
    );

    expect(getTrackProgress(progress, "junior-high").starredWordIds).toEqual(["a"]);
    expect(getTrackProgress(progress, "senior-high").starredWordIds).toEqual(["b"]);
  });

  it("migrates legacy row-index ids to stable ids", () => {
    const migrated = migrateTrackProgress(
      {
        starredWordIds: ["L1-1-apple"],
        knownWordIds: ["L1-2-book"],
        wordStats: {
          "L1-1-apple": {
            seenCount: 2,
            correctCount: 1,
            wrongCount: 0,
            lastSeenAt: 10
          }
        },
        quizHistory: []
      },
      vocabulary
    );

    expect(migrated.starredWordIds).toEqual([buildStableVocabularyId("L1", "apple", "fruit")]);
    expect(migrated.knownWordIds).toEqual([buildStableVocabularyId("L1", "book", "reading")]);
    expect(migrated.wordStats[buildStableVocabularyId("L1", "apple", "fruit")]).toMatchObject({
      seenCount: 2,
      correctCount: 1,
      wrongCount: 0,
      lastSeenAt: 10
    });
  });
});
