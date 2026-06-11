import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildVersionedVocabularyUrl,
  clearVocabularyDataCache,
  loadVocabularyCatalog,
  loadVocabularyTrack
} from "./vocabularyDataClient";

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json"
    }
  });
}

function withBaseUrl(path) {
  return `${import.meta.env.BASE_URL}${path}`;
}

describe("vocabularyDataClient", () => {
  beforeEach(() => {
    clearVocabularyDataCache();
    vi.restoreAllMocks();
  });

  it("adds the catalog version to chunk URLs", () => {
    expect(buildVersionedVocabularyUrl("data/tracks/junior-high/chunk-001.json", "2026-06-09T00:00:00.000Z")).toBe(
      withBaseUrl("data/tracks/junior-high/chunk-001.json?v=2026-06-09T00%3A00%3A00.000Z")
    );
  });

  it("loads catalog with revalidation and chunks with versioned cacheable URLs", async () => {
    const catalog = {
      generatedAt: "2026-06-09T00:00:00.000Z",
      tracks: {
        "junior-high": {
          id: "junior-high",
          available: true,
          totalWords: 1,
          chunkFiles: [
            {
              path: "data/tracks/junior-high/chunk-001.json",
              wordCount: 1
            }
          ]
        }
      }
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(catalog))
      .mockResolvedValueOnce(jsonResponse([{ id: "word-1", word: "apple", meaning: "apple" }]));

    const loadedCatalog = await loadVocabularyCatalog();
    const result = await loadVocabularyTrack("junior-high", { catalog: loadedCatalog });

    expect(result.vocabulary).toHaveLength(1);
    expect(fetchMock).toHaveBeenNthCalledWith(1, withBaseUrl("data/catalog.json"), expect.objectContaining({ cache: "no-cache" }));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      withBaseUrl("data/tracks/junior-high/chunk-001.json?v=2026-06-09T00%3A00%3A00.000Z"),
      expect.objectContaining({ cache: "force-cache" })
    );
  });

  it("reloads catalog and chunks when forceRefresh is requested", async () => {
    const catalog = {
      generatedAt: "2026-06-09T00:00:00.000Z",
      tracks: {
        "junior-high": {
          id: "junior-high",
          available: true,
          totalWords: 1,
          chunkFiles: [
            {
              path: "data/tracks/junior-high/chunk-001.json",
              wordCount: 1
            }
          ]
        }
      }
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(catalog))
      .mockResolvedValueOnce(jsonResponse([{ id: "word-1", word: "apple", meaning: "apple" }]));

    const result = await loadVocabularyTrack("junior-high", { forceRefresh: true });

    expect(result.vocabulary).toHaveLength(1);
    expect(fetchMock).toHaveBeenNthCalledWith(1, withBaseUrl("data/catalog.json"), expect.objectContaining({ cache: "reload" }));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      withBaseUrl("data/tracks/junior-high/chunk-001.json?v=2026-06-09T00%3A00%3A00.000Z"),
      expect.objectContaining({ cache: "reload" })
    );
  });
});
