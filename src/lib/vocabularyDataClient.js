let cachedCatalog = null;
const cachedVocabularyByTrack = new Map();
const cachedLocalizedVocabularyByTrackLocale = new Map();

import { VocabularyDataError, VOCABULARY_ERROR_TYPES } from "./vocabularyDataErrors";
import { EXTRA_LOCALE_CODES, getEnabledExtraLocales, isExtraLocaleEnabled } from "../i18n/localeConfig";

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

function localizedCacheKey(trackId, locale) {
  return JSON.stringify([trackId, locale]);
}

export function getCachedVocabulary(trackId, locale = "zh-TW") {
  if (EXTRA_LOCALE_CODES.includes(locale)) {
    return cachedLocalizedVocabularyByTrackLocale.get(localizedCacheKey(trackId, locale))?.vocabulary ?? null;
  }

  return cachedVocabularyByTrack.get(trackId)?.vocabulary ?? null;
}

async function loadBaseVocabularyTrack(trackId, { catalog, signal, forceRefresh = false } = {}) {
  const currentCatalog = catalog ?? cachedCatalog;
  const cachedTrackEntry = cachedVocabularyByTrack.get(trackId);
  const expectedVersion = currentCatalog?.generatedAt ?? null;
  const cachedTrack = getTrackFromCatalog(currentCatalog, trackId);

  if (!forceRefresh && cachedTrackEntry && cachedTrack && (!expectedVersion || cachedTrackEntry.version === expectedVersion)) {
    return {
      catalog: currentCatalog,
      vocabulary: cachedTrackEntry.vocabulary,
      track: cachedTrack
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

function cleanTranslation(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function applyVocabularyTranslationOverlay(vocabulary, translations) {
  const translationsById = new Map((translations ?? []).map((translation) => [translation.id, translation]));

  return vocabulary.map((word) => {
    const translation = translationsById.get(word.id);
    const translatedMeaning = cleanTranslation(translation?.meaning);
    const translatedExample = cleanTranslation(translation?.example);

    return {
      ...word,
      meaning: translatedMeaning || word.meaning,
      example: translatedExample || word.example,
      sourceExample: word.example,
      meaningIsFallback: !translatedMeaning && Boolean(word.meaning),
      exampleIsFallback: !translatedExample && Boolean(word.example)
    };
  });
}

async function loadLocaleTranslations(track, locale, version, { signal, forceRefresh }) {
  const localeTrack = track.locales?.[locale];

  if (!Array.isArray(localeTrack?.chunkFiles) || localeTrack.chunkFiles.length === 0) {
    return [];
  }

  const key = localizedCacheKey(track.id, locale);
  const cachedEntry = cachedLocalizedVocabularyByTrackLocale.get(key);

  if (!forceRefresh && cachedEntry?.version === version) {
    return cachedEntry.translations;
  }

  const payloads = await Promise.all(
    localeTrack.chunkFiles.map((chunkFile) =>
      fetchJson(buildVersionedVocabularyUrl(chunkFile.path, version), {
        signal,
        cache: forceRefresh ? "reload" : "force-cache",
        errorType: VOCABULARY_ERROR_TYPES.chunkLoadFailed
      })
    )
  );
  const translations = payloads.flat();
  cachedLocalizedVocabularyByTrackLocale.set(key, { version, translations });

  return translations;
}

export async function loadVocabularyTrack(
  trackId,
  { catalog, signal, forceRefresh = false, locale = "zh-TW", enabledExtraLocales = getEnabledExtraLocales() } = {}
) {
  const baseResult = await loadBaseVocabularyTrack(trackId, { catalog, signal, forceRefresh });

  if (!isExtraLocaleEnabled(locale, enabledExtraLocales)) {
    return baseResult;
  }

  const key = localizedCacheKey(trackId, locale);
  const version = baseResult.catalog?.generatedAt ?? null;
  const cachedEntry = cachedLocalizedVocabularyByTrackLocale.get(key);

  if (!forceRefresh && cachedEntry?.version === version && cachedEntry.vocabulary) {
    return {
      ...baseResult,
      vocabulary: cachedEntry.vocabulary
    };
  }

  const translations = await loadLocaleTranslations(baseResult.track, locale, version, { signal, forceRefresh });
  const vocabulary = applyVocabularyTranslationOverlay(baseResult.vocabulary, translations);
  cachedLocalizedVocabularyByTrackLocale.set(key, { version, translations, vocabulary });

  return {
    ...baseResult,
    vocabulary
  };
}

export function clearVocabularyDataCache() {
  cachedCatalog = null;
  cachedVocabularyByTrack.clear();
  cachedLocalizedVocabularyByTrackLocale.clear();
}
