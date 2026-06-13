import { describe, expect, it } from "vitest";
import { VocabularyDataError, VOCABULARY_ERROR_TYPES } from "./vocabularyDataErrors";

describe("VocabularyDataError", () => {
  it("stores the error type and detail", () => {
    const error = new VocabularyDataError(VOCABULARY_ERROR_TYPES.trackUnavailable, "toefl");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(VocabularyDataError);
    expect(error.name).toBe("VocabularyDataError");
    expect(error.type).toBe("track-unavailable");
    expect(error.detail).toBe("toefl");
    expect(error.message).toContain("track-unavailable");
  });

  it("defaults detail to null", () => {
    const error = new VocabularyDataError(VOCABULARY_ERROR_TYPES.catalogLoadFailed);

    expect(error.detail).toBeNull();
  });
});

describe("VOCABULARY_ERROR_TYPES", () => {
  it("defines all expected error types", () => {
    expect(VOCABULARY_ERROR_TYPES.catalogLoadFailed).toBe("catalog-load-failed");
    expect(VOCABULARY_ERROR_TYPES.trackUnavailable).toBe("track-unavailable");
    expect(VOCABULARY_ERROR_TYPES.chunkLoadFailed).toBe("chunk-load-failed");
    expect(VOCABULARY_ERROR_TYPES.requestAborted).toBe("request-aborted");
  });
});
