import { describe, expect, it } from "vitest";
import { defaultVocabularyTrack, normalizeVocabularyTrack } from "./vocabularyTracks";

describe("normalizeVocabularyTrack", () => {
  it("maps the legacy gept track to the new elementary track", () => {
    expect(normalizeVocabularyTrack("gept")).toBe("gept-elementary");
  });

  it("keeps enabled tracks and falls back for unknown tracks", () => {
    expect(normalizeVocabularyTrack("toeic")).toBe("toeic");
    expect(normalizeVocabularyTrack("toeic-advanced")).toBe("toeic-advanced");
    expect(normalizeVocabularyTrack("unknown-track")).toBe(defaultVocabularyTrack);
  });
});
