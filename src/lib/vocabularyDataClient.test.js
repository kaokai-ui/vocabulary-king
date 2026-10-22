import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildVersionedVocabularyUrl,
  clearVocabularyDataCache,
  getCachedCatalog,
  getCachedVocabulary,
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

function buildCatalog(trackOverrides = {}) {
  const tracks = {
    "junior-high": {
      id: "junior-high",
      available: true,
      totalWords: 1,
      chunkFiles: [{ path: "data/tracks/junior-high/chunk-001.json", wordCount: 1 }]
    },
    "senior-high": {
      id: "senior-high",
      available: true,
      totalWords: 1,
      chunkFiles: [{ path: "data/tracks/senior-high/chunk-001.json", wordCount: 1 }]
    },
    ...trackOverrides
  };
  return { generatedAt: "2026-06-09T00:00:00.000Z", tracks };
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
    const catalog = buildCatalog({ "senior-high": undefined });
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
    const catalog = buildCatalog({ "senior-high": undefined });
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

describe("vocabularyDataClient retry/cache behavior", () => {
  beforeEach(() => {
    clearVocabularyDataCache();
    vi.restoreAllMocks();
  });

  it("uses cached track after forceRefresh was used for a previous track", async () => {
    const catalog = buildCatalog();
    const juniorHighVocab = [{ id: "word-jh-1", word: "apple", meaning: "apple" }];
    const seniorHighVocab = [{ id: "word-sh-1", word: "book", meaning: "book" }];

    const fetchMock = vi.spyOn(globalThis, "fetch");

    fetchMock.mockResolvedValueOnce(jsonResponse(catalog));
    fetchMock.mockResolvedValueOnce(jsonResponse(juniorHighVocab));

    await loadVocabularyTrack("junior-high", { forceRefresh: true });

    expect(getCachedVocabulary("junior-high")).toEqual(juniorHighVocab);

    vi.clearAllMocks();
    fetchMock.mockResolvedValueOnce(jsonResponse(seniorHighVocab));

    const result = await loadVocabularyTrack("senior-high", { catalog: getCachedCatalog() });

    expect(result.vocabulary).toEqual(seniorHighVocab);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      withBaseUrl("data/tracks/senior-high/chunk-001.json?v=2026-06-09T00%3A00%3A00.000Z"),
      expect.objectContaining({ cache: "force-cache" })
    );
  });

  it("does not re-fetch a track when it is already cached and forceRefresh is not set", async () => {
    const catalog = buildCatalog({ "senior-high": undefined });
    const vocab = [{ id: "word-1", word: "apple", meaning: "apple" }];

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(catalog))
      .mockResolvedValueOnce(jsonResponse(vocab));

    const first = await loadVocabularyTrack("junior-high");
    expect(first.vocabulary).toEqual(vocab);

    vi.restoreAllMocks();

    const second = await loadVocabularyTrack("junior-high");
    expect(second.vocabulary).toEqual(vocab);
    expect(getCachedVocabulary("junior-high")).toStrictEqual(vocab);
  });

  it("forceRefresh bypasses the track cache", async () => {
    const catalog = buildCatalog({ "senior-high": undefined });
    const vocab = [{ id: "word-1", word: "apple", meaning: "apple" }];
    const freshVocab = [{ id: "word-1", word: "apple", meaning: "apple (updated)" }];

    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(catalog))
      .mockResolvedValueOnce(jsonResponse(vocab))
      .mockResolvedValueOnce(jsonResponse(catalog))
      .mockResolvedValueOnce(jsonResponse(freshVocab));

    await loadVocabularyTrack("junior-high");
    const refreshed = await loadVocabularyTrack("junior-high", { forceRefresh: true });

    expect(refreshed.vocabulary).toEqual(freshVocab);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("reloads a cached track when the catalog version changes", async () => {
    const firstCatalog = buildCatalog();
    const nextCatalog = {
      ...buildCatalog(),
      generatedAt: "2026-06-30T00:00:00.000Z"
    };
    const vocab = [{ id: "word-1", word: "apple", meaning: "apple" }];
    const refreshedVocab = [{ id: "word-1", word: "apple", meaning: "apple (traditional updated)" }];

    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(firstCatalog))
      .mockResolvedValueOnce(jsonResponse(vocab))
      .mockResolvedValueOnce(jsonResponse(nextCatalog))
      .mockResolvedValueOnce(jsonResponse(refreshedVocab));

    await loadVocabularyTrack("junior-high");
    const refreshedCatalog = await loadVocabularyCatalog({ forceRefresh: true });
    const refreshed = await loadVocabularyTrack("junior-high", { catalog: refreshedCatalog });

    expect(refreshed.vocabulary).toEqual(refreshedVocab);
    expect(fetchMock).toHaveBeenCalledWith(
      withBaseUrl("data/tracks/junior-high/chunk-001.json?v=2026-06-30T00%3A00%3A00.000Z"),
      expect.objectContaining({ cache: "force-cache" })
    );
  });

  it("in-memory catalog cache is reused across tracks", async () => {
    const catalog = buildCatalog();
    const juniorHighVocab = [{ id: "word-jh-1", word: "apple", meaning: "apple" }];
    const seniorHighVocab = [{ id: "word-sh-1", word: "book", meaning: "book" }];

    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(catalog))
      .mockResolvedValueOnce(jsonResponse(juniorHighVocab))
      .mockResolvedValueOnce(jsonResponse(seniorHighVocab));

    await loadVocabularyTrack("junior-high");
    await loadVocabularyTrack("senior-high", { catalog: getCachedCatalog() });

    const catalogCalls = fetchMock.mock.calls.filter(
      (call) => call[0] === withBaseUrl("data/catalog.json")
    );
    expect(catalogCalls).toHaveLength(1);
  });

  it("does not request locale overlays when the build flag is disabled", async () => {
    const catalog = buildCatalog({
      "senior-high": undefined,
      "junior-high": {
        id: "junior-high",
        available: true,
        totalWords: 1,
        chunkFiles: [{ path: "data/tracks/junior-high/chunk-001.json", wordCount: 1 }],
        locales: {
          ja: {
            totalWords: 1,
            chunkFiles: [{ path: "data/tracks/junior-high/ja/chunk-001.json", wordCount: 1 }]
          }
        }
      }
    });
    const vocabulary = [{ id: "word-1", word: "apple", meaning: "蘋果", example: "Apple (蘋果。)" }];
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(catalog))
      .mockResolvedValueOnce(jsonResponse(vocabulary));

    const result = await loadVocabularyTrack("junior-high", {
      locale: "ja",
      enabledExtraLocales: []
    });

    expect(result.vocabulary).toEqual(vocabulary);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/ja/"))).toBe(false);
  });

  it("loads overlays by locale, marks Chinese fallbacks, and keeps ids stable when switching", async () => {
    const catalog = buildCatalog({
      "senior-high": undefined,
      "junior-high": {
        id: "junior-high",
        available: true,
        totalWords: 2,
        chunkFiles: [{ path: "data/tracks/junior-high/chunk-001.json", wordCount: 2 }],
        locales: {
          ja: {
            totalWords: 1,
            chunkFiles: [{ path: "data/tracks/junior-high/ja/chunk-001.json", wordCount: 1 }]
          },
          ko: {
            totalWords: 1,
            chunkFiles: [{ path: "data/tracks/junior-high/ko/chunk-001.json", wordCount: 1 }]
          }
        }
      }
    });
    const baseVocabulary = [
      { id: "word-1", word: "apple", meaning: "蘋果", example: "Apple (蘋果。)" },
      { id: "word-2", word: "book", meaning: "書", example: "Book (書。)" }
    ];
    const japaneseOverlay = [{ id: "word-1", meaning: "林檎", example: "" }];
    const koreanOverlay = [{ id: "word-1", meaning: "사과", example: "그것은 예문이다." }];
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(catalog))
      .mockResolvedValueOnce(jsonResponse(baseVocabulary))
      .mockResolvedValueOnce(jsonResponse(japaneseOverlay))
      .mockResolvedValueOnce(jsonResponse(koreanOverlay));

    const japanese = await loadVocabularyTrack("junior-high", {
      locale: "ja",
      enabledExtraLocales: ["ja", "ko"]
    });
    const korean = await loadVocabularyTrack("junior-high", {
      locale: "ko",
      catalog,
      enabledExtraLocales: ["ja", "ko"]
    });
    const japaneseAgain = await loadVocabularyTrack("junior-high", {
      locale: "ja",
      catalog,
      enabledExtraLocales: ["ja", "ko"]
    });

    expect(japanese.vocabulary[0]).toMatchObject({
      id: "word-1",
      meaning: "林檎",
      example: "Apple (蘋果。)",
      sourceExample: "Apple (蘋果。)",
      meaningIsFallback: false,
      exampleIsFallback: true
    });
    expect(japanese.vocabulary[1]).toMatchObject({
      id: "word-2",
      meaning: "書",
      example: "Book (書。)",
      meaningIsFallback: true,
      exampleIsFallback: true
    });
    expect(korean.vocabulary[0]).toMatchObject({
      id: "word-1",
      meaning: "사과",
      example: "그것은 예문이다.",
      meaningIsFallback: false,
      exampleIsFallback: false
    });
    expect(japaneseAgain.vocabulary.map(({ id }) => id)).toEqual(baseVocabulary.map(({ id }) => id));
    expect(japaneseAgain.vocabulary).toEqual(japanese.vocabulary);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.includes("/ja/") || url.includes("/ko/")))
      .toEqual([
        withBaseUrl("data/tracks/junior-high/ja/chunk-001.json?v=2026-06-09T00%3A00%3A00.000Z"),
        withBaseUrl("data/tracks/junior-high/ko/chunk-001.json?v=2026-06-09T00%3A00%3A00.000Z")
      ]);
  });
});
