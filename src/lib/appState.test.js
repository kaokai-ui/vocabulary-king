import { describe, expect, it } from "vitest";
import { countProgress, createPracticeDeck } from "./appState";

const vocabulary = [
  { id: "word-1", word: "apple", meaning: "蘋果", level: "L1", example: "" },
  { id: "word-2", word: "book", meaning: "書", level: "L1", example: "" },
  { id: "word-3", word: "cat", meaning: "貓", level: "L1", example: "" },
  { id: "word-4", word: "dog", meaning: "狗", level: "L1", example: "" }
];

describe("createPracticeDeck", () => {
  it("excludes known words from the random flashcard deck", () => {
    const deck = createPracticeDeck(
      "random",
      {
        starredWordIds: [],
        knownWordIds: ["word-2", "word-4"]
      },
      vocabulary
    );

    expect(deck.map((word) => word.id).sort()).toEqual(["word-1", "word-3"]);
  });

  it("keeps starred practice focused on the starred list", () => {
    const deck = createPracticeDeck(
      "starred",
      {
        starredWordIds: ["word-2", "word-4"],
        knownWordIds: ["word-2", "word-4"]
      },
      vocabulary
    );

    expect(deck.map((word) => word.id).sort()).toEqual(["word-2", "word-4"]);
  });
});

describe("countProgress", () => {
  it("counts known words as both studied and mastered without double-counting quiz mastery", () => {
    const stats = countProgress(
      {
        knownWordIds: ["word-1", "word-2"],
        wordStats: {
          "word-1": { seenCount: 3, correctCount: 2, wrongCount: 0 },
          "word-3": { seenCount: 1, correctCount: 0, wrongCount: 1 }
        }
      },
      10,
      (wordStats) => wordStats.correctCount >= 2 && wordStats.correctCount > wordStats.wrongCount
    );

    expect(stats).toMatchObject({
      studiedCount: 3,
      masteredCount: 2,
      unknownCount: 1,
      progressRate: 20
    });
  });
});
