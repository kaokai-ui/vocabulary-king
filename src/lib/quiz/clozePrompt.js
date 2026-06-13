function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractEnglishPrompt(example) {
  const text = String(example ?? "").trim();

  if (!text) {
    return "";
  }

  const chineseParenIndex = text.search(/\s*[\(（][\u4e00-\u9fff]/);

  if (chineseParenIndex > 0) {
    return text.slice(0, chineseParenIndex).trim();
  }

  return text;
}

export function buildWholeWordPattern(word) {
  const normalizedWord = String(word ?? "").trim();

  if (!normalizedWord || normalizedWord.includes("/")) {
    return null;
  }

  const escaped = escapeRegex(normalizedWord).replace(/\\\s+/g, "\\s+");
  return new RegExp(`(?<![A-Za-z])${escaped}(?![A-Za-z])`, "i");
}

export function createClozePrompt(word, example) {
  const englishPrompt = extractEnglishPrompt(example);
  const pattern = buildWholeWordPattern(word);

  if (!englishPrompt || !pattern) {
    return null;
  }

  if (!pattern.test(englishPrompt)) {
    return null;
  }

  return englishPrompt.replace(pattern, "____");
}
