import SpeakerButton from "../shared/SpeakerButton";
import StageHeader from "../shared/StageHeader";
import { downloadWordListCsv } from "../../lib/wordListExport";

export default function WordListScreen({ text, words, pronunciationMessage, onHome, onPronounce, onRemoveWord }) {
  return (
    <main className="stage-shell">
      <StageHeader text={text} title={text.wordList} subtitle={text.wordListExplanation} onHome={onHome} />
      <section className="list-panel">
        {words.length > 0 ? (
          <div className="list-panel__actions">
            <button className="solid-button" type="button" onClick={() => downloadWordListCsv(words)}>
              {text.exportWordListCsv ?? "Export CSV"}
            </button>
          </div>
        ) : null}
        {pronunciationMessage ? <p className="empty-state">{pronunciationMessage}</p> : null}
        {words.length === 0 ? (
          <p className="empty-state">{text.emptyWordList}</p>
        ) : (
          words.map((word) => (
            <article key={word.id} className="word-row">
              <div>
                <div className="word-row__head">
                  <div className="word-row__title">
                    <h2>{word.word}</h2>
                    <SpeakerButton className="speaker-button--inline" onClick={() => onPronounce(word.word)} />
                  </div>
                  <span className="pill">{word.displayTrackLabel ?? word.level}</span>
                </div>
                <p className="word-row__meaning">{word.meaning}</p>
                {word.example ? (
                  <div className="word-row__example-wrap">
                    <p className="word-row__example">{word.example}</p>
                    <SpeakerButton
                      className="speaker-button--inline"
                      label="Play example sentence"
                      onClick={() => onPronounce(word.example)}
                    />
                  </div>
                ) : (
                  <p className="word-row__example">{text.emptyExample}</p>
                )}
              </div>
              <button className="ghost-button" type="button" onClick={() => onRemoveWord(word)}>
                {text.remove}
              </button>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
