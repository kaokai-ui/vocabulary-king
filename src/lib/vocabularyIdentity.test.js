import { describe, expect, it } from "vitest";
import {
  buildDisambiguatedVocabularyId,
  buildLegacyVocabularyId,
  buildStableVocabularyId,
  extractLegacyVocabularySignature
} from "./vocabularyIdentity";

describe("vocabulary identity helpers", () => {
  it("creates stable ids that do not depend on row order", () => {
    expect(buildStableVocabularyId("L3", "Abandon", "放棄")).toBe(buildStableVocabularyId("L3", "Abandon", "放棄"));
  });

  it("can disambiguate entries that share the same word and meaning", () => {
    expect(
      buildDisambiguatedVocabularyId("L6", "organism", "生物；有機體", "A plant is a living organism.")
    ).not.toBe(
      buildDisambiguatedVocabularyId(
        "L6",
        "organism",
        "生物；有機體",
        "Every living organism needs water and nutrients to survive."
      )
    );
  });

  it("can parse the legacy row-index id format", () => {
    expect(buildLegacyVocabularyId("L3", 7, "Abandon")).toBe("L3-8-abandon");
    expect(extractLegacyVocabularySignature("L3-8-abandon")).toEqual({
      level: "L3",
      wordSlug: "abandon"
    });
  });
});
