import { PRONUNCIATION_ACCENTS, normalizePronunciationAccent } from "../../lib/speech";

export default function PronunciationAccentSwitcher({ accent, text, onChange }) {
  const selectedAccent = normalizePronunciationAccent(accent);

  return (
    <div className="pronunciation-accent-switcher" role="group" aria-label={text.pronunciationAccent}>
      <button
        className={selectedAccent === PRONUNCIATION_ACCENTS.US ? "chip chip--active" : "chip"}
        type="button"
        aria-pressed={selectedAccent === PRONUNCIATION_ACCENTS.US}
        onClick={() => onChange(PRONUNCIATION_ACCENTS.US)}
      >
        {text.pronunciationUs}
      </button>
      <button
        className={selectedAccent === PRONUNCIATION_ACCENTS.UK ? "chip chip--active" : "chip"}
        type="button"
        aria-pressed={selectedAccent === PRONUNCIATION_ACCENTS.UK}
        onClick={() => onChange(PRONUNCIATION_ACCENTS.UK)}
      >
        {text.pronunciationUk}
      </button>
    </div>
  );
}
