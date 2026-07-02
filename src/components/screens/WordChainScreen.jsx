import { useCallback, useEffect, useMemo, useState } from "react";
import ChainBoard from "../wordChain/ChainBoard";
import ChainCharBank from "../wordChain/ChainCharBank";
import ChainHintPanel from "../wordChain/ChainHintPanel";
import ChainActions from "../wordChain/ChainActions";
import { WordChainTextContext } from "../wordChain/WordChainTextContext";
import { buildWordChainDb, isWordChainDbPlayable } from "../../game/wordChainDb";
import { useWordChain } from "../../game/useWordChain";

export default function WordChainScreen(props) {
  // Single provider wrapper so subcomponents can read `text` from context
  // instead of it being threaded through every one of them.
  return (
    <WordChainTextContext.Provider value={props.text}>
      <WordChainScreenInner {...props} />
    </WordChainTextContext.Provider>
  );
}

function WordChainScreenInner({
  text,
  vocabulary,
  vocabularyTrackLabel,
  starredWordIds = [],
  onHome,
  onToggleStarred,
  onPronounce
}) {
  const db = useMemo(() => buildWordChainDb(vocabulary), [vocabulary]);
  const playable = useMemo(() => isWordChainDbPlayable(db), [db]);
  const starredSet = useMemo(() => new Set(starredWordIds), [starredWordIds]);
  const isStarred = useCallback((id) => starredSet.has(id), [starredSet]);

  const {
    level,
    board,
    charTiles,
    selectedCell,
    selectedDirection,
    selectedWord,
    highlightedCellKeys,
    levelNumber,
    phase,
    wrongCells,
    filledCount,
    totalActive,
    hintVisible,
    answerVisible,
    canDeleteCell,
    onCellClick,
    onTileClick,
    onDeleteCell,
    onClearAll,
    onNextLevel,
    onSkipLevel,
    onRestart,
    onToggleHint,
    onRevealAnswer
  } = useWordChain({ db });

  const [footerCompactedForHint, setFooterCompactedForHint] = useState(false);
  const handleBoardOverflowChange = useCallback(
    (tooSmall) => {
      if (tooSmall && hintVisible && !footerCompactedForHint) {
        setFooterCompactedForHint(true);
      }
    },
    [footerCompactedForHint, hintVisible]
  );
  const footerHidden = footerCompactedForHint;
  const handleToggleHint = useCallback(() => {
    if (hintVisible) {
      setFooterCompactedForHint(false);
    }
    onToggleHint();
  }, [hintVisible, onToggleHint]);

  // Reset the overflow-driven footer hiding whenever a new level loads, so the
  // tile bank / actions can never stay stuck hidden across levels.
  useEffect(() => {
    setFooterCompactedForHint(false);
  }, [levelNumber]);

  const topbar = (
    <header className="wc-topbar">
      <button className="ghost-button" type="button" onClick={onHome}>
        {text.home}
      </button>
      <div className="wc-pills">
        <span className="wc-pill">{vocabularyTrackLabel}</span>
        {playable && phase !== "error" ? (
          <>
            <span className="wc-pill">{text.wordChainLevel.replace("{n}", levelNumber)}</span>
            <span className="wc-pill">
              {filledCount}/{totalActive}
            </span>
          </>
        ) : null}
      </div>
    </header>
  );

  if (!playable) {
    return (
      <main className="stage-shell wc-page">
        {topbar}
        <div className="wc-status-panel">
          <p>{text.wordChainUnavailable}</p>
        </div>
      </main>
    );
  }

  if ((phase === "generating" || !level) && phase !== "error") {
    return (
      <main className="stage-shell wc-page">
        {topbar}
        <div className="wc-status-panel">
          <div className="wc-spinner" />
          <p>{text.wordChainLoading}</p>
        </div>
      </main>
    );
  }

  if (phase === "error") {
    return (
      <main className="stage-shell wc-page">
        {topbar}
        <div className="wc-status-panel">
          <p>{text.wordChainError}</p>
          <button className="wc-btn wc-btn--secondary" onClick={onSkipLevel}>
            {text.wordChainSkip}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="stage-shell wc-page">
      {topbar}
      <ChainHintPanel
        entriesById={db.entriesById}
        selectedWord={selectedWord}
        selectedDirection={selectedDirection}
        hintVisible={hintVisible}
        answerVisible={answerVisible}
        onToggleHint={handleToggleHint}
        onRevealAnswer={onRevealAnswer}
        onToggleStarred={onToggleStarred}
        isStarred={isStarred}
        onPronounce={onPronounce}
      />
      <ChainBoard
        board={board}
        selectedCell={selectedCell}
        highlightedCellKeys={highlightedCellKeys}
        wrongCells={wrongCells}
        phase={phase}
        onCellClick={onCellClick}
        onSkipLevel={onSkipLevel}
        onBoardOverflowChange={handleBoardOverflowChange}
      />
      <div className={`wc-footer-slot${footerHidden ? " wc-footer-slot--hidden" : ""}`} aria-hidden={footerHidden}>
        <ChainCharBank tiles={charTiles} onTileClick={onTileClick} />
      </div>
      <div className={`wc-footer-slot${footerHidden ? " wc-footer-slot--hidden" : ""}`} aria-hidden={footerHidden}>
        <ChainActions
          phase={phase}
          canDeleteCell={canDeleteCell}
          onDeleteCell={onDeleteCell}
          onClearAll={onClearAll}
          onNextLevel={onNextLevel}
          onRestart={onRestart}
          onSkipLevel={onSkipLevel}
        />
      </div>
    </main>
  );
}
