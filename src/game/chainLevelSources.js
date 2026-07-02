// Seeded level sourcing, ported from IdiomKing/src/game/chainLevelSources.ts.
// The seed is captured so "restart" reproduces the exact same puzzle.

import { createSeededRandom } from "./chainRandom";
import { generateLevel } from "./levelGenerator";
import { CHAIN_CONFIG } from "./chainConfig";

function generateSeededChainLevel(levelNumber, db, seedBase, maxRows, maxCols, maxAttempts) {
  for (let attempt = 0; attempt < CHAIN_CONFIG.random.generatorAttempts; attempt++) {
    const seed = seedBase + attempt * CHAIN_CONFIG.random.seedStep;
    const random = createSeededRandom(seed);
    const wordCount = CHAIN_CONFIG.random.wordCountMin + Math.floor(random() * CHAIN_CONFIG.random.wordCountRange);
    const level = generateLevel(levelNumber, db.entries, db.charIndex, wordCount, maxRows, maxCols, maxAttempts, random);
    if (level) {
      return { level, seed: seedBase };
    }
  }
  return null;
}

export function generateRandomChainLevelWithSeed(levelNumber, db, seed) {
  const actualSeed = seed ?? Date.now() + levelNumber * 15485863 + Math.floor(Math.random() * 1000000);
  return generateSeededChainLevel(
    levelNumber,
    db,
    actualSeed,
    CHAIN_CONFIG.random.maxRows,
    CHAIN_CONFIG.random.maxCols,
    CHAIN_CONFIG.random.maxAttempts
  );
}
