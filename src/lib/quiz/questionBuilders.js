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

const questionBuilders = {
  [QUIZ_MODES.meaningChoice]: buildMeaningChoiceQuestion
};

export function buildQuizQuestions(vocabulary, { count, mode = QUIZ_MODES.meaningChoice } = {}) {
  const builder = questionBuilders[mode];

  if (!builder) {
    throw new Error(`Unsupported quiz mode: ${mode}`);
  }

  const selectedWords = sample(vocabulary, Math.min(count, vocabulary.length));

  return selectedWords.map((word) => builder(word, vocabulary));
}
