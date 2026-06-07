import { describe, expect, it } from "vitest";
import { createQuizQuestions, isMasteredWord, QUIZ_MODES } from "./game";

const vocabulary = [
  { id: "1", word: "apple", meaning: "蘋果", level: "L1", example: "" },
  { id: "2", word: "book", meaning: "書", level: "L1", example: "" },
  { id: "3", word: "cat", meaning: "貓", level: "L1", example: "" },
  { id: "4", word: "dog", meaning: "狗", level: "L1", example: "" },
  { id: "5", word: "egg", meaning: "蛋", level: "L1", example: "" }
];

describe("createQuizQuestions", () => {
  it("creates the requested number of questions when enough words exist", () => {
    const questions = createQuizQuestions(vocabulary, 3);

    expect(questions).toHaveLength(3);
  });

  it("always includes the correct meaning in the choices", () => {
    const questions = createQuizQuestions(vocabulary, 4);

    for (const question of questions) {
      expect(question.type).toBe(QUIZ_MODES.meaningChoice);
      expect(question.choices.map((choice) => choice.text)).toContain(question.correctText);
      expect(question.choices.find((choice) => choice.id === question.correctChoiceId)?.text).toBe(question.correctText);
    }
  });

  it("deduplicates identical distractor meanings", () => {
    const duplicateMeaningVocabulary = [
      { id: "1", word: "apple", meaning: "蘋果", level: "L1", example: "" },
      { id: "2", word: "pear", meaning: "水果", level: "L1", example: "" },
      { id: "3", word: "peach", meaning: "水果", level: "L1", example: "" },
      { id: "4", word: "dog", meaning: "狗", level: "L1", example: "" },
      { id: "5", word: "cat", meaning: "貓", level: "L1", example: "" }
    ];

    const questions = createQuizQuestions(duplicateMeaningVocabulary, 2);

    for (const question of questions) {
      const choiceTexts = question.choices.map((choice) => choice.text);
      expect(new Set(choiceTexts).size).toBe(choiceTexts.length);
    }
  });
});

describe("isMasteredWord", () => {
  it("returns true only after at least two correct answers and more correct than wrong", () => {
    expect(isMasteredWord({ correctCount: 2, wrongCount: 0 })).toBe(true);
    expect(isMasteredWord({ correctCount: 2, wrongCount: 2 })).toBe(false);
    expect(isMasteredWord({ correctCount: 1, wrongCount: 0 })).toBe(false);
  });
});
