import { describe, expect, it } from "vitest";
import { countProgress, createPracticeDeck } from "./appState";

const vocabulary = [
  { id: "L1-apple-fruit", word: "apple", meaning: "fruit", level: "L1", example: "" },
  { id: "L1-book-book", word: "book", meaning: "book", level: "L1", example: "" },
  { id: "L1-cat-cat", word: "cat", meaning: "cat", level: "L1", example: "" },
  { id: "L1-dog-dog", word: "dog", meaning: "dog", level: "L1", example: "" }
];

describe("createPracticeDeck", () => {
  it("excludes known words from the random flashcard deck", () => {
    const deck = createPracticeDeck(
      "random",
      {
        starredWordIds: [],
        knownWordIds: ["L1-book-book", "L1-dog-dog"]
      },
      vocabulary
    );

    expect(deck.map((word) => word.id).sort()).toEqual(["L1-apple-fruit", "L1-cat-cat"]);
  });

  it("keeps starred practice focused on the starred list", () => {
    const deck = createPracticeDeck(
      "starred",
      {
        starredWordIds: ["L1-book-book", "L1-dog-dog"],
        knownWordIds: ["L1-book-book", "L1-dog-dog"]
      },
      vocabulary
    );

    expect(deck.map((word) => word.id).sort()).toEqual(["L1-book-book", "L1-dog-dog"]);
  });
});

describe("countProgress", () => {
  it("counts known words as both studied and mastered without double-counting quiz mastery", () => {
    const stats = countProgress(
      {
        knownWordIds: ["L1-apple-fruit", "L1-book-book"],
        wordStats: {
          "L1-apple-fruit": { seenCount: 3, correctCount: 2, wrongCount: 0 },
          "L1-cat-cat": { seenCount: 1, correctCount: 0, wrongCount: 1 }
        }
      },
      vocabulary,
      (wordStats) => wordStats.correctCount >= 2 && wordStats.correctCount > wordStats.wrongCount
    );

    expect(stats).toMatchObject({
      studiedCount: 3,
      masteredCount: 2,
      unknownCount: 1,
      progressRate: 50
    });
  });

  it("ignores progress entries that do not belong to the active vocabulary track", () => {
    const stats = countProgress(
      {
        knownWordIds: ["L1-apple-fruit", "L3-zebra-animal"],
        wordStats: {
          "L1-cat-cat": { seenCount: 1, correctCount: 0, wrongCount: 1 },
          "L3-zebra-animal": { seenCount: 9, correctCount: 9, wrongCount: 0 }
        }
      },
      vocabulary,
      (wordStats) => wordStats.correctCount >= 2 && wordStats.correctCount > wordStats.wrongCount
    );

    expect(stats).toMatchObject({
      studiedCount: 2,
      masteredCount: 1,
      unknownCount: 1,
      progressRate: 25
    });
  });
});
