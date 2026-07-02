// Builds the word-chain database from the active vocabulary track.
// This plays the role idiomDb played in IdiomKing, except the source is the
// currently selected difficulty's vocabulary rather than a fixed idiom list.

import { CHAIN_CONFIG } from "./chainConfig";
import { generateRandomChainLevelWithSeed } from "./chainLevelSources";

// A word entry: { id, text, chars: string[], meaning, example }
// - text: original word for display / answer reveal
// - chars: uppercase letters used for board placement and crossings

function mergeMeaning(existing, incoming) {
  const next = (incoming ?? "").trim();
  if (!next) return existing;
  if (!existing) return next;
  // Same spelling, different sense (homographs like lead/lead, tear/tear):
  // keep both meanings so the hint never silently drops one.
  return existing.includes(next) ? existing : `${existing}；${next}`;
}

export function buildWordChainDb(vocabulary) {
  const entries = [];
  const indexByLetters = new Map();
  const { wordMinLength, wordMaxLength } = CHAIN_CONFIG;

  for (const word of vocabulary ?? []) {
    const raw = (word?.word ?? "").trim();
    const letters = raw.toUpperCase();

    // Only accept a single, purely alphabetic word within the length window.
    // Skips entries like "a/an", "according to", or hyphenated forms so the
    // crossword grid stays clean.
    if (!/^[A-Z]+$/.test(letters)) continue;
    if (letters.length < wordMinLength || letters.length > wordMaxLength) continue;

    const existingIndex = indexByLetters.get(letters);
    if (existingIndex !== undefined) {
      const existingEntry = entries[existingIndex];
      existingEntry.meaning = mergeMeaning(existingEntry.meaning, word.meaning);
      continue;
    }

    indexByLetters.set(letters, entries.length);
    entries.push({
      id: word.id,
      text: raw,
      chars: letters.split(""),
      meaning: (word.meaning ?? "").trim(),
      example: word.example ?? ""
    });
  }

  const charIndex = new Map();
  entries.forEach((entry, index) => {
    const seen = new Set();
    for (const ch of entry.chars) {
      if (seen.has(ch)) continue;
      seen.add(ch);
      let arr = charIndex.get(ch);
      if (!arr) {
        arr = [];
        charIndex.set(ch, arr);
      }
      arr.push(index);
    }
  });

  const entriesById = Object.fromEntries(entries.map((entry) => [entry.id, entry]));

  return { entries, charIndex, entriesById };
}

export function isWordChainDbPlayable(db) {
  // Cheap upper-bound reject first, then confirm the pool can actually produce a
  // level (a deterministic trial generation) rather than trusting a magic count.
  if (!db || db.entries.length < CHAIN_CONFIG.random.wordCountMin) return false;
  return generateRandomChainLevelWithSeed(1, db, 1) != null;
}
