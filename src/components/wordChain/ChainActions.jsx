import { useWordChainText } from "./WordChainTextContext";

// Ported from IdiomKing/src/components/ChainActions.tsx.

export default function ChainActions({
  phase,
  canDeleteCell,
  onDeleteCell,
  onClearAll,
  onNextLevel,
  onRestart,
  onSkipLevel
}) {
  const text = useWordChainText();
  return (
    <div className="wc-actions">
      {(phase === "playing" || phase === "checking") && (
        <>
          {phase === "checking" && <div className="wc-checking-msg">{text.wordChainChecking}</div>}
          <div className="wc-action-row">
            <button
              className="wc-btn-icon wc-btn-icon--danger"
              onClick={onDeleteCell}
              disabled={!canDeleteCell}
              title={text.wordChainDelete}
            >
              ×
            </button>
            <button className="wc-btn wc-btn--secondary" onClick={onClearAll}>
              {text.wordChainClearAll}
            </button>
            <button className="wc-btn wc-btn--skip" onClick={onSkipLevel} title={text.wordChainSkip}>
              {text.wordChainSkip}
            </button>
          </div>
        </>
      )}
      {phase === "complete" && (
        <>
          <div className="wc-complete-msg">{text.wordChainComplete}</div>
          <div className="wc-action-row">
            <button className="wc-btn wc-btn--secondary" onClick={onRestart}>
              {text.wordChainRestart}
            </button>
            <button className="wc-btn wc-btn--primary" onClick={onNextLevel}>
              {text.wordChainNext}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
