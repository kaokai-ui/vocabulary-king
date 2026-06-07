import { useEffect, useState } from "react";
import { messages } from "./i18n/messages";
import { useVocabularyApp } from "./hooks/useVocabularyApp";
import { trackScreenView } from "./lib/analytics";
import { useVocabularyData } from "./hooks/useVocabularyData";
import { readStoredSettings } from "./lib/storage";
import { screenAnalytics, screenRegistry } from "./screens/screenRegistry";

function App() {
  const [activeTrack, setActiveTrack] = useState(() => readStoredSettings().vocabularyTrack);
  const { vocabulary, catalog, vocabularyError, isLoading } = useVocabularyData(activeTrack);
  const app = useVocabularyApp(vocabulary);
  const activeScreenKey = screenRegistry[app.session.screen] ? app.session.screen : "home";

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

  if (vocabularyError) {
    return (
      <main className="stage-shell">
        <section className="placeholder-panel">
          <h2>{app.text.vocabularyLoadFailed}</h2>
        </section>
      </main>
    );
  }

  if (!app.isPersistenceReady || isLoading) {
    return (
      <main className="stage-shell">
        <section className="placeholder-panel">
          <h2>{app.text.loadingVocabulary}</h2>
        </section>
      </main>
    );
  }

  if (vocabulary.length === 0) {
    return (
      <main className="stage-shell">
        <section className="placeholder-panel">
          <h2>{app.text.emptyVocabularyTrack}</h2>
        </section>
      </main>
    );
  }

  return screenRegistry[activeScreenKey]({
    ...app,
    catalog,
    messages,
    vocabulary
  });
}

export default App;
