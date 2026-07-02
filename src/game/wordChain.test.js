import { describe, it, expect } from "vitest";
import { buildWordChainDb, isWordChainDbPlayable } from "./wordChainDb";
import { generateRandomChainLevelWithSeed } from "./chainLevelSources";
import { buildBoardFromLevel, isBoardComplete, isBoardCorrect } from "./boardUtils";

function makeVocab(words) {
  return words.map((word, i) => ({ id: `w-${i}`, word, meaning: `意思${i}`, example: "", level: "L1" }));
}

// A small but connected pool that shares many letters so crossings are easy.
const SAMPLE = makeVocab([
  "star",
  "rate",
  "tea",
  "eat",
  "seat",
  "east",
  "sea",
  "art",
  "rat",
  "tar",
  "care",
  "race",
  "acre",
  "read",
  "dear",
  "dare",
  "trace",
  "cater",
  "steam",
  "meat",
  "team",
  "mate",
  "tame",
  "same",
  "seam",
  "least",
  "slate",
  "stale",
  "tales",
  "tearly",
  "layer",
  "relay"
]);

describe("buildWordChainDb", () => {
  it("keeps only single alphabetic words in the length window", () => {
    const vocab = [
      { id: "1", word: "a/an", meaning: "" },
      { id: "2", word: "according to", meaning: "" },
      { id: "3", word: "hi", meaning: "" }, // too short
      { id: "4", word: "elephants", meaning: "" }, // too long (>7)
      { id: "5", word: "apple", meaning: "蘋果" },
      { id: "6", word: "Apple", meaning: "dup" } // duplicate letters
    ];
    const db = buildWordChainDb(vocab);
    expect(db.entries.map((e) => e.text)).toEqual(["apple"]);
    expect(db.entries[0].chars).toEqual(["A", "P", "P", "L", "E"]);
  });

  it("merges meanings of same-spelling homographs instead of dropping one", () => {
    const vocab = [
      { id: "1", word: "lead", meaning: "鉛" },
      { id: "2", word: "lead", meaning: "帶領" },
      { id: "3", word: "lead", meaning: "鉛" } // duplicate meaning, should not repeat
    ];
    const db = buildWordChainDb(vocab);
    expect(db.entries).toHaveLength(1);
    expect(db.entries[0].meaning).toBe("鉛；帶領");
  });

  it("builds a char index and entriesById", () => {
    const db = buildWordChainDb(SAMPLE);
    expect(db.entries.length).toBeGreaterThan(20);
    expect(isWordChainDbPlayable(db)).toBe(true);
    expect(db.charIndex.get("A")?.length).toBeGreaterThan(0);
    expect(db.entriesById[db.entries[0].id]).toBe(db.entries[0]);
  });
});

describe("generateRandomChainLevelWithSeed", () => {
  const db = buildWordChainDb(SAMPLE);

  it("generates solvable levels that can be filled to a correct board", () => {
    let ok = 0;
    for (let lvl = 1; lvl <= 30; lvl++) {
      // Pass an explicit seed so the test is deterministic (not time/Math.random).
      const result = generateRandomChainLevelWithSeed(lvl, db, 1000 + lvl * 7);
      if (!result) continue;
      ok++;
      const level = result.level;
      expect(level.words.length).toBeGreaterThanOrEqual(4);
      expect(level.charBank.length).toBeGreaterThan(0);

      const board = buildBoardFromLevel(level);
      for (const row of board) {
        for (const cell of row) {
          if (cell.isActive && !cell.isPreset) cell.currentValue = cell.answer;
        }
      }
      expect(isBoardComplete(board)).toBe(true);
      expect(isBoardCorrect(board)).toBe(true);
    }
    // The pool is dense enough that most levels should generate.
    expect(ok).toBeGreaterThan(20);
  });

  it("is reproducible for a fixed seed", () => {
    const a = generateRandomChainLevelWithSeed(1, db, 12345);
    const b = generateRandomChainLevelWithSeed(1, db, 12345);
    expect(a).not.toBeNull();
    expect(JSON.stringify(a.level.words)).toBe(JSON.stringify(b.level.words));
    expect(a.level.charBank).toEqual(b.level.charBank);
  });
});
