import { describe, expect, it } from "vitest";
import { defaultVocabularyTrack, normalizeVocabularyTrack } from "./vocabularyTracks";

describe("normalizeVocabularyTrack", () => {
  it("maps the legacy gept track to the new elementary track", () => {
    expect(normalizeVocabularyTrack("gept")).toBe("gept-elementary");
  });

  it("falls back to the default track for unknown or disabled tracks", () => {
    expect(normalizeVocabularyTrack("toeic")).toBe(defaultVocabularyTrack);
    expect(normalizeVocabularyTrack("unknown-track")).toBe(defaultVocabularyTrack);
  });
});
