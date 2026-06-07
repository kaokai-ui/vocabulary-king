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

  it("creates cloze questions with a blank and unique word choices", () => {
    const clozeVocabulary = [
      {
        id: "1",
        word: "announce",
        meaning: "宣布",
        level: "L3",
        example: "The company will announce a new policy next month. (公司下個月將宣布新政策。)"
      },
      {
        id: "2",
        word: "borrow",
        meaning: "借",
        level: "L3",
        example: "I need to borrow a pen from my classmate. (我需要向同學借一支筆。)"
      },
      {
        id: "3",
        word: "reduce",
        meaning: "減少",
        level: "L3",
        example: "We need to reduce waste at school. (我們需要減少學校的浪費。)"
      },
      {
        id: "4",
        word: "cancel",
        meaning: "取消",
        level: "L3",
        example: "They had to cancel the meeting because of the storm. (因為暴風雨，他們必須取消會議。)"
      },
      {
        id: "5",
        word: "prepare",
        meaning: "準備",
        level: "L3",
        example: "Students prepare for the test every week. (學生每週都為考試做準備。)"
      }
    ];

    const questions = createQuizQuestions(clozeVocabulary, 2, { mode: QUIZ_MODES.clozeChoice });

    expect(questions).toHaveLength(2);

    for (const question of questions) {
      expect(question.type).toBe(QUIZ_MODES.clozeChoice);
      expect(question.prompt).toContain("____");
      expect(question.prompt).not.toContain(question.answerWord);
      expect(question.choices).toHaveLength(4);
      expect(question.choices.find((choice) => choice.id === question.correctChoiceId)?.text).toBe(question.answerWord);
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
