import SpeakerButton from "../shared/SpeakerButton";
import { useWordChainText } from "./WordChainTextContext";

// Ported from IdiomKing/src/components/ChainHintPanel.tsx (focused/random-mode
// variant). The semantic hint is the word's meaning; "reveal" shows the word.

export default function ChainHintPanel({
  entriesById,
  selectedWord,
  selectedDirection,
  hintVisible,
  answerVisible,
  onToggleHint,
  onRevealAnswer,
  onHideAnswer,
  onToggleStarred,
  isStarred,
  onPronounce
}) {
  const text = useWordChainText();
  const entry = selectedWord ? entriesById[selectedWord.id] : null;
  const starred = selectedWord && isStarred ? isStarred(selectedWord.id) : false;

  return (
    <div className="wc-hint-panel">
      <button className="wc-hint-toggle" onClick={onToggleHint}>
        <span className="wc-hint-icon">{hintVisible ? "📖" : "💡"}</span>
        <span>{hintVisible ? text.wordChainHideHint : text.wordChainShowHint}</span>
      </button>
      {hintVisible && (
        <div className="wc-hint-content">
          {entry ? (
            <div className="wc-hint-card">
              <div className="wc-hint-label-row">
                <p className="wc-hint-label">
                  {selectedDirection === "vertical" ? text.wordChainHintVertical : text.wordChainHintHorizontal}
                </p>
                <span className="wc-hint-actions">
                  {onToggleStarred && (
                    <button
                      className={`wc-hint-action${starred ? " wc-hint-action--active" : ""}`}
                      onClick={() => onToggleStarred(selectedWord.id)}
                    >
                      {starred ? text.addedToWordList : text.addToWordList}
                    </button>
                  )}
                  {!answerVisible ? (
                    <button className="wc-hint-action wc-hint-action--reveal" onClick={onRevealAnswer}>
                      {text.wordChainRevealAnswer}
                    </button>
                  ) : (
                    <button className="wc-hint-action wc-hint-action--reveal" onClick={onHideAnswer}>
                      {text.wordChainHideAnswer}
                    </button>
                  )}
                </span>
              </div>
              <p className="wc-hint-usage">{entry.meaning || text.wordChainNoMeaning}</p>
              {answerVisible && (
                <div className="wc-hint-answer-row">
                  <p className="wc-hint-answer">{entry.text}</p>
                  {onPronounce && (
                    <SpeakerButton className="speaker-button--inline" onClick={() => onPronounce(entry.text)} />
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="wc-hint-empty">{text.wordChainSelectCellPrompt}</p>
          )}
        </div>
      )}
    </div>
  );
}
