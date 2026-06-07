export function slugifyVocabularyPart(text, maxLength = 48) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
}

function hashVocabularyPart(text) {
  const input = String(text ?? "");
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}

export function buildStableVocabularyId(level, word, meaning) {
  const wordSlug = slugifyVocabularyPart(word, 32) || "word";
  const meaningSlug = slugifyVocabularyPart(meaning, 24);
  const meaningKey = meaningSlug || `m${hashVocabularyPart(meaning)}`;

  return `${level}-${wordSlug}-${meaningKey}`;
}

export function buildDisambiguatedVocabularyId(level, word, meaning, example) {
  const baseId = buildStableVocabularyId(level, word, meaning);
  const exampleKey = slugifyVocabularyPart(example, 18) || `e${hashVocabularyPart(example)}`;

  return `${baseId}-${exampleKey}`;
}

export function buildLegacyVocabularyId(level, rowIndex, word) {
  const wordSlug = slugifyVocabularyPart(word) || "word";

  return `${level}-${rowIndex + 1}-${wordSlug}`;
}

export function extractLegacyVocabularySignature(id) {
  const match = /^(L\d+)-\d+-([a-z0-9-]+)$/.exec(String(id ?? ""));

  if (!match) {
    return null;
  }

  return {
    level: match[1],
    wordSlug: match[2]
  };
}
