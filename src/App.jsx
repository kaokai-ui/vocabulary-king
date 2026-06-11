import { useEffect, useState } from "react";
import { messages } from "./i18n/messages";
import { useVocabularyApp } from "./hooks/useVocabularyApp";
import { trackScreenView } from "./lib/analytics";
import { warmSpeechVoices } from "./lib/speech";
import { useVocabularyData } from "./hooks/useVocabularyData";
import { readStoredSettings } from "./lib/storage";
import { screenAnalytics, screenRegistry } from "./screens/screenRegistry";

function App() {
  const [activeTrack, setActiveTrack] = useState(() => readStoredSettings().vocabularyTrack);
  const {
    vocabulary,
    catalog,
    catalogError,
    vocabularyError,
    isCatalogLoading,
    isVocabularyLoading,
    isVocabularyReady,
    retryVocabulary
  } = useVocabularyData(activeTrack);
  const app = useVocabularyApp(vocabulary);
  const activeScreenKey = screenRegistry[app.session.screen] ? app.session.screen : "home";
  const activeCatalogTrack = catalog?.tracks?.[activeTrack] ?? null;
  const vocabularyCount = isVocabularyReady ? vocabulary.length : activeCatalogTrack?.totalWords ?? vocabulary.length;
  const isHomeScreen = activeScreenKey === "home";

  useEffect(() => {
    if (app.settings.vocabularyTrack !== activeTrack) {
      setActiveTrack(app.settings.vocabularyTrack);
    }
  }, [activeTrack, app.settings.vocabularyTrack]);

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

  if (!isHomeScreen && vocabularyError) {
    return renderVocabularyPlaceholder(app.text.vocabularyLoadFailed, true);
  }

  if (!isHomeScreen && isVocabularyLoading) {
    return renderVocabularyPlaceholder(app.text.loadingVocabulary);
  }

  if (!isHomeScreen && isVocabularyReady && vocabulary.length === 0) {
    return renderVocabularyPlaceholder(app.text.emptyVocabularyTrack);
  }

  return screenRegistry[activeScreenKey]({
    ...app,
    catalog,
    catalogTrack: activeCatalogTrack,
    isVocabularyLoading,
    isVocabularyReady,
    messages,
    retryVocabulary,
    vocabulary,
    vocabularyCount,
    vocabularyError
  });
}

export default App;
