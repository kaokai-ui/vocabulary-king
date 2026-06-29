function normalizeSearchText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function extractWordVariants(word) {
  return String(word ?? "")
    .toLowerCase()
    .split("/")
    .map((variant) => variant.trim())
    .filter(Boolean);
}

function dedupeSearchResults(results) {
  const bestBySignature = new Map();

  for (const word of results) {
    const normalizedWord = normalizeSearchText(word.word);
    const normalizedLevel = normalizeSearchText(word.level);
    const normalizedExample = normalizeSearchText(word.example);
    const normalizedMeaning = normalizeSearchText(word.meaning);
    const signature = normalizedExample
      ? [normalizedWord, normalizedLevel, normalizedExample].join("\u0000")
      : [normalizedWord, normalizedLevel, normalizedMeaning].join("\u0000");
    const previous = bestBySignature.get(signature);

    if (!previous) {
      bestBySignature.set(signature, word);
      continue;
    }

    const previousMeaning = normalizeSearchText(previous.meaning);
    const shouldReplace =
      normalizedMeaning.length > previousMeaning.length ||
      (normalizedMeaning.length === previousMeaning.length && String(word.id ?? "").length < String(previous.id ?? "").length);

    if (shouldReplace) {
      bestBySignature.set(signature, word);
    }
  }

  return Array.from(bestBySignature.values());
}

export function searchVocabulary(vocabulary, query) {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return [];
  }

  const exactWordMatches = [];
  const prefixWordMatches = [];
  const meaningMatches = [];

  for (const word of vocabulary ?? []) {
    const variants = extractWordVariants(word.word);
    const normalizedMeaning = normalizeSearchText(word.meaning);

    if (variants.some((variant) => variant === normalizedQuery)) {
      exactWordMatches.push(word);
      continue;
    }

    if (variants.some((variant) => variant.startsWith(normalizedQuery))) {
      prefixWordMatches.push(word);
      continue;
    }

    if (normalizedMeaning.includes(normalizedQuery)) {
      meaningMatches.push(word);
    }
  }

  if (exactWordMatches.length > 0) {
    return dedupeSearchResults([...exactWordMatches, ...prefixWordMatches]);
  }

  if (prefixWordMatches.length > 0) {
    return dedupeSearchResults(prefixWordMatches);
  }

  return dedupeSearchResults(meaningMatches);
}
