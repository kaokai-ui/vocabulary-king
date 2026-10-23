import {
  IRREGULAR_COMPARISON_FORMS,
  IRREGULAR_NOUN_FORMS,
  IRREGULAR_VERB_FORMS
} from "./vocabulary-inflection-data.mjs";

const HYPHEN_BOUNDARY_TOKEN = "__hyphen__";
const PUNCTUATION_BOUNDARY_TOKEN = "__punctuation__";
const SLOT_ANY = "__slot_any__";
const SLOT_POSSESSIVE = "__slot_possessive__";
const SLOT_REFLEXIVE = "__slot_reflexive__";
const SLOT_ING = "__slot_ing__";
const SLOT_VERB = "__slot_verb__";
const SLOT_ELLIPSIS = "__slot_ellipsis__";
const SEPARABLE_PHRASAL_PARTICLES = new Set([
  "up", "down", "off", "out", "on", "in", "away", "back", "over",
  "about", "across", "along", "around", "through"
]);
const ARTICLE_DETERMINERS = new Set([
  "a", "an", "the", "this", "that", "these", "those", "my", "your", "his", "her", "its", "our", "their",
  "some", "any", "each", "every", "either", "neither", "one"
]);
const COMMON_PHRASE_MODIFIERS = new Set([
  "almost", "also", "already", "always", "available", "business", "complete", "comprehensive", "complex", "current",
  "entire", "even", "final", "full", "fully", "good", "hardly", "healthy", "heavy", "high", "immediate",
  "independent", "just", "large", "level", "long", "major", "million", "more", "multi", "new", "never", "not",
  "now", "old", "often", "operating", "prime", "private", "quite", "rather", "really", "seasonal", "simply",
  "still", "strong", "strongly", "substantial", "unanimous", "unwieldy", "urgent", "very", "video", "vip", "well",
  "growing"
]);
const POSSESSIVE_PRONOUNS = new Set(["my", "your", "his", "her", "its", "our", "their"]);
const OBJECT_PRONOUNS = new Set(["me", "you", "him", "her", "it", "us", "them"]);
const REFLEXIVE_PRONOUNS = new Set([
  "myself", "yourself", "yourselves", "himself", "herself", "itself", "ourselves", "themselves"
]);
const BE_FORM_SEQUENCES = [
  ["will", "have", "been"], ["would", "have", "been"], ["could", "have", "been"], ["should", "have", "been"],
  ["might", "have", "been"], ["may", "have", "been"], ["must", "have", "been"], ["shall", "have", "been"],
  ["has", "been"], ["have", "been"], ["had", "been"], ["is", "being"], ["are", "being"], ["was", "being"], ["were", "being"],
  ["will", "be"], ["would", "be"], ["could", "be"], ["should", "be"], ["might", "be"], ["may", "be"], ["must", "be"], ["shall", "be"],
  ["am"], ["is"], ["are"], ["was"], ["were"], ["be"], ["been"], ["being"]
];
const NON_INFLECTING_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "as", "at", "by", "for", "from", "in", "into",
  "of", "on", "onto", "to", "with", "without", "about", "across", "along", "around",
  "away", "back", "down", "off", "out", "over", "through", "up"
]);
const DOUBLE_FINAL_CONSONANT = new Set([
  "admit", "begin", "commit", "compel", "control", "defer", "demur", "deter", "embed", "equip", "excel",
  "expel", "forget", "format", "infer", "occur", "permit", "prefer", "propel", "rebel", "refer",
  "regret", "repel", "submit", "transfer", "inter"
]);
const IRREGULAR_THIRD_PERSON = new Map([
  ["have", "has"],
  ["do", "does"],
  ["be", "is"]
]);

function isConsonantY(word) {
  return word.length > 1 && word.endsWith("y") && !/[aeiou]y$/u.test(word);
}

function shouldDoubleFinalConsonant(word) {
  const vowelGroups = word.match(/[aeiou]+/gu) ?? [];
  return DOUBLE_FINAL_CONSONANT.has(word) ||
    (vowelGroups.length === 1 && /^[^aeiou][aeiou][^aeiouwxy]$/u.test(word.slice(-3)));
}

function needsEs(word) {
  if (/(?:s|x|z|ch|sh)$/u.test(word)) return true;
  if (/o$/u.test(word)) return !/^(?:photo|piano|radio|video|zoo|studio|logo|kilo|solo|euro|peso)$/u.test(word);
  return false;
}

function gerundForm(word) {
  if (word.endsWith("ie")) return word.slice(0, -2) + "ying";
  if (word.endsWith("ee") || word.endsWith("ye") || word.endsWith("oe")) return word + "ing";
  if (word.endsWith("e")) return word.slice(0, -1) + "ing";
  if (word.endsWith("c")) return word + "king";
  return word + (shouldDoubleFinalConsonant(word) ? word.slice(-1) : "") + "ing";
}

function thirdPersonForm(word) {
  if (IRREGULAR_THIRD_PERSON.has(word)) return IRREGULAR_THIRD_PERSON.get(word);
  if (isConsonantY(word)) return word.slice(0, -1) + "ies";
  return word + (needsEs(word) ? "es" : "s");
}

function regularInflections(word) {
  const forms = new Set([word]);
  const consonantY = isConsonantY(word);
  const doublesFinal = shouldDoubleFinalConsonant(word);

  forms.add(thirdPersonForm(word));
  forms.add(word.endsWith("e")
    ? word + "d"
    : consonantY
      ? word.slice(0, -1) + "ied"
      : word + (doublesFinal ? word.slice(-1) : "") + "ed");
  forms.add(gerundForm(word));

  if (consonantY) {
    forms.add(word.slice(0, -1) + "ier");
    forms.add(word.slice(0, -1) + "iest");
  } else if (word.endsWith("e")) {
    forms.add(word + "r");
    forms.add(word + "st");
  } else {
    const stem = doublesFinal ? word + word.slice(-1) : word;
    forms.add(stem + "er");
    forms.add(stem + "est");
  }
  return forms;
}

function regularVerbPresentAndGerund(word) {
  return new Set([word, thirdPersonForm(word), gerundForm(word)]);
}

function formsForWord(word) {
  const normalized = String(word).toLocaleLowerCase("en-US");
  if (IRREGULAR_VERB_FORMS.has(normalized)) {
    return new Set([
      ...IRREGULAR_VERB_FORMS.get(normalized),
      ...regularVerbPresentAndGerund(normalized)
    ]);
  }
  if (IRREGULAR_NOUN_FORMS.has(normalized)) {
    return new Set(IRREGULAR_NOUN_FORMS.get(normalized));
  }
  if (IRREGULAR_COMPARISON_FORMS.has(normalized)) {
    return new Set(IRREGULAR_COMPARISON_FORMS.get(normalized));
  }
  return regularInflections(normalized);
}

export function normalizeEnglishTokens(text) {
  return String(text ?? "")
    .replace(/[’‘]/gu, "'")
    .toLocaleLowerCase("en-US")
    .replace(/([a-z])[-‐‑‒–—](?=[a-z])/giu, "$1 " + HYPHEN_BOUNDARY_TOKEN + " ")
    .replace(/[,.!?;:](?=\s*[a-z])/giu, " " + PUNCTUATION_BOUNDARY_TOKEN + " ")
    .replace(/[^\p{L}\p{N}'_\s]/gu, " ")
    .match(/[a-z]+(?:'[a-z]+)?|__hyphen__|__punctuation__/gu) ?? [];
}

function expandSlashAlternatives(text) {
  const slash = text.indexOf("/");
  if (slash < 0) return [text];

  const left = text.slice(0, slash).trim();
  const right = text.slice(slash + 1).trim();
  const leftTokens = left.split(/\s+/u).filter(Boolean);
  const rightTokens = right.split(/\s+/u).filter(Boolean);
  let sharedPrefix = 0;
  while (sharedPrefix < leftTokens.length && sharedPrefix < rightTokens.length &&
    leftTokens[sharedPrefix] === rightTokens[sharedPrefix]) sharedPrefix += 1;
  let sharedSuffix = 0;
  while (sharedSuffix < leftTokens.length - sharedPrefix && sharedSuffix < rightTokens.length - sharedPrefix &&
    leftTokens[leftTokens.length - sharedSuffix - 1] === rightTokens[rightTokens.length - sharedSuffix - 1]) sharedSuffix += 1;

  let alternatives;
  if (sharedPrefix || sharedSuffix) {
    const prefix = leftTokens.slice(0, sharedPrefix);
    const suffix = leftTokens.slice(leftTokens.length - sharedSuffix);
    alternatives = [
      [...prefix, ...leftTokens.slice(sharedPrefix, leftTokens.length - sharedSuffix), ...suffix],
      [...prefix, ...rightTokens.slice(sharedPrefix, rightTokens.length - sharedSuffix), ...suffix]
    ].map((tokens) => tokens.join(" "));
  } else {
    alternatives = [
      [...leftTokens, ...rightTokens.slice(1)].join(" "),
      [...leftTokens.slice(0, -1), ...rightTokens].join(" ")
    ];
  }
  return alternatives.flatMap(expandSlashAlternatives);
}

function expandOptionalParentheses(text) {
  let variants = new Set([text]);
  while (true) {
    let changed = false;
    const next = new Set();
    for (const variant of variants) {
      const match = /\(([^()]+)\)/u.exec(variant);
      if (!match) {
        next.add(variant);
        continue;
      }
      changed = true;
      next.add(variant.slice(0, match.index) + variant.slice(match.index + match[0].length));
      next.add(variant.slice(0, match.index) + match[1] + variant.slice(match.index + match[0].length));
    }
    variants = next;
    if (!changed) return [...variants];
  }
}

function normalizeHeadwordTokens(text) {
  const prepared = String(text ?? "")
    .replace(/[’‘]/gu, "'")
    .replace(/-\s*ing\b/giu, " " + SLOT_ING + " ")
    .replace(/([A-Za-z])[-‐‑‒–—](?=[A-Za-z])/gu, "$1 " + HYPHEN_BOUNDARY_TOKEN + " ");
  const rawTokens = prepared.match(/__slot_ing__|__hyphen__|[A-Za-z]+(?:'[A-Za-z]+)?|\.{3,}/gu) ?? [];
  const phrase = rawTokens.length > 1;

  return rawTokens.map((token, index) => {
    if (token === HYPHEN_BOUNDARY_TOKEN) return token;
    if (token === "A") return "__slot_a__";
    if (token === "B") return "__slot_b__";

    const lower = token.toLocaleLowerCase("en-US");
    if (lower === SLOT_ING) return SLOT_ING;
    if (lower === "..." || lower === "…") return SLOT_ELLIPSIS;
    if (["one's", "someone's", "somebody's", "sb's", "something's", "sth's"].includes(lower)) {
      return SLOT_POSSESSIVE;
    }
    if (lower === "oneself" && phrase) return SLOT_REFLEXIVE;
    if (phrase && ["someone", "somebody", "sb", "something", "sth"].includes(lower)) return SLOT_ANY;
    if (phrase && lower === "do" && rawTokens[index - 1]?.toLocaleLowerCase("en-US") === "to") return SLOT_VERB;
    return lower;
  });
}

function expandHyphenBoundaryVariants(tokens) {
  let variants = [[]];
  for (const token of tokens) {
    if (token === HYPHEN_BOUNDARY_TOKEN) {
      variants = variants.flatMap((variant) => [
        [...variant, HYPHEN_BOUNDARY_TOKEN],
        [...variant]
      ]);
      continue;
    }
    variants = variants.flatMap((variant) => {
      if (!variant.length || variant.at(-1) === HYPHEN_BOUNDARY_TOKEN) return [[...variant, token]];
      return [[...variant, token], [...variant, HYPHEN_BOUNDARY_TOKEN, token]];
    });
  }
  return [...new Map(variants.map((variant) => [variant.join(" "), variant])).values()];
}

function isSlot(token) {
  return token === SLOT_ANY || token === SLOT_POSSESSIVE || token === SLOT_REFLEXIVE ||
    token === SLOT_ING || token === SLOT_VERB || token === SLOT_ELLIPSIS ||
    token === "__slot_a__" || token === "__slot_b__";
}

function makeFormToken(token) {
  if (token === HYPHEN_BOUNDARY_TOKEN) return { kind: "hyphen" };
  if (isSlot(token)) return { kind: "slot", name: token };
  if (token === "be") return { kind: "be" };
  const forms = NON_INFLECTING_WORDS.has(token) ? new Set([token]) : formsForWord(token);
  for (const form of [...forms]) {
    forms.add(`${form}'s`);
    if (form.endsWith("s")) forms.add(`${form}'`);
  }
  if (token === "to") {
    forms.add("toward");
    forms.add("towards");
    forms.add("into");
  }
  return { kind: "word", forms };
}

function compactPhraseForm(tokens) {
  if (tokens.length !== 2 || tokens.some((token) => isSlot(token) || token === HYPHEN_BOUNDARY_TOKEN || token === "be")) {
    return null;
  }
  if (tokens.some((token) => !/^[a-z]+$/u.test(token))) return null;
  return [{ kind: "word", forms: new Set([tokens.join("")]) }];
}

function formsForHeadword(word) {
  const forms = [];
  for (const optionalVariant of expandOptionalParentheses(String(word ?? ""))) {
    for (const slashVariant of expandSlashAlternatives(optionalVariant)) {
      const tokens = normalizeHeadwordTokens(slashVariant);
      if (!tokens.length) continue;

      for (const hyphenVariant of expandHyphenBoundaryVariants(tokens)) {
        forms.push(hyphenVariant.map(makeFormToken));
      }
      const compact = compactPhraseForm(tokens.filter((token) => token !== HYPHEN_BOUNDARY_TOKEN));
      if (compact) forms.push(compact);
    }
  }
  return forms;
}

function placeholderLengths(token, sentenceTokens, sentenceIndex) {
  if (token.name === SLOT_ELLIPSIS) {
    const maximum = Math.min(6, sentenceTokens.length - sentenceIndex);
    return Array.from({ length: maximum + 1 }, (_, index) => index)
      .filter((length) => sentenceTokens.slice(sentenceIndex, sentenceIndex + length)
        .every((candidate) => candidate !== HYPHEN_BOUNDARY_TOKEN && candidate !== PUNCTUATION_BOUNDARY_TOKEN));
  }

  const candidate = sentenceTokens[sentenceIndex];
  if (!candidate || candidate === HYPHEN_BOUNDARY_TOKEN || candidate === PUNCTUATION_BOUNDARY_TOKEN) return [];
  if (token.name === SLOT_POSSESSIVE) {
    const lengths = [];
    if (POSSESSIVE_PRONOUNS.has(candidate) || ARTICLE_DETERMINERS.has(candidate) || /[a-z]+'s$/u.test(candidate)) lengths.push(1);
    if (ARTICLE_DETERMINERS.has(candidate) && /[a-z]+'s$/u.test(sentenceTokens[sentenceIndex + 1] ?? "")) lengths.push(2);
    return lengths;
  }
  if (token.name === SLOT_REFLEXIVE) {
    return REFLEXIVE_PRONOUNS.has(candidate) ? [1] : [];
  }
  if (token.name === SLOT_ING) {
    return /[a-z]+ing$/u.test(candidate) ? [1] : [];
  }
  if (token.name === SLOT_VERB) return [1];

  const maximum = Math.min(6, sentenceTokens.length - sentenceIndex);
  return Array.from({ length: maximum }, (_, index) => index + 1)
    .filter((length) => sentenceTokens.slice(sentenceIndex, sentenceIndex + length)
      .every((part) => part !== HYPHEN_BOUNDARY_TOKEN));
}

function phraseModifierOffsets(sentenceTokens, sentenceIndex) {
  const offsets = [0];
  for (let count = 1; count <= 5; count += 1) {
    const modifier = sentenceTokens[sentenceIndex + count - 1];
    if (modifier === PUNCTUATION_BOUNDARY_TOKEN) continue;
    if (!modifier || (modifier !== HYPHEN_BOUNDARY_TOKEN && !modifier.endsWith("ly") &&
      !COMMON_PHRASE_MODIFIERS.has(modifier))) break;
    offsets.push(count);
  }
  return offsets;
}

function matchesHeadwordFormAt(sentenceTokens, form, startIndex) {
  const memo = new Map();

  function visit(formIndex, sentenceIndex) {
    if (formIndex === form.length) return true;
    if (sentenceIndex >= sentenceTokens.length) return false;

    const stateKey = formIndex + ":" + sentenceIndex;
    if (memo.has(stateKey)) return memo.get(stateKey);

    const token = form[formIndex];
    let matched = false;

    if (token.kind === "slot") {
      for (const length of placeholderLengths(token, sentenceTokens, sentenceIndex)) {
        if (visit(formIndex + 1, sentenceIndex + length)) {
          matched = true;
          break;
        }
      }
    } else if (token.kind === "word" && form.length > 1 &&
      ["a", "an", "the"].some((article) => token.forms.has(article)) &&
      formIndex < form.length - 1) {
      if (visit(formIndex + 1, sentenceIndex)) matched = true;
      for (const offset of phraseModifierOffsets(sentenceTokens, sentenceIndex)) {
        const candidate = sentenceTokens[sentenceIndex + offset];
        if (OBJECT_PRONOUNS.has(candidate) && visit(formIndex, sentenceIndex + offset + 1)) {
          matched = true;
          break;
        }
        if (!ARTICLE_DETERMINERS.has(candidate)) continue;
        for (const modifiers of phraseModifierOffsets(sentenceTokens, sentenceIndex + offset + 1)) {
          if (visit(formIndex + 1, sentenceIndex + offset + 1 + modifiers)) {
            matched = true;
            break;
          }
        }
        if (matched) break;
      }
    } else {
      const offsets = formIndex > 0 && token.kind !== "hyphen"
        ? phraseModifierOffsets(sentenceTokens, sentenceIndex)
        : [0];
      for (const offset of offsets) {
        const currentIndex = sentenceIndex + offset;
        if (token.kind === "be") {
          matched = BE_FORM_SEQUENCES.some((sequence) =>
            sequence.every((part, sequenceOffset) => sentenceTokens[currentIndex + sequenceOffset] === part) &&
            visit(formIndex + 1, currentIndex + sequence.length)
          );
        } else if (token.kind === "hyphen") {
          matched = sentenceTokens[currentIndex] === HYPHEN_BOUNDARY_TOKEN &&
            visit(formIndex + 1, currentIndex + 1);
        } else if (token.kind === "word" && token.forms.has(sentenceTokens[currentIndex])) {
          matched = visit(formIndex + 1, currentIndex + 1);
        } else if (token.kind === "word" && formIndex > 0 &&
          ARTICLE_DETERMINERS.has(sentenceTokens[currentIndex])) {
          for (const modifiers of phraseModifierOffsets(sentenceTokens, currentIndex + 1)) {
            if (token.forms.has(sentenceTokens[currentIndex + 1 + modifiers]) &&
              visit(formIndex + 1, currentIndex + 2 + modifiers)) {
              matched = true;
              break;
            }
          }
        }
        if (matched) break;
      }
    }

    memo.set(stateKey, matched);
    return matched;
  }

  return visit(0, startIndex);
}

function matchesSeparableForm(sentenceTokens, form) {
  if (form.length < 2 || form[0].kind !== "word") return false;

  for (let start = 0; start < sentenceTokens.length; start += 1) {
    if (!form[0].forms.has(sentenceTokens[start])) continue;
    for (let between = 0; between <= 4; between += 1) {
      const particleIndex = start + between + 1;
      if (particleIndex >= sentenceTokens.length) break;
      if (sentenceTokens.slice(start + 1, particleIndex)
        .some((token) => token === HYPHEN_BOUNDARY_TOKEN || token === PUNCTUATION_BOUNDARY_TOKEN)) continue;
      for (let formParticleIndex = 1; formParticleIndex < form.length; formParticleIndex += 1) {
        if (formParticleIndex !== 1) continue;
        const particle = form[formParticleIndex];
        if (particle.kind !== "word" ||
          ![...SEPARABLE_PHRASAL_PARTICLES].some((candidate) => particle.forms.has(candidate)) ||
          !particle.forms.has(sentenceTokens[particleIndex])) continue;

        const remainingForm = form.slice(formParticleIndex + 1);
        if (!remainingForm.length) return true;
        for (const modifierOffset of phraseModifierOffsets(sentenceTokens, particleIndex + 1)) {
          if (matchesHeadwordFormAt(sentenceTokens, remainingForm, particleIndex + 1 + modifierOffset)) return true;
        }
      }
    }
  }
  return false;
}

export function exampleUsesHeadword(word, englishExample) {
  const sentenceTokens = normalizeEnglishTokens(englishExample);
  if (!sentenceTokens.length) return false;

  for (const form of formsForHeadword(word)) {
    for (let index = 0; index < sentenceTokens.length; index += 1) {
      if (matchesHeadwordFormAt(sentenceTokens, form, index)) return true;
    }
    if (matchesSeparableForm(sentenceTokens, form)) return true;
  }
  return false;
}
