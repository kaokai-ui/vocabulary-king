// Board helpers, ported from IdiomKing/src/game/boardUtils.ts.
// A "word" here plays the role an idiom played in the original game.

export function buildBoardFromLevel(level) {
  const presetSet = new Set(level.presetCells.map((p) => `${p.row},${p.col}`));
  const board = Array.from({ length: level.rows }, (_, r) =>
    Array.from({ length: level.cols }, (_, c) => {
      const key = `${r},${c}`;
      const isPreset = presetSet.has(key);
      const presetCell = isPreset ? level.presetCells.find((p) => p.row === r && p.col === c) : undefined;
      return {
        row: r,
        col: c,
        isActive: false,
        answer: "",
        currentValue: isPreset && presetCell ? presetCell.char : null,
        wordIds: [],
        isPreset
      };
    })
  );

  for (const word of level.words) {
    for (let i = 0; i < word.chars.length; i++) {
      const r = word.direction === "vertical" ? word.startRow + i : word.startRow;
      const c = word.direction === "horizontal" ? word.startCol + i : word.startCol;
      const cell = board[r][c];
      cell.isActive = true;
      cell.answer = word.chars[i];
      if (!cell.wordIds.includes(word.id)) {
        cell.wordIds.push(word.id);
      }
    }
  }
  return board;
}

export function createCharTiles(charBank) {
  return charBank.map((char, index) => ({
    id: `tile_${index}`,
    value: char,
    used: false,
    cellRef: null
  }));
}

export function isBoardComplete(board) {
  for (const row of board) {
    for (const cell of row) {
      if (cell.isActive && cell.currentValue === null) return false;
    }
  }
  return true;
}

export function isBoardCorrect(board) {
  for (const row of board) {
    for (const cell of row) {
      if (cell.isActive && cell.currentValue !== cell.answer) return false;
    }
  }
  return true;
}

export function countFilledCells(board) {
  let count = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell.isActive && cell.currentValue !== null) count++;
    }
  }
  return count;
}

export function countActiveCells(board) {
  let count = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell.isActive) count++;
    }
  }
  return count;
}

export function getWrongCells(board) {
  const wrong = [];
  for (const row of board) {
    for (const cell of row) {
      if (cell.isActive && cell.currentValue !== null && cell.currentValue !== cell.answer) {
        wrong.push({ row: cell.row, col: cell.col });
      }
    }
  }
  return wrong;
}

export function getCellKey(row, col) {
  return `${row}-${col}`;
}

export function findTileByCellRef(tiles, cellKey) {
  return tiles.find((t) => t.cellRef === cellKey);
}
