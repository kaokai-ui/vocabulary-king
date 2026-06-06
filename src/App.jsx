import { useEffect, useState } from "react";
import { messages } from "./i18n/messages";
import { useVocabularyApp } from "./hooks/useVocabularyApp";
import { useVocabularyData } from "./hooks/useVocabularyData";
import { defaultSettings, readStoredValue, STORAGE_KEYS } from "./lib/storage";
import { screenRegistry } from "./screens/screenRegistry";

function App() {
  const [activeTrack, setActiveTrack] = useState(() => readStoredValue(STORAGE_KEYS.settings, defaultSettings).vocabularyTrack);
  const { vocabulary, catalog, vocabularyError } = useVocabularyData(activeTrack);
  const app = useVocabularyApp(vocabulary);
  const activeScreenKey = screenRegistry[app.session.screen] ? app.session.screen : "home";

  useEffect(() => {
    if (app.settings.vocabularyTrack !== activeTrack) {
      setActiveTrack(app.settings.vocabularyTrack);
    }
  }, [activeTrack, app.settings.vocabularyTrack]);

  if (vocabularyError) {
    return (
      <main className="stage-shell">
        <section className="placeholder-panel">
          <h2>{app.text.vocabularyLoadFailed}</h2>
        </section>
      </main>
    );
  }

  if (!app.isPersistenceReady || vocabulary.length === 0) {
    return (
      <main className="stage-shell">
        <section className="placeholder-panel">
          <h2>{app.text.loadingVocabulary}</h2>
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
