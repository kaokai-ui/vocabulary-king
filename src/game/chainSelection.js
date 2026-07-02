// Selection / direction helpers, ported from
// IdiomKing/src/game/chainSelection.ts. Operates on placed words.

export function wordOccupiesCell(word, row, col) {
  for (let index = 0; index < word.chars.length; index++) {
    const cellRow = word.direction === "vertical" ? word.startRow + index : word.startRow;
    const cellCol = word.direction === "horizontal" ? word.startCol + index : word.startCol;
    if (cellRow === row && cellCol === col) {
      return true;
    }
  }
  return false;
}

export function getWordsAtCell(words, row, col) {
  return words.filter((word) => wordOccupiesCell(word, row, col));
}

export function getDefaultDirectionForCell(words) {
  if (words.length === 0) return null;
  const horizontal = words.find((word) => word.direction === "horizontal");
  return horizontal?.direction ?? words[0].direction;
}

export function getWordForDirection(words, direction) {
  if (!direction) return null;
  return words.find((word) => word.direction === direction) ?? null;
}

export function buildHighlightedCellKeys(word) {
  if (!word) return new Set();
  const keys = new Set();
  for (let index = 0; index < word.chars.length; index++) {
    const row = word.direction === "vertical" ? word.startRow + index : word.startRow;
    const col = word.direction === "horizontal" ? word.startCol + index : word.startCol;
    keys.add(`${row}-${col}`);
  }
  return keys;
}
