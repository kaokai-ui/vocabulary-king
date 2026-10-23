import { useEffect, useRef, useState } from "react";
import { messages } from "./i18n/messages";
import { useVocabularyApp } from "./hooks/useVocabularyApp";
import { trackScreenView } from "./lib/analytics";
import { warmSpeechVoices } from "./lib/speech";
import { useVocabularyData } from "./hooks/useVocabularyData";
import { useAllVocabulary } from "./hooks/useAllVocabulary";
import { readStoredSettings } from "./lib/storage";
import { screenAnalytics, screenRegistry } from "./screens/screenRegistry";

function App() {
  const [activeTrack, setActiveTrack] = useState(() => readStoredSettings().vocabularyTrack);
  const [activeLocale, setActiveLocale] = useState(() => readStoredSettings().locale);
  const hasAttemptedWordSearchLoadRef = useRef(false);
  const {
    vocabulary,
    catalog,
    catalogError,
    vocabularyError,
    isCatalogLoading,
    isVocabularyLoading,
    isVocabularyReady,
    retryVocabulary
  } = useVocabularyData(activeTrack, activeLocale);
  const activeCatalogTrack = catalog?.tracks?.[activeTrack] ?? null;
  const app = useVocabularyApp(vocabulary, activeCatalogTrack);
  const { allVocabulary, hasLoadedAllVocabulary, isLoadingAllVocabulary, loadAllVocabulary } = useAllVocabulary(
    vocabulary,
    activeTrack,
    activeLocale
  );
  const activeScreenKey = screenRegistry[app.session.screen] ? app.session.screen : "home";
  const selectedCatalogLevel = activeCatalogTrack?.levels?.find((level) => level.id === app.settings.vocabularyLevel);
  const vocabularyCount = isVocabularyReady
    ? app.practiceVocabulary.length
    : selectedCatalogLevel?.totalWords ?? activeCatalogTrack?.totalWords ?? vocabulary.length;
  const isHomeScreen = activeScreenKey === "home";

  useEffect(() => {
    if (activeScreenKey !== "wordSearch") {
      hasAttemptedWordSearchLoadRef.current = false;
      return;
    }

    if (!hasAttemptedWordSearchLoadRef.current && !hasLoadedAllVocabulary && !isLoadingAllVocabulary) {
      hasAttemptedWordSearchLoadRef.current = true;
      loadAllVocabulary();
    }
  }, [activeScreenKey, hasLoadedAllVocabulary, isLoadingAllVocabulary, loadAllVocabulary]);

  useEffect(() => {
    if (app.settings.vocabularyTrack !== activeTrack) {
      setActiveTrack(app.settings.vocabularyTrack);
    }
  }, [activeTrack, app.settings.vocabularyTrack]);

  useEffect(() => {
    if (app.settings.locale !== activeLocale) {
      setActiveLocale(app.settings.locale);
    }
  }, [activeLocale, app.settings.locale]);

  useEffect(() => {
    const screenConfig = screenAnalytics[activeScreenKey] ?? screenAnalytics.home;

    if (typeof document !== "undefined") {
      document.title = screenConfig.pageTitle;
    }

    trackScreenView(screenConfig, {
      language: app.settings.locale,
      vocabulary_track: activeTrack
    });
  }, [activeScreenKey, activeTrack, app.settings.locale]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo(0, 0);
    }
  }, [activeScreenKey]);

  useEffect(() => {
    warmSpeechVoices();
  }, []);

  function renderVocabularyPlaceholder(message, showRetry = false) {
    return (
      <main className="stage-shell">
        <section className="placeholder-panel">
          <h2>{message}</h2>
          {showRetry ? (
            <button className="solid-button" type="button" onClick={retryVocabulary}>
              {app.text.retryVocabulary}
            </button>
          ) : null}
        </section>
      </main>
    );
  }

  if (catalogError && !catalog) {
    return renderVocabularyPlaceholder(app.text.vocabularyLoadFailed, true);
  }

  if (!app.isPersistenceReady || (isCatalogLoading && !catalog)) {
    return renderVocabularyPlaceholder(app.text.loadingVocabulary);
  }

  const isWordSearchScreen = activeScreenKey === "wordSearch";

  if (!isHomeScreen && !isWordSearchScreen && vocabularyError) {
    return renderVocabularyPlaceholder(app.text.vocabularyLoadFailed, true);
  }

  if (!isHomeScreen && !isWordSearchScreen && isVocabularyLoading) {
    return renderVocabularyPlaceholder(app.text.loadingVocabulary);
  }

  if (!isHomeScreen && !isWordSearchScreen && isVocabularyReady && vocabulary.length === 0) {
    return renderVocabularyPlaceholder(app.text.emptyVocabularyTrack);
  }

  return screenRegistry[activeScreenKey]({
    ...app,
    catalog,
    catalogTrack: activeCatalogTrack,
    isVocabularyLoading,
    isVocabularyReady,
    isLoadingAllVocabulary,
    messages,
    retryVocabulary,
    vocabulary,
    vocabularyCount,
    vocabularyError,
    allVocabulary
  });
}

export default App;
