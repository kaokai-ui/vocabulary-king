export const VOCABULARY_ERROR_TYPES = {
  catalogLoadFailed: "catalog-load-failed",
  trackUnavailable: "track-unavailable",
  chunkLoadFailed: "chunk-load-failed",
  requestAborted: "request-aborted"
};

export class VocabularyDataError extends Error {
  constructor(type, detail) {
    super(`${type}: ${detail ?? ""}`);
    this.name = "VocabularyDataError";
    this.type = type;
    this.detail = detail ?? null;
  }
}
