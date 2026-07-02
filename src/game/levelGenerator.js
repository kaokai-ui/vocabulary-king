// Crossword-style level generator, ported from
// IdiomKing/src/game/levelGenerator.ts. Language-agnostic: it works on any list
// of entries shaped { id, text, chars } plus a char -> entryIndex map, so we
// feed it English words here instead of idioms.

import { shuffle } from "./chainRandom";
import { CHAIN_CONFIG } from "./chainConfig";

export function isBoardViewportSafe(rows, cols) {
  const { minCellPx, gapPx, boardPadPx, boardBorderPx, pagePadPx, minViewportWidth, safeBoardHeight } =
    CHAIN_CONFIG.viewportGuard;

  const containerW = Math.max(minViewportWidth - pagePadPx * 2, 0);
  const containerH = Math.max(safeBoardHeight, 0);
  const innerW = containerW - boardBorderPx * 2 - boardPadPx * 2 - gapPx * (cols - 1);
  const innerH = containerH - boardBorderPx * 2 - boardPadPx * 2 - gapPx * (rows - 1);
  const projectedCellSize = Math.min(innerW / cols, innerH / rows);

  return Number.isFinite(projectedCellSize) && projectedCellSize >= minCellPx;
}

export function isCharBankViewportSafe(charBankCount) {
  return charBankCount <= CHAIN_CONFIG.viewportGuard.maxCharBankTiles;
}

function createEmptyBoard(rows, cols) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
}

function canPlaceWord(board, word, direction, startRow, startCol, rows, cols) {
  for (let i = 0; i < word.chars.length; i++) {
    const r = direction === "vertical" ? startRow + i : startRow;
    const c = direction === "horizontal" ? startCol + i : startCol;
    if (r < 0 || r >= rows || c < 0 || c >= cols) return false;
    const existing = board[r][c];
    if (existing !== null) {
      if (existing.char !== word.chars[i]) return false;
    } else {
      if (direction === "horizontal") {
        if (r > 0 && board[r - 1][c] !== null) return false;
        if (r < rows - 1 && board[r + 1][c] !== null) return false;
      } else {
        if (c > 0 && board[r][c - 1] !== null) return false;
        if (c < cols - 1 && board[r][c + 1] !== null) return false;
      }
    }
  }
  if (direction === "horizontal") {
    const beforeC = startCol - 1;
    if (beforeC >= 0 && board[startRow][beforeC] !== null) return false;
    const afterC = startCol + word.chars.length;
    if (afterC < cols && board[startRow][afterC] !== null) return false;
  } else {
    const beforeR = startRow - 1;
    if (beforeR >= 0 && board[beforeR][startCol] !== null) return false;
    const afterR = startRow + word.chars.length;
    if (afterR < rows && board[afterR][startCol] !== null) return false;
  }
  return true;
}

function placeWordOnBoard(board, word, direction, startRow, startCol) {
  for (let i = 0; i < word.chars.length; i++) {
    const r = direction === "vertical" ? startRow + i : startRow;
    const c = direction === "horizontal" ? startCol + i : startCol;
    const existing = board[r][c];
    if (existing) {
      existing.wordIds.push(word.id);
    } else {
      board[r][c] = { char: word.chars[i], wordIds: [word.id] };
    }
  }
}

function getCandidateWordIndices(board, rows, cols, charIndex) {
  const candidateSet = new Set();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = board[r][c];
      if (cell === null) continue;
      const indices = charIndex.get(cell.char);
      if (indices) {
        for (const idx of indices) candidateSet.add(idx);
      }
    }
  }
  return [...candidateSet];
}

function findCrossingPositions(board, word, direction, rows, cols) {
  const positions = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = board[r][c];
      if (cell === null) continue;
      for (let ci = 0; ci < word.chars.length; ci++) {
        if (word.chars[ci] !== cell.char) continue;
        let sr;
        let sc;
        if (direction === "horizontal") {
          sr = r;
          sc = c - ci;
        } else {
          sr = r - ci;
          sc = c;
        }
        if (canPlaceWord(board, word, direction, sr, sc, rows, cols)) {
          positions.push({ startRow: sr, startCol: sc });
        }
      }
    }
  }
  return positions;
}

export function generateLevel(levelId, entries, charIndex, targetCount, maxRows, maxCols, maxAttempts, random = Math.random) {
  if (!entries || entries.length === 0) return null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = tryGenerateLevel(levelId, entries, charIndex, targetCount, maxRows, maxCols, random);
    if (result) return result;
  }
  return null;
}

function tryGenerateLevel(levelId, entries, charIndex, targetCount, maxRows, maxCols, random) {
  const board = createEmptyBoard(maxRows, maxCols);
  const placed = [];
  const usedTexts = new Set();

  const firstWord = entries[Math.floor(random() * entries.length)];
  const startRow = Math.floor(maxRows / 2);
  const startCol = Math.floor((maxCols - firstWord.chars.length) / 2);
  if (startCol < 0) return null;
  const firstDirection = "horizontal";

  placeWordOnBoard(board, firstWord, firstDirection, startRow, startCol);
  placed.push({
    id: firstWord.id,
    text: firstWord.text,
    chars: firstWord.chars,
    direction: firstDirection,
    startRow,
    startCol
  });
  usedTexts.add(firstWord.text);

  for (let iter = 0; iter < targetCount * 10 && placed.length < targetCount; iter++) {
    const lastDirection = placed[placed.length - 1].direction;
    const nextDirection = lastDirection === "horizontal" ? "vertical" : "horizontal";

    const candidateIndices = getCandidateWordIndices(board, maxRows, maxCols, charIndex);
    const shuffledIndices = shuffle(candidateIndices, random);

    let found = false;
    for (const idx of shuffledIndices) {
      const candidate = entries[idx];
      if (usedTexts.has(candidate.text)) continue;
      const positions = findCrossingPositions(board, candidate, nextDirection, maxRows, maxCols);
      if (positions.length > 0) {
        const pos = positions[Math.floor(random() * positions.length)];
        placeWordOnBoard(board, candidate, nextDirection, pos.startRow, pos.startCol);
        placed.push({
          id: candidate.id,
          text: candidate.text,
          chars: candidate.chars,
          direction: nextDirection,
          startRow: pos.startRow,
          startCol: pos.startCol
        });
        usedTexts.add(candidate.text);
        found = true;
        break;
      }
    }
    if (!found) break;
  }

  if (placed.length < targetCount) return null;

  let minR = maxRows;
  let maxR = 0;
  let minC = maxCols;
  let maxC = 0;
  for (let r = 0; r < maxRows; r++) {
    for (let c = 0; c < maxCols; c++) {
      if (board[r][c] !== null) {
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
        minC = Math.min(minC, c);
        maxC = Math.max(maxC, c);
      }
    }
  }

  const rows = maxR - minR + 1;
  const cols = maxC - minC + 1;

  if (!isBoardViewportSafe(rows, cols)) return null;

  const adjustedPlaced = placed.map((p) => ({
    ...p,
    startRow: p.startRow - minR,
    startCol: p.startCol - minC
  }));

  const trimmedBoard = createEmptyBoard(rows, cols);
  const cellWordCounts = new Map();

  for (const p of adjustedPlaced) {
    for (let i = 0; i < p.chars.length; i++) {
      const r = p.direction === "vertical" ? p.startRow + i : p.startRow;
      const c = p.direction === "horizontal" ? p.startCol + i : p.startCol;
      const existing = trimmedBoard[r][c];
      if (!existing) {
        trimmedBoard[r][c] = { char: p.chars[i], wordIds: [p.id] };
      } else {
        existing.wordIds.push(p.id);
      }
      const key = `${r},${c}`;
      cellWordCounts.set(key, (cellWordCounts.get(key) ?? 0) + 1);
    }
  }

  const crossingCellKeys = [...cellWordCounts.entries()].filter(([, count]) => count > 1).map(([key]) => key);
  const shuffledCrossingKeys = shuffle(crossingCellKeys, random);
  const presetCount = Math.min(Math.max(2, Math.floor(adjustedPlaced.length * 0.4)), 3, crossingCellKeys.length);
  const presetCells = [];
  const presetSet = new Set();
  for (let i = 0; i < presetCount; i++) {
    const [rStr, cStr] = shuffledCrossingKeys[i].split(",");
    const r = Number(rStr);
    const c = Number(cStr);
    const cell = trimmedBoard[r][c];
    if (cell) {
      presetCells.push({ row: r, col: c, char: cell.char });
      presetSet.add(shuffledCrossingKeys[i]);
    }
  }

  const charBank = [];
  const charBankKeys = new Set();
  for (const p of adjustedPlaced) {
    for (let i = 0; i < p.chars.length; i++) {
      const r = p.direction === "vertical" ? p.startRow + i : p.startRow;
      const c = p.direction === "horizontal" ? p.startCol + i : p.startCol;
      const key = `${r},${c}`;
      if (!presetSet.has(key) && !charBankKeys.has(key)) {
        charBank.push(p.chars[i]);
        charBankKeys.add(key);
      }
    }
  }

  if (!isCharBankViewportSafe(charBank.length)) return null;

  return { id: levelId, rows, cols, words: adjustedPlaced, charBank: shuffle(charBank, random), presetCells };
}
