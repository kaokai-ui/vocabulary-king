import { describe, expect, it } from "vitest";
import { searchVocabulary } from "./wordSearch";

describe("searchVocabulary", () => {
  const vocabulary = [
    {
      id: "l6-vocation-1",
      word: "vocation",
      meaning: "n. vocation",
      example: "Teaching is her vocation.",
      level: "L6",
      sourceTrackId: "senior-high-5-6"
    },
    {
      id: "l6-vocation-2",
      word: "vocation",
      meaning: "n. vocation",
      example: "Teaching is her vocation.",
      level: "L6",
      sourceTrackId: "gept-high-intermediate"
    },
    {
      id: "l6-vocational-1",
      word: "vocational",
      meaning: "adj. vocational",
      example: "He attends a vocational school.",
      level: "L6",
      sourceTrackId: "senior-high-5-6"
    },
    {
      id: "toeic-vocation",
      word: "vocation",
      meaning: "TOEIC meaning",
      example: "Service is a vocation.",
      level: "TOEIC-ADV",
      sourceTrackId: "toeic-advanced"
    }
  ];

  it("shows exact matches first while still keeping related prefix matches", () => {
    const results = searchVocabulary(vocabulary, "vocation");

    expect(results.map((word) => `${word.word}:${word.level}`)).toEqual([
      "vocation:L6",
      "vocation:TOEIC-ADV",
      "vocational:L6"
    ]);
  });

  it("deduplicates visually identical results from multiple tracks", () => {
    const results = searchVocabulary(vocabulary, "vocation");

    expect(results.filter((word) => word.word === "vocation" && word.level === "L6")).toHaveLength(1);
  });

  it("deduplicates same word and level when the example is identical even if meaning text differs", () => {
    const results = searchVocabulary(
      [
        {
          id: "a-long",
          word: "vocation",
          meaning: "n. vocation",
          example: "Teaching is her vocation.",
          level: "L6"
        },
        {
          id: "b-short",
          word: "vocation",
          meaning: "noun vocation and calling",
          example: "Teaching is her vocation.",
          level: "L6"
        }
      ],
      "vocation"
    );

    expect(results).toHaveLength(1);
    expect(results[0].meaning).toBe("noun vocation and calling");
  });

  it("falls back to prefix matching when no exact word exists", () => {
    const results = searchVocabulary(vocabulary, "voca");

    expect(results.map((word) => `${word.word}:${word.level}`)).toEqual([
      "vocation:L6",
      "vocational:L6",
      "vocation:TOEIC-ADV"
    ]);
  });
});
