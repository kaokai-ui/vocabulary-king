import { useEffect } from "react";
import SpeakerButton from "../shared/SpeakerButton";
import StageHeader from "../shared/StageHeader";

export default function FlashcardScreen({
  text,
  flashcard,
  vocabularyTrackLabel,
  mode,
  currentIndex,
  totalCount,
  isStarred,
  isKnown,
  showMeaning,
  showExample,
  pronunciationMessage,
  onHome,
  onPronounce,
  onToggleMeaning,
  onToggleExample,
  onToggleStarred,
  onAddToWordList,
  onToggleKnown,
  onNext
}) {
  const wordVariants = flashcard?.word
    ? flashcard.word
        .split("/")
        .map((part) => part.trim())
        .filter(Boolean)
    : [];
  const pronunciationWord = wordVariants[0] ?? flashcard?.word ?? "";
  const displayedLevel = vocabularyTrackLabel ?? flashcard?.level ?? "";
  const isRandomMode = mode === "random";

  useEffect(() => {
    if (!flashcard || !isRandomMode) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      const target = event.target;
      const tagName = target?.tagName?.toLowerCase?.() ?? "";
      const isEditable =
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        Boolean(target?.isContentEditable);

      if (isEditable) {
        return;
      }

      const key = String(event.key ?? "").toLowerCase();

      if (key === "a") {
        if (!isStarred) {
          event.preventDefault();
          onAddToWordList?.();
        }
        return;
      }

      if (key === "n") {
        event.preventDefault();
        onNext?.();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [flashcard, isRandomMode, isStarred, onAddToWordList, onNext]);

  if (!flashcard) {
    return (
      <main className="game-shell">
        <StageHeader
          text={text}
          title={text.flashcards}
          subtitle={mode === "starred" ? text.noStarWords : text.noPracticeWords}
          onHome={onHome}
        />
      </main>
    );
  }

  return (
    <main className="game-shell">
      <header className="game-topbar">
        <div className="status-pills">
          <span className="pill">{text.practiceRound}</span>
          <span className="pill">
            {currentIndex + 1} / {totalCount}
          </span>
          <span className="pill">
            {text.levelBadge} {displayedLevel}
          </span>
        </div>
      </header>

      <section className="flashcard-layout">
        <article className="flashcard-stage">
          <div className="flashcard-inline-controls">
            <button className="chip" type="button" onClick={onToggleMeaning}>
              {showMeaning ? text.hideMeaning : text.showMeaning}
            </button>
            <button className="chip" type="button" onClick={onToggleExample}>
              {showExample ? text.hideExample : text.showExample}
            </button>
          </div>
          <span className="pill">{displayedLevel}</span>
          <div className="word-heading">
            <h1 className="flashcard-word-lines">
              {wordVariants.length > 1
                ? wordVariants.map((variant) => (
                    <span key={variant} className="flashcard-word-line">
                      {variant}
                    </span>
                  ))
                : flashcard.word}
            </h1>
            <SpeakerButton onClick={() => onPronounce(pronunciationWord)} />
          </div>
          {showMeaning ? <p className="flashcard-meaning">{flashcard.meaning}</p> : null}
          {showExample ? (
            flashcard.example ? (
              <div className="flashcard-example-row">
                <p className="flashcard-example">{flashcard.example}</p>
                <SpeakerButton
                  className="speaker-button--inline"
                  label="Play example sentence"
                  onClick={() => onPronounce(flashcard.example)}
                />
              </div>
            ) : (
              <p className="flashcard-example">{text.emptyExample}</p>
            )
          ) : null}
          {pronunciationMessage ? <p className="flashcard-example">{pronunciationMessage}</p> : null}
        </article>
      </section>

      <footer className="game-footer">
        <button
          className={isStarred ? "ghost-button ghost-button--active" : "ghost-button"}
          type="button"
          onClick={onToggleStarred}
        >
          {isStarred ? text.addedToWordList : text.addToWordList}
        </button>
        <button className={isKnown ? "ghost-button ghost-button--active" : "ghost-button"} type="button" onClick={onToggleKnown}>
          {isKnown ? text.addedToKnownWords : text.addToKnownWords}
        </button>
        <button className="solid-button" type="button" onClick={onNext}>
          {text.nextWord}
        </button>
        <button className="ghost-button" type="button" onClick={onHome}>
          {text.home}
        </button>
      </footer>
    </main>
  );
}
