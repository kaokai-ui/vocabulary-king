import { vocabularyTracks } from "../../constants/vocabularyTracks";
import LocaleSwitcher from "../shared/LocaleSwitcher";
import StageHeader from "../shared/StageHeader";

export default function SettingsScreen({
  text,
  locale,
  messages,
  settings,
  onHome,
  onChangeLocale,
  onChangeVocabularyTrack,
  onToggleSetting
}) {
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

        <div className="setting-row">
          <div>
            <h2>{text.language}</h2>
            <p>
              {text.selectedLanguage}: {text.localeLabel}
            </p>
          </div>
          <LocaleSwitcher locale={locale} messages={messages} onChange={onChangeLocale} />
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
      </section>
    </main>
  );
}
