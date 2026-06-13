import { describe, expect, it } from "vitest";
import { extractEnglishPrompt, buildWholeWordPattern, createClozePrompt } from "./clozePrompt";

describe("extractEnglishPrompt", () => {
  it("returns the full text when there is no Chinese parenthetical", () => {
    expect(extractEnglishPrompt("I like apples.")).toBe("I like apples.");
  });

  it("strips the Chinese parenthetical and trailing content", () => {
    expect(extractEnglishPrompt("We need to reduce waste at school. (我們需要減少學校的浪費。)")).toBe(
      "We need to reduce waste at school."
    );
  });

  it("handles full-width Chinese parentheses", () => {
    expect(extractEnglishPrompt("He announced the result（他宣布了結果）")).toBe("He announced the result");
  });

  it("returns empty string for empty input", () => {
    expect(extractEnglishPrompt("")).toBe("");
    expect(extractEnglishPrompt(null)).toBe("");
    expect(extractEnglishPrompt(undefined)).toBe("");
  });

  it("does not strip English parenthetical at the start", () => {
    expect(extractEnglishPrompt("(See page 5) the answer is here.")).toBe("(See page 5) the answer is here.");
  });
});

describe("buildWholeWordPattern", () => {
  it("builds a case-insensitive whole-word pattern", () => {
    const pattern = buildWholeWordPattern("reduce");
    expect(pattern).not.toBeNull();
    expect(pattern.test("reduce")).toBe(true);
    expect(pattern.test("Reduce")).toBe(true);
    expect(pattern.test("REDUCE")).toBe(true);
    expect(pattern.test("reduced")).toBe(false);
    expect(pattern.test("reduction")).toBe(false);
  });

  it("returns null for words containing a slash", () => {
    expect(buildWholeWordPattern("a/b")).toBeNull();
  });

  it("returns null for empty or whitespace-only input", () => {
    expect(buildWholeWordPattern("")).toBeNull();
    expect(buildWholeWordPattern("  ")).toBeNull();
    expect(buildWholeWordPattern(null)).toBeNull();
  });

  it("does not match when the word is a substring of another word", () => {
    const pattern = buildWholeWordPattern("announce");
    expect(pattern).not.toBeNull();
    expect(pattern.test("announcement")).toBe(false);
    expect(pattern.test("They will announce it.")).toBe(true);
  });

  it("handles multi-word phrases", () => {
    const pattern = buildWholeWordPattern("take off");
    expect(pattern).not.toBeNull();
    expect(pattern.test("The plane will take off soon.")).toBe(true);
    expect(pattern.test("Takeoff speed")).toBe(false);
  });
});

describe("createClozePrompt", () => {
  it("creates a cloze prompt by replacing the word with blanks", () => {
    const result = createClozePrompt("reduce", "We need to reduce waste at school. (我們需要減少學校的浪費。)");
    expect(result).toBe("We need to ____ waste at school.");
  });

  it("returns null when the word is not found in the example", () => {
    expect(createClozePrompt("eliminate", "We need to reduce waste at school.")).toBeNull();
  });

  it("returns null when the word contains a slash", () => {
    expect(createClozePrompt("a/b", "We need a/b to proceed.")).toBeNull();
  });

  it("returns null for empty example", () => {
    expect(createClozePrompt("word", "")).toBeNull();
    expect(createClozePrompt("word", null)).toBeNull();
  });

  it("returns null for empty word", () => {
    expect(createClozePrompt("", "The word is here.")).toBeNull();
  });

  it("does not accidentally cloze a substring match", () => {
    const result = createClozePrompt("announce", "The announcement surprised everyone.");
    expect(result).toBeNull();
  });

  it("handles case-insensitive matching", () => {
    const result = createClozePrompt("reduce", "We need to Reduce waste at school.");
    expect(result).toBe("We need to ____ waste at school.");
  });

  it("strips Chinese parenthetical before clozing", () => {
    const result = createClozePrompt("announce", "They will announce the plan. (他們將宣布計畫。)");
    expect(result).toBe("They will ____ the plan.");
  });

  it("handles multi-word phrase cloze", () => {
    const result = createClozePrompt("take off", "The plane will take off soon.");
    expect(result).toBe("The plane will ____ soon.");
  });
});
