export const QUIZ_MODES = {
  meaningChoice: "meaning-choice",
  clozeChoice: "cloze-choice"
};

function shuffle(items) {
  const next = [...items];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next;
}

function sample(items, count) {
  return shuffle(items).slice(0, count);
}

function normalizeOptionText(text) {
  return String(text ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function buildChoiceId(prefix, text, index) {
  return `${prefix}-${normalizeOptionText(text).replace(/[^a-z0-9]+/g, "-") || "choice"}-${index}`;
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractEnglishPrompt(example) {
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

function buildWholeWordPattern(word) {
  const normalizedWord = String(word ?? "").trim();

  if (!normalizedWord || normalizedWord.includes("/")) {
    return null;
  }

  const escaped = escapeRegex(normalizedWord).replace(/\\\s+/g, "\\s+");
  return new RegExp(`(?<![A-Za-z])${escaped}(?![A-Za-z])`, "i");
}

function createClozePrompt(word, example) {
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

function buildUniqueMeaningChoices(correctWord, vocabulary, choiceCount = 4) {
  const seenMeanings = new Set([normalizeOptionText(correctWord.meaning)]);
  const uniqueDistractors = [];

  for (const candidate of shuffle(vocabulary)) {
    if (candidate.id === correctWord.id) {
      continue;
    }

    const normalizedMeaning = normalizeOptionText(candidate.meaning);

    if (!normalizedMeaning || seenMeanings.has(normalizedMeaning)) {
      continue;
    }

    seenMeanings.add(normalizedMeaning);
    uniqueDistractors.push(candidate.meaning);

    if (uniqueDistractors.length >= choiceCount - 1) {
      break;
    }
  }

  const optionTexts = shuffle([correctWord.meaning, ...uniqueDistractors]);

  return optionTexts.map((text, index) => ({
    id: buildChoiceId(correctWord.id, text, index),
    text
  }));
}

function buildUniqueWordChoices(correctWord, vocabulary, choiceCount = 4) {
  const sameLevelPool = vocabulary.filter((candidate) => candidate.level === correctWord.level);
  const fallbackPool = vocabulary;
  const pools = [sameLevelPool, fallbackPool];
  const seenWords = new Set([normalizeOptionText(correctWord.word)]);
  const distractors = [];

  for (const pool of pools) {
    for (const candidate of shuffle(pool)) {
      if (candidate.id === correctWord.id) {
        continue;
      }

      const normalizedWord = normalizeOptionText(candidate.word);

      if (!normalizedWord || seenWords.has(normalizedWord)) {
        continue;
      }

      seenWords.add(normalizedWord);
      distractors.push(candidate.word);

      if (distractors.length >= choiceCount - 1) {
        break;
      }
    }

    if (distractors.length >= choiceCount - 1) {
      break;
    }
  }

  if (distractors.length < choiceCount - 1) {
    return null;
  }

  const optionTexts = shuffle([correctWord.word, ...distractors]);

  return optionTexts.map((text, index) => ({
    id: buildChoiceId(correctWord.id, text, index),
    text
  }));
}

function buildMeaningChoiceQuestion(word, vocabulary) {
  const choices = buildUniqueMeaningChoices(word, vocabulary);
  const correctChoice = choices.find((choice) => normalizeOptionText(choice.text) === normalizeOptionText(word.meaning));

  return {
    id: `${QUIZ_MODES.meaningChoice}:${word.id}`,
    type: QUIZ_MODES.meaningChoice,
    wordId: word.id,
    prompt: word.word,
    promptKind: "word",
    promptVoice: word.word,
    level: word.level,
    example: word.example,
    choices,
    correctChoiceId: correctChoice?.id ?? null,
    answerWord: word.word,
    correctText: word.meaning,
    reviewPrompt: word.word
  };
}

function buildClozeChoiceQuestion(word, vocabulary) {
  const prompt = createClozePrompt(word.word, word.example);
  const choices = buildUniqueWordChoices(word, vocabulary);

  if (!prompt || !choices) {
    return null;
  }

  const correctChoice = choices.find((choice) => normalizeOptionText(choice.text) === normalizeOptionText(word.word));

  return {
    id: `${QUIZ_MODES.clozeChoice}:${word.id}`,
    type: QUIZ_MODES.clozeChoice,
    wordId: word.id,
    prompt,
    promptKind: "cloze",
    promptVoice: word.word,
    level: word.level,
    example: word.example,
    choices,
    correctChoiceId: correctChoice?.id ?? null,
    answerWord: word.word,
    correctText: word.word,
    reviewPrompt: prompt
  };
}

const questionBuilders = {
  [QUIZ_MODES.meaningChoice]: buildMeaningChoiceQuestion,
  [QUIZ_MODES.clozeChoice]: buildClozeChoiceQuestion
};

export function buildQuizQuestions(vocabulary, { count, mode = QUIZ_MODES.meaningChoice } = {}) {
  const builder = questionBuilders[mode];

  if (!builder) {
    throw new Error(`Unsupported quiz mode: ${mode}`);
  }

  const selectedWords = sample(vocabulary, vocabulary.length);
  const questions = [];

  for (const word of selectedWords) {
    const question = builder(word, vocabulary);

    if (!question) {
      continue;
    }

    questions.push(question);

    if (questions.length >= Math.min(count, vocabulary.length)) {
      break;
    }
  }

  return questions;
}
