export const VALID_POS_CODES = Object.freeze([
  "n.", "v.", "vt.", "vi.", "adj.", "adv.", "prep.", "conj.", "pron.",
  "det.", "art.", "num.", "int.", "aux.", "abbr.", "phr."
]);

const POS_ALIASES = new Map([
  ["n", "n."], ["noun", "n."],
  ["v", "v."], ["verb", "v."],
  ["vt", "vt."], ["v.t", "vt."], ["transitive verb", "vt."],
  ["vi", "vi."], ["v.i", "vi."], ["intransitive verb", "vi."],
  ["a", "adj."], ["adj", "adj."], ["adjective", "adj."],
  ["ad", "adv."], ["adv", "adv."], ["adverb", "adv."],
  ["prep", "prep."], ["preposition", "prep."],
  ["conj", "conj."], ["conjunction", "conj."],
  ["pron", "pron."], ["pronoun", "pron."],
  ["det", "det."], ["determiner", "det."],
  ["art", "art."], ["article", "art."],
  ["num", "num."], ["number", "num."], ["numeral", "num."],
  ["int", "int."], ["interj", "int."], ["interjection", "int."],
  ["aux", "aux."], ["auxiliary", "aux."],
  ["abbr", "abbr."], ["abbreviation", "abbr."],
  ["ph", "phr."], ["phr", "phr."], ["phrase", "phr."]
]);

const FULL_WORD_POS = new Set([
  "noun", "verb", "adjective", "adverb", "preposition", "conjunction", "pronoun",
  "determiner", "article", "number", "numeral", "interj", "interjection", "auxiliary",
  "abbreviation", "phrase"
]);

const TEXT_POS_TOKEN = "(?:intransitive\\s+verb|transitive\\s+verb|adjective|adverb|preposition|conjunction|pronoun|determiner|abbreviation|interjection|auxiliary|numeral|number|phrase|noun|verb|n\\.?|v\\.?|vt\\.?|vi\\.?|v\\.t\\.?|v\\.i\\.?|a\\.?|ad\\.?|adj\\.?|adv\\.?|prep\\.?|conj\\.?|pron\\.?|det\\.?|art\\.?|num\\.?|int\\.?|interj\\.?|aux\\.?|abbr\\.?|phr\\.?)";
const TEXT_POS_GROUP = new RegExp(`(^|\\s)((?:${TEXT_POS_TOKEN})(?:\\s*\\/\\s*(?:${TEXT_POS_TOKEN}))*)\\s+`, "giu");
const IPA_ALLOWED = /^[a-zæœøðŋθ\u0250-\u02AF\u0300-\u036F\u02B0-\u02FFˈˌːˑ .]*$/u;

export function normalizePosCode(value) {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/\.$/u, "").replace(/\s+/gu, " ");
  return POS_ALIASES.get(normalized) ?? "";
}

export function parsePosList(value) {
  const text = String(value ?? "").trim();
  if (!text) return [];

  const tokens = text
    .replace(/\bintransitive\s+verb\b/giu, "vi")
    .replace(/\btransitive\s+verb\b/giu, "vt")
    .split(/[\s/|,;]+/u)
    .filter(Boolean);
  const normalized = tokens.map(normalizePosCode);
  if (normalized.some((code) => !code)) return null;
  return [...new Set(normalized)];
}

function normalizeTextLabel(value) {
  const token = String(value ?? "").trim();
  const key = token.toLowerCase().replace(/\.$/u, "").replace(/\s+/gu, " ");
  if (!POS_ALIASES.has(key)) return "";
  if (FULL_WORD_POS.has(key) || token.endsWith(".")) return POS_ALIASES.get(key);
  return "";
}

export function parseLabeledTranslation(value) {
  const text = String(value ?? "").trim();
  if (!text) return { found: false, order: [], meanings: new Map(), groups: [] };

  const matches = [...text.matchAll(TEXT_POS_GROUP)];
  if (!matches.length || text.slice(0, matches[0].index).trim()) {
    return { found: false, order: [], meanings: new Map(), groups: [] };
  }

  const order = [];
  const meanings = new Map();
  const groups = [];
  for (const [index, match] of matches.entries()) {
    const labelGroup = match[2];
    const posCodes = labelGroup.split("/").map(normalizeTextLabel);
    if (posCodes.some((code) => !code)) {
      return { found: false, order: [], meanings: new Map(), groups: [] };
    }

    const bodyStart = match.index + match[0].length;
    const nextStart = matches[index + 1]?.index ?? text.length;
    const body = text.slice(bodyStart, nextStart).trim();
    const definitionParts = body.split(/[；;]/u).map((part) => part.trim()).filter(Boolean);
    const evenlySplit = posCodes.length > 1 && definitionParts.length > 0 && definitionParts.length % posCodes.length === 0;
    const definitionsPerPos = evenlySplit ? definitionParts.length / posCodes.length : 0;
    const group = { posCodes, body, meanings: {} };
    for (const [posIndex, pos] of posCodes.entries()) {
      if (!order.includes(pos)) order.push(pos);
      const parts = meanings.get(pos) ?? [];
      const meaning = evenlySplit
        ? definitionParts.slice(posIndex * definitionsPerPos, (posIndex + 1) * definitionsPerPos).join("；")
        : body;
      group.meanings[pos] = meaning;
      if (meaning) parts.push(meaning);
      meanings.set(pos, parts);
    }
    groups.push(group);
  }

  return { found: true, order, meanings, groups };
}

function mergeParts(parts) {
  return parts.filter(Boolean).join("；");
}

function translationByPos(rawValue, labeled, posCodes) {
  if (labeled.found) {
    return Object.fromEntries(posCodes.map((pos) => [pos, mergeParts(labeled.meanings.get(pos) ?? [])]));
  }

  const text = String(rawValue ?? "").trim();
  if (!text) return Object.fromEntries(posCodes.map((pos) => [pos, ""]));
  if (posCodes.length === 1) return { [posCodes[0]]: text };

  const lines = text.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (lines.length === posCodes.length) {
    return Object.fromEntries(posCodes.map((pos, index) => [pos, lines[index]]));
  }

  // Keep every source definition when a multi-POS field has no reliable split.
  return Object.fromEntries(posCodes.map((pos) => [pos, text]));
}

export function inferSensesFromLegacyRow(row) {
  const rawTranslations = {
    meaning_zh: String(row?.meaning_zh ?? ""),
    meaning_ja: String(row?.meaning_ja ?? ""),
    meaning_ko: String(row?.meaning_ko ?? "")
  };
  const labeled = Object.fromEntries(
    Object.entries(rawTranslations).map(([field, value]) => [field, parseLabeledTranslation(value)])
  );
  const sourcePos = parsePosList(row?.pos);
  let posCodes = sourcePos;
  let parsedFrom = sourcePos?.length ? "pos" : "";

  if (!posCodes?.length) {
    const parsedField = ["meaning_zh", "meaning_ja", "meaning_ko"].find((field) => labeled[field].found);
    if (parsedField) {
      posCodes = labeled[parsedField].order;
      parsedFrom = parsedField;
    }
  }

  if (!posCodes?.length) {
    return {
      parsed: false,
      parsedFrom: "",
      senses: [{ pos: "", ...rawTranslations }]
    };
  }

  for (const field of Object.keys(labeled)) {
    if (labeled[field].found) {
      for (const pos of labeled[field].order) {
        if (!posCodes.includes(pos)) posCodes.push(pos);
      }
    }
  }

  const translations = Object.fromEntries(
    Object.entries(rawTranslations).map(([field, rawValue]) => [
      field,
      translationByPos(rawValue, labeled[field], posCodes)
    ])
  );
  return {
    parsed: true,
    parsedFrom,
    senses: posCodes.map((pos) => ({
      pos,
      meaning_zh: translations.meaning_zh[pos] ?? "",
      meaning_ja: translations.meaning_ja[pos] ?? "",
      meaning_ko: translations.meaning_ko[pos] ?? ""
    }))
  };
}

export function formatSensesField(senses, field, { includePos = true, separator = "\n" } = {}) {
  return (Array.isArray(senses) ? senses : [])
    .map((sense) => {
      const meaning = String(sense?.[field] ?? "").trim();
      if (!meaning) return "";
      const pos = String(sense?.pos ?? "").trim();
      return includePos && pos ? `${pos} ${meaning}` : meaning;
    })
    .filter(Boolean)
    .join(separator);
}

export function syncCompatibilityFieldsFromSenses(row) {
  const senses = Array.isArray(row?.senses) ? row.senses : [];
  if (row.track === "toeic") {
    const toeicCode = (pos) => ({
      "n.": "n", "v.": "v", "vt.": "v", "vi.": "v", "adj.": "a", "adv.": "ad"
    }[pos] ?? String(pos ?? "").replace(/\.$/u, ""));
    row.pos = senses.map((sense) => sense.pos).filter(Boolean).map(toeicCode).join(" / ");
    row.meaning_zh = senses.map((sense) => String(sense.meaning_zh ?? "").trim()).filter(Boolean).join("；");
    row.meaning_ja = senses.map((sense) => String(sense.meaning_ja ?? "").trim()).filter(Boolean).join("；");
    row.meaning_ko = senses.map((sense) => String(sense.meaning_ko ?? "").trim()).filter(Boolean).join("；");
    return row;
  }

  row.pos = senses.map((sense) => sense.pos).filter(Boolean).join("\n");
  row.meaning_zh = formatSensesField(senses, "meaning_zh");
  row.meaning_ja = formatSensesField(senses, "meaning_ja");
  row.meaning_ko = formatSensesField(senses, "meaning_ko");
  return row;
}

export function snapshotLegacyDisplay(row) {
  return {
    pos: String(row?.pos ?? ""),
    meaning_zh: String(row?.meaning_zh ?? ""),
    meaning_ja: String(row?.meaning_ja ?? ""),
    meaning_ko: String(row?.meaning_ko ?? "")
  };
}

export function createCanonicalSensedRow(row) {
  const canonical = { ...row };
  canonical.legacy_display ??= snapshotLegacyDisplay(canonical);
  canonical.senses ??= inferSensesFromLegacyRow({ ...canonical, ...canonical.legacy_display }).senses;
  canonical.ipa_us ??= "";
  canonical.ipa_uk ??= "";
  return syncCompatibilityFieldsFromSenses(canonical);
}

export function isValidIpa(value) {
  return typeof value === "string" && IPA_ALLOWED.test(value);
}

export function validateSenseRow(row, label = "vocabulary row") {
  const errors = [];
  if (!Array.isArray(row?.senses) || row.senses.length < 1) {
    errors.push(`${label} must have at least one sense`);
  } else {
    const seenPos = new Set();
    row.senses.forEach((sense, index) => {
      if (!sense || typeof sense !== "object" || Array.isArray(sense)) {
        errors.push(`${label} sense ${index + 1} must be an object`);
        return;
      }
      if (typeof sense.pos !== "string" || (sense.pos !== "" && !VALID_POS_CODES.includes(sense.pos))) {
        errors.push(`${label} sense ${index + 1} has invalid POS code ${JSON.stringify(sense.pos)}`);
      } else if (sense.pos && seenPos.has(sense.pos)) {
        errors.push(`${label} has more than one sense for POS ${sense.pos}`);
      } else if (sense.pos) {
        seenPos.add(sense.pos);
      }
      for (const field of ["meaning_zh", "meaning_ja", "meaning_ko"]) {
        if (typeof sense[field] !== "string") {
          errors.push(`${label} sense ${index + 1} field ${field} must be a string`);
        }
      }
    });
  }

  if (row?.example_sense !== undefined && row?.example_sense !== null) {
    if (!Number.isInteger(row.example_sense) || row.example_sense < 0 || row.example_sense >= (row.senses?.length ?? 0)) {
      errors.push(`${label} example_sense must refer to an existing sense`);
    }
  }
  for (const field of ["ipa_us", "ipa_uk"]) {
    if (row?.[field] !== undefined && !isValidIpa(row[field])) {
      errors.push(`${label} ${field} contains non-IPA characters`);
    }
  }
  return errors;
}
