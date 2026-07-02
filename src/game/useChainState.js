import { useReducer, useRef, useEffect, useCallback } from "react";
import { buildBoardFromLevel, createCharTiles, countActiveCells, countFilledCells } from "./boardUtils";

// Reducer + level-loading orchestration, ported from
// IdiomKing/src/game/useChainState.ts. The word-chain DB is synchronous (built
// from already-loaded vocabulary), so the idiomDb readiness gate is dropped.

const initialState = {
  level: null,
  currentSeed: null,
  board: [],
  charTiles: [],
  selectedCell: null,
  levelNumber: 1,
  phase: "generating",
  wrongCells: new Set(),
  filledCount: 0,
  totalActive: 0,
  hintVisible: false,
  answerVisible: false
};

function chainReducer(state, action) {
  switch (action.type) {
    case "START_GENERATING":
      return {
        ...state,
        phase: "generating",
        currentSeed: null,
        wrongCells: new Set(),
        hintVisible: false,
        answerVisible: false
      };

    case "GENERATE_ERROR":
      return { ...state, phase: "error", currentSeed: null };

    case "LEVEL_LOADED":
      return {
        ...state,
        level: action.payload.level,
        currentSeed: action.payload.seed,
        board: action.payload.board,
        charTiles: action.payload.charTiles,
        selectedCell: null,
        levelNumber: action.payload.levelNumber,
        filledCount: action.payload.filledCount,
        totalActive: action.payload.totalActive,
        phase: "playing",
        wrongCells: new Set(),
        hintVisible: false,
        answerVisible: false
      };

    case "SELECT_CELL":
      return { ...state, selectedCell: action.payload };

    case "PLACE_TILE": {
      const { row, col, cellKey, value, tileId, prevTileId, filledCount, nextSelectedCell } = action.payload;
      const newBoard = state.board.map((r) => r.map((c) => ({ ...c })));
      newBoard[row][col].currentValue = value;

      let newTiles = state.charTiles.map((t) => (t.id === tileId ? { ...t, used: true, cellRef: cellKey } : t));
      if (prevTileId) {
        newTiles = newTiles.map((t) => (t.id === prevTileId ? { ...t, used: false, cellRef: null } : t));
      }

      const newWrongCells = new Set(state.wrongCells);
      newWrongCells.delete(cellKey);

      return {
        ...state,
        board: newBoard,
        charTiles: newTiles,
        filledCount,
        selectedCell: nextSelectedCell,
        wrongCells: newWrongCells
      };
    }

    case "DELETE_CELL": {
      const { cellKey, filledCount } = action.payload;
      const sel = state.selectedCell;
      const newBoard = state.board.map((r) => r.map((c) => ({ ...c })));
      if (sel) {
        newBoard[sel.row][sel.col].currentValue = null;
      }
      const newTiles = state.charTiles.map((t) => (t.cellRef === cellKey ? { ...t, used: false, cellRef: null } : t));
      const newWrongCells = new Set(state.wrongCells);
      newWrongCells.delete(cellKey);
      return {
        ...state,
        board: newBoard,
        charTiles: newTiles,
        filledCount,
        wrongCells: newWrongCells
      };
    }

    case "CLEAR_ALL": {
      const { filledCount } = action.payload;
      const newBoard = state.board.map((r) =>
        r.map((c) => ({
          ...c,
          currentValue: c.isActive && !c.isPreset ? null : c.currentValue
        }))
      );
      const newTiles = state.charTiles.map((t) => ({ ...t, used: false, cellRef: null }));
      return {
        ...state,
        board: newBoard,
        charTiles: newTiles,
        filledCount,
        selectedCell: null,
        wrongCells: new Set()
      };
    }

    case "SET_CHECKING":
      return { ...state, phase: "checking", wrongCells: action.payload.wrongCells };

    case "SET_COMPLETE":
      return { ...state, phase: "complete" };

    case "SET_PLAYING":
      return { ...state, phase: "playing" };

    case "TOGGLE_HINT":
      return { ...state, hintVisible: !state.hintVisible, answerVisible: false };

    case "REVEAL_ANSWER":
      return { ...state, answerVisible: true };

    default:
      return state;
  }
}

export function useChainState(getLevelData, options = {}) {
  const [state, dispatch] = useReducer(chainReducer, initialState);
  const boardRef = useRef([]);
  useEffect(() => {
    boardRef.current = state.board;
  }, [state.board]);
  const { maxNullLevelRetries = 0 } = options;
  const lastSeedRef = useRef(null);

  const loadLevel = useCallback(
    (lvl, seed) => {
      dispatch({ type: "START_GENERATING" });
      const tryLoadLevel = (nullRetryCount) => {
        const doGenerate = () => {
          const result = getLevelData(lvl, seed);
          if (!result.level) {
            if (nullRetryCount < maxNullLevelRetries) {
              requestAnimationFrame(() => {
                tryLoadLevel(nullRetryCount + 1);
              });
              return;
            }
            dispatch({ type: "GENERATE_ERROR" });
            return;
          }
          lastSeedRef.current = result.seed;
          const newBoard = buildBoardFromLevel(result.level);
          const newTiles = createCharTiles(result.level.charBank);
          dispatch({
            type: "LEVEL_LOADED",
            payload: {
              level: result.level,
              board: newBoard,
              charTiles: newTiles,
              levelNumber: lvl,
              filledCount: countFilledCells(newBoard),
              totalActive: countActiveCells(newBoard),
              seed: result.seed
            }
          });
        };
        requestAnimationFrame(doGenerate);
      };
      tryLoadLevel(0);
    },
    [getLevelData, maxNullLevelRetries]
  );

  return { state, dispatch, boardRef, loadLevel, lastSeedRef };
}
