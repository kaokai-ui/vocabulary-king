import { vocabularyTracks } from "../../constants/vocabularyTracks";
import LocaleSwitcher from "../shared/LocaleSwitcher";
import PronunciationAccentSwitcher from "../shared/PronunciationAccentSwitcher";
import StageHeader from "../shared/StageHeader";
import WordListCredits from "../shared/WordListCredits";

export default function SettingsScreen({
  text,
  locale,
  messages,
  settings,
  catalogTrack,
  onHome,
  onChangeLocale,
  onChangeVocabularyTrack,
  onChangeVocabularyLevel,
  onChangePronunciationAccent,
  onToggleSetting
}) {
  const levels = Array.isArray(catalogTrack?.levels) ? catalogTrack.levels : [];
  const selectedLevel = levels.some((level) => level.id === settings.vocabularyLevel) ? settings.vocabularyLevel : "all";

  return (
    <main className="stage-shell">
      <StageHeader text={text} title={text.settings} subtitle={text.settingsHint} onHome={onHome} />
      <section className="settings-panel">
        <div className="setting-row setting-row--stack">
          <div>
            <h2>{text.vocabularyTrack}</h2>
            <p>{text.vocabularyTrackHint}</p>
          </div>
          <select
            className="settings-select"
            value={settings.vocabularyTrack}
            onChange={(event) => onChangeVocabularyTrack(event.target.value)}
          >
            {vocabularyTracks.map((track) => (
              <option key={track.value} value={track.value} disabled={!track.enabled}>
                {text[track.labelKey]}
                {!track.enabled ? ` (${text.vocabularyTrackLocked})` : ""}
              </option>
            ))}
          </select>
        </div>

        {levels.length > 0 ? (
          <div className="setting-row setting-row--stack">
            <div>
              <h2>{text.vocabularyLevel}</h2>
              <p>{text.vocabularyLevelHint}</p>
            </div>
            <select
              className="settings-select"
              aria-label={text.vocabularyLevel}
              value={selectedLevel}
              onChange={(event) => onChangeVocabularyLevel(event.target.value)}
            >
              <option value="all">{text.allVocabularyLevels}</option>
              {levels.map((level) => (
                <option key={level.id} value={level.id}>
                  {level.label} ({level.totalWords})
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="setting-row">
          <div>
            <h2>{text.language}</h2>
            <p>
              {text.selectedLanguage}: {text.localeLabel}
            </p>
          </div>
          <LocaleSwitcher locale={locale} messages={messages} onChange={onChangeLocale} />
        </div>

        <div className="setting-row setting-row--stack">
          <div>
            <h2>{text.pronunciationAccent}</h2>
            <p>{text.pronunciationAccentHint}</p>
          </div>
          <PronunciationAccentSwitcher
            accent={settings.pronunciationAccent}
            text={text}
            onChange={onChangePronunciationAccent}
          />
        </div>

        <label className="setting-row setting-row--toggle">
          <div>
            <h2>{text.autoShowMeaning}</h2>
          </div>
          <input type="checkbox" checked={settings.autoShowMeaning} onChange={() => onToggleSetting("autoShowMeaning")} />
        </label>

        <label className="setting-row setting-row--toggle">
          <div>
            <h2>{text.autoShowExample}</h2>
          </div>
          <input type="checkbox" checked={settings.autoShowExample} onChange={() => onToggleSetting("autoShowExample")} />
        </label>

        <label className="setting-row setting-row--toggle">
          <div>
            <h2>{text.meaningQuizTimer}</h2>
            <p>{text.meaningQuizTimerHint}</p>
          </div>
          <input
            type="checkbox"
            checked={settings.meaningQuizTimerEnabled}
            onChange={() => onToggleSetting("meaningQuizTimerEnabled")}
          />
        </label>

        <label className="setting-row setting-row--toggle">
          <div>
            <h2>{text.clozeQuizTimer}</h2>
            <p>{text.clozeQuizTimerHint}</p>
          </div>
          <input
            type="checkbox"
            checked={settings.clozeQuizTimerEnabled}
            onChange={() => onToggleSetting("clozeQuizTimerEnabled")}
          />
        </label>
      </section>
      <section className="settings-panel source-credits-panel">
        <details>
          <summary>{text.wordListSources}</summary>
          <WordListCredits locale={locale} />
        </details>
      </section>
    </main>
  );
}
