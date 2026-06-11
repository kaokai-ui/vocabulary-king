let cachedCatalog = null;
const cachedVocabularyByTrack = new Map();

export function buildVersionedVocabularyUrl(path, version) {
  const url = `${import.meta.env.BASE_URL}${path}`;

  if (!version) {
    return url;
  }

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(version)}`;
}

async function fetchJson(url, { signal, cache } = {}) {
  const response = await fetch(url, {
    signal,
    cache
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

export async function loadVocabularyCatalog({ signal, forceRefresh = false } = {}) {
  if (!forceRefresh && cachedCatalog) {
    return cachedCatalog;
  }

  const catalogUrl = `${import.meta.env.BASE_URL}data/catalog.json`;
  cachedCatalog = await fetchJson(catalogUrl, {
    signal,
    cache: forceRefresh ? "reload" : "no-cache"
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
    throw new Error(`Track is unavailable: ${trackId}`);
  }

  return {
    catalog: nextCatalog,
    track
  };
}

export function getCachedVocabulary(trackId) {
  return cachedVocabularyByTrack.get(trackId) ?? null;
}

export async function loadVocabularyTrack(trackId, { catalog, signal, forceRefresh = false } = {}) {
  if (!forceRefresh && cachedVocabularyByTrack.has(trackId)) {
    return {
      catalog: catalog ?? cachedCatalog,
      vocabulary: cachedVocabularyByTrack.get(trackId),
      track: getTrackFromCatalog(catalog ?? cachedCatalog, trackId)
    };
  }

  const { catalog: nextCatalog, track } = await loadAvailableTrack(catalog, trackId, { signal, forceRefresh });
  const version = nextCatalog.generatedAt;
  const chunkPayloads = await Promise.all(
    track.chunkFiles.map((chunkFile) =>
      fetchJson(buildVersionedVocabularyUrl(chunkFile.path, version), {
        signal,
        cache: forceRefresh ? "reload" : "force-cache"
      })
    )
  );
  const vocabulary = chunkPayloads.flat();

  cachedVocabularyByTrack.set(trackId, vocabulary);

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
