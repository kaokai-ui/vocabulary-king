import { useState, useCallback } from "react";
import StageHeader from "../shared/StageHeader";
import SpeakerButton from "../shared/SpeakerButton";
import { searchVocabulary } from "../../lib/wordSearch";

export default function WordSearchScreen({
  text,
  vocabulary,
  starredWordIds = [],
  isLoadingVocabulary,
  onHome,
  onPronounce,
  onAddWordToWordList
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(() => {
    if (!query.trim()) {
      setResults([]);
      setSearched(true);
      return;
    }

    setResults(searchVocabulary(vocabulary, query));
    setSearched(true);
  }, [query, vocabulary]);

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === "Enter") {
        handleSearch();
      }
    },
    [handleSearch]
  );

  return (
    <main className="stage-shell">
      <StageHeader text={text} title={text.wordSearch} subtitle={text.wordSearchHint} onHome={onHome} />
      <section className="search-panel">
        <div className="search-bar">
          <input
            className="search-input"
            type="text"
            placeholder={text.wordSearchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoadingVocabulary}
          />
          <button className="solid-button" type="button" onClick={handleSearch} disabled={isLoadingVocabulary}>
            {text.wordSearch}
          </button>
        </div>

        {isLoadingVocabulary ? (
          <p className="empty-state">{text.loadingVocabulary}</p>
        ) : searched ? (
          results.length > 0 ? (
            <div className="search-results">
              {results.map((word) => {
                const isStarred = starredWordIds.includes(word.id);
                return (
                  <article key={word.id} className="word-row">
                    <div>
                      <div className="word-row__head">
                        <div className="word-row__title">
                          <h2>{word.word}</h2>
                          <SpeakerButton
                            className="speaker-button--inline"
                            onClick={() => onPronounce(word.word)}
                          />
                        </div>
                        <span className="pill">{word.level}</span>
                      </div>
                      <p className="word-row__meaning">{word.meaning}</p>
                      {word.example ? (
                        <div className="word-row__example-wrap">
                          <p className="word-row__example">{word.example}</p>
                          <SpeakerButton
                            className="speaker-button--inline"
                            onClick={() => onPronounce(word.example)}
                          />
                        </div>
                      ) : (
                        <p className="word-row__example">{text.emptyExample}</p>
                      )}
                    </div>
                    <button
                      className={isStarred ? "add-word-button add-word-button--active" : "add-word-button"}
                      type="button"
                      disabled={isStarred}
                      onClick={() => !isStarred && onAddWordToWordList(word)}
                      aria-label={isStarred ? text.wordAddedToList : text.addWordToList}
                    >
                      {isStarred ? text.wordAddedToList : text.addWordToList}
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="empty-state">{text.wordSearchNotFound}</p>
          )
        ) : null}
      </section>
    </main>
  );
}
