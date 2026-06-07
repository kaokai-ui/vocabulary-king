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

const mergedVocabulary = [
  {
    id: buildStableVocabularyId("L5", "stern", "noun 船尾\nadj. 嚴厲的、嚴峻的"),
    level: "L5",
    word: "stern",
    meaning: "noun 船尾\nadj. 嚴厲的、嚴峻的",
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

  it("migrates prior stable ids to a merged entry when the word-level pair is now unique", () => {
    const migrated = migrateTrackProgress(
      {
        starredWordIds: [
          buildStableVocabularyId("L5", "stern", "船尾"),
          buildStableVocabularyId("L5", "stern", "嚴厲的、嚴峻的")
        ],
        knownWordIds: [buildStableVocabularyId("L5", "stern", "船尾")],
        wordStats: {
          [buildStableVocabularyId("L5", "stern", "船尾")]: {
            seenCount: 2,
            correctCount: 1,
            wrongCount: 0,
            lastSeenAt: 10
          },
          [buildStableVocabularyId("L5", "stern", "嚴厲的、嚴峻的")]: {
            seenCount: 3,
            correctCount: 2,
            wrongCount: 1,
            lastSeenAt: 20
          }
        },
        quizHistory: []
      },
      mergedVocabulary
    );

    const mergedId = buildStableVocabularyId("L5", "stern", "noun 船尾\nadj. 嚴厲的、嚴峻的");

    expect(migrated.starredWordIds).toEqual([mergedId]);
    expect(migrated.knownWordIds).toEqual([mergedId]);
    expect(migrated.wordStats[mergedId]).toMatchObject({
      seenCount: 5,
      correctCount: 3,
      wrongCount: 1,
      lastSeenAt: 20
    });
  });
});
