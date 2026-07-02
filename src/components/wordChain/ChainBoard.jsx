import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ChainBoardCell from "./ChainBoardCell";
import { useWordChainText } from "./WordChainTextContext";
import { CHAIN_CONFIG } from "../../game/chainConfig";

// Ported from IdiomKing/src/components/ChainBoard.tsx.
// Measures its container and scales cells so the grid always fits.

// Shared geometry lives in chainConfig so the generator's viewport guard and the
// renderer can never disagree (a level that passes generation always fits here).
const {
  minCellPx: MIN_CELL,
  gapPx: GAP,
  boardPadPx: BOARD_PAD,
  boardBorderPx: BOARD_BORDER,
  pagePadPx: GAME_PAD
} = CHAIN_CONFIG.viewportGuard;
// Render-only constants (not used by the generator's fit calculation).
const MAX_PAGE_WIDTH = 460;
const OVERFLOW_SETTLE_MS = 160;

function calcCellSize(cols, rows, containerW, containerH) {
  const innerW = Math.max(containerW - BOARD_BORDER * 2 - BOARD_PAD * 2 - GAP * (cols - 1), 0);
  const innerH = Math.max(containerH - BOARD_BORDER * 2 - BOARD_PAD * 2 - GAP * (rows - 1), 0);
  return Math.min(innerW / cols, innerH / rows);
}

function getFallbackContainerSize() {
  return {
    w: Math.max(Math.min(window.innerWidth, MAX_PAGE_WIDTH) - GAME_PAD * 2, 0),
    h: Math.max(window.innerHeight * 0.5, 0)
  };
}

function getContainerSize(element) {
  const fallback = getFallbackContainerSize();
  if (!element) {
    return fallback;
  }
  return {
    w: element.clientWidth || fallback.w,
    h: element.clientHeight || fallback.h
  };
}

export default function ChainBoard({
  board,
  selectedCell,
  highlightedCellKeys,
  wrongCells,
  phase,
  onCellClick,
  onSkipLevel,
  canSkipLevel = true,
  onBoardOverflowChange
}) {
  const text = useWordChainText();
  const cols = board[0]?.length || 1;
  const rows = board.length || 1;
  const containerRef = useRef(null);

  const [containerSize, setContainerSize] = useState(getFallbackContainerSize);
  const syncContainerSize = useCallback(() => {
    setContainerSize(getContainerSize(containerRef.current));
  }, []);

  useLayoutEffect(() => {
    syncContainerSize();
    const element = containerRef.current;
    if (!element) {
      return undefined;
    }

    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => syncContainerSize()) : null;
    resizeObserver?.observe(element);
    window.addEventListener("resize", syncContainerSize);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncContainerSize);
    };
  }, [syncContainerSize]);

  const { cellSize, fontSize, tooSmall } = useMemo(() => {
    const raw = calcCellSize(cols, rows, containerSize.w, containerSize.h);
    const isTooSmall = !Number.isFinite(raw) || raw < MIN_CELL;
    const size = isTooSmall ? MIN_CELL : Math.floor(raw);
    const font = size <= 34 ? 14 : size <= 40 ? 16 : size <= 46 ? 18 : 20;
    return { cellSize: size, fontSize: font, tooSmall: isTooSmall };
  }, [cols, rows, containerSize]);
  const [stableTooSmall, setStableTooSmall] = useState(false);

  useEffect(() => {
    const timerId = window.setTimeout(
      () => {
        setStableTooSmall(tooSmall);
      },
      tooSmall ? OVERFLOW_SETTLE_MS : 0
    );

    return () => window.clearTimeout(timerId);
  }, [tooSmall]);

  useEffect(() => {
    onBoardOverflowChange?.(stableTooSmall);
  }, [stableTooSmall, onBoardOverflowChange]);

  return (
    <div ref={containerRef} className={`wc-board-container${stableTooSmall ? " wc-board-container--overflow" : ""}`}>
      {stableTooSmall ? (
        <>
          <p className="wc-board-overflow-msg">{text.wordChainBoardTooLarge}</p>
          <button className="wc-btn wc-btn--skip" onClick={onSkipLevel} disabled={!canSkipLevel}>
            {text.wordChainSkip}
          </button>
        </>
      ) : (
        <div
          className="wc-board"
          style={{
            gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
            gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
            "--wc-cell-size": `${cellSize}px`,
            "--wc-cell-font": `${fontSize}px`
          }}
        >
          {board.map((row, r) =>
            row.map((cell, c) => (
              <ChainBoardCell
                key={`${r}-${c}`}
                cell={cell}
                isSelected={selectedCell?.row === r && selectedCell?.col === c}
                isLineHighlighted={highlightedCellKeys?.has(`${r}-${c}`) ?? false}
                isWrong={wrongCells.has(`${r}-${c}`)}
                phase={phase}
                onClick={() => onCellClick(r, c)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
