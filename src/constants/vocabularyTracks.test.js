import { describe, expect, it } from "vitest";
import { defaultVocabularyTrack, normalizeVocabularyTrack, vocabularyTracks } from "./vocabularyTracks";

describe("normalizeVocabularyTrack", () => {
  it("maps the legacy gept track to the new elementary track", () => {
    expect(normalizeVocabularyTrack("gept")).toBe("gept-elementary");
  });

  it("keeps enabled tracks and falls back for unknown tracks", () => {
    expect(normalizeVocabularyTrack("elementary")).toBe("elementary");
    expect(normalizeVocabularyTrack("toeic")).toBe("toeic");
    expect(normalizeVocabularyTrack("toeic-advanced")).toBe("toeic-advanced");
    expect(normalizeVocabularyTrack("toefl")).toBe("toefl");
    expect(normalizeVocabularyTrack("unknown-track")).toBe(defaultVocabularyTrack);
  });

  it("orders elementary before junior high in the picker", () => {
    expect(vocabularyTracks.slice(0, 2).map((track) => track.value)).toEqual(["elementary", "junior-high"]);
  });
});
