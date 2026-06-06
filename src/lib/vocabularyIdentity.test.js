import { describe, expect, it } from "vitest";
import {
  buildLegacyVocabularyId,
  buildStableVocabularyId,
  extractLegacyVocabularySignature
} from "./vocabularyIdentity";

describe("vocabulary identity helpers", () => {
  it("creates stable ids that do not depend on row order", () => {
    expect(buildStableVocabularyId("L3", "Abandon", "放棄")).toBe(buildStableVocabularyId("L3", "Abandon", "放棄"));
  });

  it("can parse the legacy row-index id format", () => {
    expect(buildLegacyVocabularyId("L3", 7, "Abandon")).toBe("L3-8-abandon");
    expect(extractLegacyVocabularySignature("L3-8-abandon")).toEqual({
      level: "L3",
      wordSlug: "abandon"
    });
  });
});
