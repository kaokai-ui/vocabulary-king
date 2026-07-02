// Word-chain puzzle configuration.
// Ported from IdiomKing's 成語接龍 (random mode) and tuned for English words,
// which are longer than 4-character idioms, so we place fewer words per board.

const DEFAULT_BOARD = {
  maxRows: 12,
  maxCols: 12,
  maxAttempts: 100
};

const VIEWPORT_GUARD = {
  minCellPx: 30,
  gapPx: 2,
  boardPadPx: 6,
  boardBorderPx: 1,
  pagePadPx: 8,
  minViewportWidth: 360,
  safeBoardHeight: 320,
  maxCharBankTiles: 22
};

export const CHAIN_CONFIG = {
  viewportGuard: VIEWPORT_GUARD,
  // Only single alphabetic words within this length window are eligible so the
  // crossword stays readable and the tile bank fits on a phone screen.
  wordMinLength: 3,
  wordMaxLength: 7,
  random: {
    ...DEFAULT_BOARD,
    levelRetryCount: 2,
    generatorAttempts: 6,
    seedStep: 97,
    wordCountMin: 4,
    wordCountRange: 3
  }
};
