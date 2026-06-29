import { describe, expect, it } from "vitest";
import { buildCombinedVocabulary, mergeTrackVocabulary } from "./useAllVocabulary";

describe("useAllVocabulary helpers", () => {
  it("annotates merged entries with their source track", () => {
    const combined = mergeTrackVocabulary([], [{ id: "a", word: "apple", meaning: "fruit", level: "L1" }], "junior-high");

    expect(combined).toEqual([
      {
        id: "a",
        word: "apple",
        meaning: "fruit",
        level: "L1",
        sourceTrackId: "junior-high"
      }
    ]);
  });

  it("keeps the active track vocabulary even when cached tracks are incomplete", () => {
    const combined = buildCombinedVocabulary({
      activeTrackId: "junior-high",
      activeTrackVocabulary: [{ id: "a", word: "apple", meaning: "fruit", level: "L1" }],
      cachedVocabularyEntries: [["senior-high", [{ id: "b", word: "book", meaning: "reading", level: "L3" }]]]
    });

    expect(combined.map((word) => `${word.id}:${word.sourceTrackId}`)).toEqual([
      "a:junior-high",
      "b:senior-high"
    ]);
  });

  it("deduplicates words by id while preserving the first source track annotation", () => {
    const combined = buildCombinedVocabulary({
      activeTrackId: "junior-high",
      activeTrackVocabulary: [{ id: "a", word: "apple", meaning: "fruit", level: "L1" }],
      cachedVocabularyEntries: [["junior-high", [{ id: "a", word: "apple", meaning: "fruit", level: "L1" }]]]
    });

    expect(combined).toHaveLength(1);
    expect(combined[0].sourceTrackId).toBe("junior-high");
  });
});
