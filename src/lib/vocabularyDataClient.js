let cachedCatalog = null;
const cachedVocabularyByTrack = new Map();

import { VocabularyDataError, VOCABULARY_ERROR_TYPES } from "./vocabularyDataErrors";

export { VocabularyDataError, VOCABULARY_ERROR_TYPES };

function shouldRevalidateCatalogInMemory() {
  return Boolean(import.meta.env?.DEV);
}

export function buildVersionedVocabularyUrl(path, version) {
  const url = `${import.meta.env.BASE_URL}${path}`;

  if (!version) {
    return url;
  }

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(version)}`;
}

async function fetchJson(url, { signal, cache, errorType } = {}) {
  try {
    const response = await fetch(url, {
      signal,
      cache
    });

    if (!response.ok) {
      throw new VocabularyDataError(errorType, `HTTP ${response.status} from ${url}`);
    }

    return await response.json();
  } catch (error) {
    if (error.name === "AbortError") {
      throw new VocabularyDataError(VOCABULARY_ERROR_TYPES.requestAborted, url);
    }

    if (error instanceof VocabularyDataError) {
      throw error;
    }

    throw new VocabularyDataError(errorType, error.message);
  }
}

export async function loadVocabularyCatalog({ signal, forceRefresh = false } = {}) {
  if (!forceRefresh && cachedCatalog && !shouldRevalidateCatalogInMemory()) {
    return cachedCatalog;
  }

  const catalogUrl = `${import.meta.env.BASE_URL}data/catalog.json`;
  cachedCatalog = await fetchJson(catalogUrl, {
    signal,
    cache: forceRefresh ? "reload" : "no-cache",
    errorType: VOCABULARY_ERROR_TYPES.catalogLoadFailed
  });

  return cachedCatalog;
}

export function getCachedCatalog() {
  return cachedCatalog;
}

export function getTrackFromCatalog(catalog, trackId) {
  const track = catalog?.tracks?.[trackId];

  return track?.available ? track : null;
}

export async function loadAvailableTrack(catalog, trackId, { signal, forceRefresh = false } = {}) {
  let nextCatalog = forceRefresh || !catalog ? await loadVocabularyCatalog({ signal, forceRefresh }) : catalog;
  let track = getTrackFromCatalog(nextCatalog, trackId);

  // A fresh JS bundle can coexist briefly with a stale cached catalog on GitHub Pages.
  // Retry once with a forced re-fetch so newly deployed tracks become selectable immediately.
  if (!track) {
    nextCatalog = await loadVocabularyCatalog({ signal, forceRefresh: true });
    track = getTrackFromCatalog(nextCatalog, trackId);
  }

  if (!track) {
    throw new VocabularyDataError(VOCABULARY_ERROR_TYPES.trackUnavailable, trackId);
  }

  return {
    catalog: nextCatalog,
    track
  };
}

export function getCachedVocabulary(trackId) {
  return cachedVocabularyByTrack.get(trackId)?.vocabulary ?? null;
}

export async function loadVocabularyTrack(trackId, { catalog, signal, forceRefresh = false } = {}) {
  const currentCatalog = catalog ?? cachedCatalog;
  const cachedTrackEntry = cachedVocabularyByTrack.get(trackId);
  const expectedVersion = currentCatalog?.generatedAt ?? null;

  if (!forceRefresh && cachedTrackEntry && (!expectedVersion || cachedTrackEntry.version === expectedVersion)) {
    return {
      catalog: currentCatalog,
      vocabulary: cachedTrackEntry.vocabulary,
      track: getTrackFromCatalog(currentCatalog, trackId)
    };
  }

  const { catalog: nextCatalog, track } = await loadAvailableTrack(catalog, trackId, { signal, forceRefresh });
  const version = nextCatalog.generatedAt;
  const refreshedCachedTrackEntry = cachedVocabularyByTrack.get(trackId);

  if (!forceRefresh && refreshedCachedTrackEntry?.version === version) {
    return {
      catalog: nextCatalog,
      track,
      vocabulary: refreshedCachedTrackEntry.vocabulary
    };
  }

  const chunkPayloads = await Promise.all(
    track.chunkFiles.map((chunkFile) =>
      fetchJson(buildVersionedVocabularyUrl(chunkFile.path, version), {
        signal,
        cache: forceRefresh ? "reload" : "force-cache",
        errorType: VOCABULARY_ERROR_TYPES.chunkLoadFailed
      })
    )
  );
  const vocabulary = chunkPayloads.flat();

  cachedVocabularyByTrack.set(trackId, {
    version,
    vocabulary
  });

  return {
    catalog: nextCatalog,
    track,
    vocabulary
  };
}

export function clearVocabularyDataCache() {
  cachedCatalog = null;
  cachedVocabularyByTrack.clear();
}
