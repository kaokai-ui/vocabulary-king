import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isBoardComplete,
  isBoardCorrect,
  getWrongCells,
  getCellKey,
  findTileByCellRef,
  countFilledCells
} from "./boardUtils";
import { CHAIN_CONFIG } from "./chainConfig";
import {
  buildHighlightedCellKeys,
  getDefaultDirectionForCell,
  getWordForDirection,
  getWordsAtCell
} from "./chainSelection";
import { useChainState } from "./useChainState";
import { generateRandomChainLevelWithSeed } from "./chainLevelSources";

// Word-chain game controller, ported from IdiomKing/src/game/useIdiomChain.ts
// and reduced to the random mode only.

export function useWordChain({ db, initialSeed = null, sessionKey = 0 }) {
  const [selectedDirectionPreference, setSelectedDirectionPreference] = useState(null);

  const getLevelData = useCallback(
    (levelNumber, seed) => {
      const result = generateRandomChainLevelWithSeed(levelNumber, db, seed ?? undefined);
      if (result) {
        return { level: result.level, seed: result.seed };
      }
      return { level: null, seed: null };
    },
    [db]
  );

  const { state, dispatch, boardRef, loadLevel, lastSeedRef } = useChainState(getLevelData, {
    maxNullLevelRetries: CHAIN_CONFIG.random.levelRetryCount
  });

  const initialLoadKey = useMemo(() => `random:${initialSeed ?? "auto"}:${sessionKey}`, [initialSeed, sessionKey]);
  const lastInitialLoadKeyRef = useRef(null);

  const selectedCellKey = state.selectedCell ? getCellKey(state.selectedCell.row, state.selectedCell.col) : null;
  const selectedCellWords = useMemo(() => {
    if (!state.level || !state.selectedCell) return [];
    return getWordsAtCell(state.level.words, state.selectedCell.row, state.selectedCell.col);
  }, [state.level, state.selectedCell]);
  const selectedDirection = useMemo(() => {
    if (selectedCellWords.length === 0) return null;
    if (
      selectedCellKey &&
      selectedDirectionPreference?.cellKey === selectedCellKey &&
      selectedCellWords.some((word) => word.direction === selectedDirectionPreference.direction)
    ) {
      return selectedDirectionPreference.direction;
    }
    return getDefaultDirectionForCell(selectedCellWords);
  }, [selectedCellWords, selectedCellKey, selectedDirectionPreference]);
  const selectedWord = useMemo(
    () => getWordForDirection(selectedCellWords, selectedDirection),
    [selectedCellWords, selectedDirection]
  );
  const highlightedCellKeys = useMemo(() => buildHighlightedCellKeys(selectedWord), [selectedWord]);

  const onCellClick = useCallback(
    (row, col) => {
      if (state.phase !== "playing" && state.phase !== "checking") return;
      const cell = state.board[row]?.[col];
      if (!cell || !cell.isActive) return;
      if (state.selectedCell && state.selectedCell.row === row && state.selectedCell.col === col) {
        if (state.level) {
          const wordsAtCell = getWordsAtCell(state.level.words, row, col);
          const hasHorizontal = wordsAtCell.some((word) => word.direction === "horizontal");
          const hasVertical = wordsAtCell.some((word) => word.direction === "vertical");
          if (hasHorizontal && hasVertical) {
            const cellKey = getCellKey(row, col);
            const currentDirection =
              (selectedDirectionPreference?.cellKey === cellKey
                ? selectedDirectionPreference.direction
                : getDefaultDirectionForCell(wordsAtCell)) ?? "horizontal";
            setSelectedDirectionPreference({
              cellKey,
              direction: currentDirection === "horizontal" ? "vertical" : "horizontal"
            });
          }
        }
        return;
      }
      setSelectedDirectionPreference(null);
      dispatch({ type: "SELECT_CELL", payload: { row, col } });
    },
    [state.board, state.level, state.selectedCell, state.phase, dispatch, selectedDirectionPreference]
  );

  const onTileClick = useCallback(
    (tileId) => {
      if ((state.phase !== "playing" && state.phase !== "checking") || !state.selectedCell) return;
      const tile = state.charTiles.find((t) => t.id === tileId);
      if (!tile || tile.used) return;
      const targetCell = state.board[state.selectedCell.row][state.selectedCell.col];
      if (targetCell.isPreset) return;
      const cellKey = getCellKey(state.selectedCell.row, state.selectedCell.col);

      let prevTileId = null;
      if (targetCell.currentValue !== null) {
        const prevTile = findTileByCellRef(state.charTiles, cellKey);
        if (prevTile) prevTileId = prevTile.id;
      }

      const newBoard = state.board.map((r) => r.map((c) => ({ ...c })));
      newBoard[state.selectedCell.row][state.selectedCell.col].currentValue = tile.value;
      const filledCount = countFilledCells(newBoard);

      let nextRow = state.selectedCell.row;
      let nextCol = state.selectedCell.col + 1;
      if (nextCol >= (state.board[0]?.length ?? 0)) {
        nextCol = 0;
        nextRow++;
      }
      let nextSelectedCell = null;
      if (nextRow < state.board.length) {
        for (let r = nextRow; r < state.board.length; r++) {
          const startC = r === nextRow ? nextCol : 0;
          for (let c = startC; c < state.board[0].length; c++) {
            if (state.board[r][c].isActive && !state.board[r][c].isPreset && state.board[r][c].currentValue === null) {
              nextSelectedCell = { row: r, col: c };
              break;
            }
          }
          if (nextSelectedCell) break;
        }
      }

      dispatch({
        type: "PLACE_TILE",
        payload: {
          row: state.selectedCell.row,
          col: state.selectedCell.col,
          cellKey,
          value: tile.value,
          tileId,
          prevTileId,
          filledCount,
          nextSelectedCell
        }
      });
    },
    [state.board, state.charTiles, state.selectedCell, state.phase, dispatch]
  );

  const onDeleteCell = useCallback(() => {
    if ((state.phase !== "playing" && state.phase !== "checking") || !state.selectedCell) return;
    const cell = state.board[state.selectedCell.row][state.selectedCell.col];
    if (cell.isPreset || cell.currentValue === null) return;
    const cellKey = getCellKey(state.selectedCell.row, state.selectedCell.col);
    const newBoard = state.board.map((r) => r.map((c) => ({ ...c })));
    newBoard[state.selectedCell.row][state.selectedCell.col].currentValue = null;
    dispatch({ type: "DELETE_CELL", payload: { cellKey, filledCount: countFilledCells(newBoard) } });
  }, [state.board, state.selectedCell, state.phase, dispatch]);

  const onClearAll = useCallback(() => {
    if (state.phase !== "playing" && state.phase !== "checking") return;
    const newBoard = state.board.map((r) =>
      r.map((c) => ({
        ...c,
        currentValue: c.isActive && !c.isPreset ? null : c.currentValue
      }))
    );
    dispatch({ type: "CLEAR_ALL", payload: { filledCount: countFilledCells(newBoard) } });
  }, [state.board, state.phase, dispatch]);

  const doCheck = useCallback(() => {
    const currentBoard = boardRef.current;
    if (state.phase !== "playing" || !isBoardComplete(currentBoard)) return;
    if (isBoardCorrect(currentBoard)) {
      dispatch({ type: "SET_COMPLETE" });
    } else {
      const wrong = getWrongCells(currentBoard);
      dispatch({ type: "SET_CHECKING", payload: { wrongCells: new Set(wrong.map((w) => getCellKey(w.row, w.col))) } });
    }
  }, [state.phase, boardRef, dispatch]);

  useEffect(() => {
    if (state.phase === "playing" && isBoardComplete(boardRef.current)) {
      doCheck();
    }
  }, [state.filledCount, state.phase, doCheck, boardRef]);

  useEffect(() => {
    if (state.phase === "checking" && state.wrongCells.size === 0 && isBoardComplete(boardRef.current)) {
      if (isBoardCorrect(boardRef.current)) {
        dispatch({ type: "SET_COMPLETE" });
      } else {
        dispatch({ type: "SET_PLAYING" });
      }
    }
  }, [state.wrongCells, state.phase, boardRef, dispatch]);

  useEffect(() => {
    if (!db || db.entries.length === 0) return;
    if (lastInitialLoadKeyRef.current === initialLoadKey) return;
    lastInitialLoadKeyRef.current = initialLoadKey;
    loadLevel(1, initialSeed ?? undefined);
  }, [db, initialLoadKey, initialSeed, loadLevel]);

  const goToNextLevel = useCallback(() => {
    loadLevel(state.levelNumber + 1);
  }, [loadLevel, state.levelNumber]);
  const onNextLevel = goToNextLevel;
  const onSkipLevel = goToNextLevel;
  const onRestart = useCallback(() => {
    const cachedSeed = lastSeedRef.current;
    if (cachedSeed !== null) {
      loadLevel(state.levelNumber, cachedSeed);
    } else {
      loadLevel(state.levelNumber);
    }
  }, [state.levelNumber, loadLevel, lastSeedRef]);
  const onToggleHint = useCallback(() => dispatch({ type: "TOGGLE_HINT" }), [dispatch]);
  const onRevealAnswer = useCallback(() => dispatch({ type: "REVEAL_ANSWER" }), [dispatch]);
  const onHideAnswer = useCallback(() => dispatch({ type: "HIDE_ANSWER" }), [dispatch]);

  const canDeleteCell =
    state.selectedCell !== null &&
    (state.phase === "playing" || state.phase === "checking") &&
    state.board[state.selectedCell.row]?.[state.selectedCell.col]?.currentValue !== null &&
    !state.board[state.selectedCell.row]?.[state.selectedCell.col]?.isPreset;

  return {
    level: state.level,
    board: state.board,
    charTiles: state.charTiles,
    selectedCell: state.selectedCell,
    selectedDirection,
    selectedWord,
    highlightedCellKeys,
    levelNumber: state.levelNumber,
    phase: state.phase,
    wrongCells: state.wrongCells,
    filledCount: state.filledCount,
    totalActive: state.totalActive,
    hintVisible: state.hintVisible,
    answerVisible: state.answerVisible,
    canDeleteCell,
    onCellClick,
    onTileClick,
    onDeleteCell,
    onClearAll,
    onNextLevel,
    onSkipLevel,
    onRestart,
    onToggleHint,
    onRevealAnswer,
    onHideAnswer
  };
}
