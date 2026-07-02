import { memo } from "react";

// Ported from IdiomKing/src/components/ChainBoardCell.tsx.

const ChainBoardCell = memo(function ChainBoardCell({ cell, isSelected, isLineHighlighted, isWrong, phase, onClick }) {
  if (!cell.isActive) return <div className="wc-cell wc-cell--disabled" />;

  const canInteract = phase === "playing" || phase === "checking";
  let className = "wc-cell wc-cell--active";
  if (cell.isPreset) className += " wc-cell--preset";
  if (isLineHighlighted) className += " wc-cell--line";
  if (isSelected && !cell.isPreset && canInteract) className += " wc-cell--selected";
  if (isWrong) className += " wc-cell--wrong";
  if (phase === "complete" && cell.currentValue !== null && cell.currentValue === cell.answer) {
    className += " wc-cell--correct";
  }

  return (
    <div className={className} onClick={canInteract ? onClick : undefined}>
      <span className="wc-cell-text">{cell.currentValue || ""}</span>
    </div>
  );
});

export default ChainBoardCell;
