import SpeakerButton from "../shared/SpeakerButton";
import StageHeader from "../shared/StageHeader";

export default function KnownWordListScreen({ text, words, onHome, onPronounce, onRemoveWord }) {
  return (
    <main className="stage-shell">
      <StageHeader text={text} title={text.knownWords} subtitle={text.knownWordsExplanation} onHome={onHome} />
      <section className="list-panel">
        {words.length === 0 ? (
          <p className="empty-state">{text.emptyKnownWords}</p>
        ) : (
          words.map((word) => (
            <article key={word.id} className="word-row">
              <div>
                <div className="word-row__head">
                  <div className="word-row__title">
                    <h2>{word.word}</h2>
                    <SpeakerButton className="speaker-button--inline" onClick={() => onPronounce(word.word)} />
                  </div>
                  <span className="pill">{word.level}</span>
                </div>
                <p>{word.meaning}</p>
                <p className="word-row__example">{word.example || text.emptyExample}</p>
              </div>
              <button className="ghost-button" type="button" onClick={() => onRemoveWord(word.id)}>
                {text.remove}
              </button>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
