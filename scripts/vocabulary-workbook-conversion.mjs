import xlsx from "xlsx";
import { findSourceWorkbookPath, LEVEL_WORKBOOK_COLUMNS, TRACK_DEFINITIONS } from "./vocabulary-source-definitions.mjs";
import { normalizeVocabularyEntries } from "./vocabulary-data-utils.mjs";

function readSheetRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new Error(`Missing worksheet: ${sheetName}`);
  }

  return xlsx.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false
  });
}

function normalizeWord(text) {
  return String(text ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function expandWordVariants(text) {
  const parts = String(text ?? "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  const variants = new Set();

  for (const part of parts) {
    let expanded = new Set([part]);

    while (true) {
      let changed = false;
      const nextExpanded = new Set();

      for (const item of expanded) {
        const match = /\(([^()]+)\)/.exec(item);

        if (!match) {
          nextExpanded.add(item);
          continue;
        }

        changed = true;
        const prefix = item.slice(0, match.index);
        const suffix = item.slice(match.index + match[0].length);
        nextExpanded.add(`${prefix}${suffix}`);
        nextExpanded.add(`${prefix}${match[1]}${suffix}`);
      }

      expanded = nextExpanded;

      if (!changed) {
        break;
      }
    }

    for (const item of expanded) {
      const normalized = normalizeWord(item);

      if (normalized) {
        variants.add(normalized);
      }
    }
  }

  return variants;
}

function formatToeicMeaning(pos, meaning) {
  const normalizedPos = String(pos ?? "").trim();
  const normalizedMeaning = String(meaning ?? "").trim();

  if (!normalizedPos) {
    return normalizedMeaning;
  }

  return `${normalizedPos}. ${normalizedMeaning}`;
}

function formatBilingualExample(englishExample, chineseExample) {
  const english = String(englishExample ?? "").trim();
  const chinese = String(chineseExample ?? "").trim();

  if (english && chinese) {
    return `${english} (${chinese})`;
  }

  return english || chinese;
}

export function splitCombinedExample(example) {
  const text = String(example ?? "").trim();

  if (!text) {
    return {
      example_en: "",
      example_zh: "",
      example_format: { before: "", after: "" }
    };
  }

  let closingIndex = text.length - 1;

  while (closingIndex >= 0 && /[.!?。！？]/u.test(text[closingIndex])) {
    closingIndex -= 1;
  }

  const closing = text[closingIndex];
  const opening = closing === ")" ? "(" : closing === "）" ? "（" : "";

  if (!opening) {
    return {
      example_en: text,
      example_zh: "",
      example_format: { before: "", after: "" }
    };
  }

  let depth = 0;
  let openingIndex = -1;

  for (let index = closingIndex; index >= 0; index -= 1) {
    if (text[index] === closing) {
      depth += 1;
    } else if (text[index] === opening) {
      depth -= 1;

      if (depth === 0) {
        openingIndex = index;
        break;
      }
    }
  }

  if (openingIndex < 0) {
    return {
      example_en: text,
      example_zh: "",
      example_format: { before: "", after: "" }
    };
  }

  const left = text.slice(0, openingIndex);
  const english = left.trimEnd();
  const beforeOpening = left.slice(english.length);
  const rawTranslation = text.slice(openingIndex + 1, closingIndex);
  const translation = rawTranslation.trim();

  if (!/\p{Script=Han}/u.test(translation)) {
    return {
      example_en: text,
      example_zh: "",
      example_format: { before: "", after: "" }
    };
  }

  const translationStart = translation ? rawTranslation.indexOf(translation) : 0;
  const translationEnd = translationStart + translation.length;

  return {
    example_en: english,
    example_zh: translation,
    example_format: {
      before: `${beforeOpening}${opening}${rawTranslation.slice(0, translationStart)}`,
      after: `${rawTranslation.slice(translationEnd)}${closing}${text.slice(closingIndex + 1)}`
    }
  };
}

function readLevelVocabularyRows(workbookPath, sheetNames, columns) {
  const workbook = xlsx.readFile(workbookPath);
  const vocabulary = [];

  for (const sheetName of sheetNames) {
    const rows = readSheetRows(workbook, sheetName);

    rows.slice(1).forEach((row) => {
      const word = String(row[columns.word] ?? "").trim();
      const meaning = String(row[columns.meaning] ?? "").trim();
      const example = String(row[columns.englishExample] || row[columns.fallbackExample] || "").trim();

      if (!word || !meaning) {
        return;
      }

      vocabulary.push({
        level: sheetName.replace("Level ", "L"),
        word,
        meaning,
        example
      });
    });
  }

  return normalizeVocabularyEntries(vocabulary);
}

function readToeicVocabularyRows(workbookPath, definition) {
  const workbook = xlsx.readFile(workbookPath);
  const vocabulary = [];
  const { sheets, columns, fallbackLevel = "TOEIC" } = definition;

  for (const sheetName of sheets) {
    const rows = readSheetRows(workbook, sheetName);

    rows.slice(1).forEach((row) => {
      const word = String(row[columns.word] ?? "").trim();
      const pos = columns.pos != null ? String(row[columns.pos] ?? "").trim() : "";
      const sourceMeaning = String(row[columns.meaning] ?? "").trim();
      const level = columns.level != null ? String(row[columns.level] ?? "").trim() || fallbackLevel : fallbackLevel;
      const englishExample = columns.englishExample != null ? String(row[columns.englishExample] ?? "").trim() : "";
      const chineseExample = columns.chineseExample != null ? String(row[columns.chineseExample] ?? "").trim() : "";

      if (!word || !sourceMeaning) {
        return;
      }

      vocabulary.push({
        level,
        word,
        pos,
        meaning: formatToeicMeaning(pos, sourceMeaning),
        sourceMeaning,
        example: formatBilingualExample(englishExample, chineseExample)
      });
    });
  }

  return normalizeVocabularyEntries(vocabulary);
}

function readNamedColumnVocabularyRows(workbookPath, definition) {
  const workbook = xlsx.readFile(workbookPath);
  const vocabulary = [];
  const sheetNames = definition.sheets?.length ? definition.sheets : [workbook.SheetNames[0]];
  const headers = definition.columnsByHeader ?? {};

  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
      throw new Error(`Missing worksheet: ${sheetName}`);
    }

    const rows = xlsx.utils.sheet_to_json(sheet, {
      defval: "",
      raw: false
    });

    for (const row of rows) {
      const word = String(row[headers.word] ?? "").trim();
      const meaning = String(row[headers.meaning] ?? "").trim();
      const englishExample = String(row[headers.englishExample] ?? "").trim();
      const chineseExample = String(row[headers.chineseExample] ?? "").trim();

      if (!word || !meaning) {
        continue;
      }

      vocabulary.push({
        level: definition.fallbackLevel ?? "CUSTOM",
        word,
        meaning,
        example: formatBilingualExample(englishExample, chineseExample)
      });
    }
  }

  return normalizeVocabularyEntries(vocabulary);
}

function readElementaryVocabularyRows(workbookPath, definition) {
  const workbook = xlsx.readFile(workbookPath);
  const vocabulary = [];
  const sheetNames = definition.sheets?.length ? definition.sheets : [workbook.SheetNames[0]];
  const headers = definition.columnsByHeader ?? {};

  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
      throw new Error(`Missing worksheet: ${sheetName}`);
    }

    const rows = xlsx.utils.sheet_to_json(sheet, {
      defval: "",
      raw: false
    });

    rows.forEach((row, sourceIndex) => {
      const word = String(row[headers.word] ?? "").trim();
      const meaning = String(row[headers.meaning] ?? "").trim();
      const englishExample = String(row[headers.englishExample] ?? "").trim();
      const chineseExample = String(row[headers.chineseExample] ?? "").trim();
      const number = Number(String(row[headers.number] ?? "").trim());

      if (!word || !meaning) {
        return;
      }

      vocabulary.push({
        level: definition.fallbackLevel ?? "Elementary",
        word,
        meaning,
        example: formatBilingualExample(englishExample, chineseExample),
        sourceNumber: Number.isFinite(number) ? number : Number.MAX_SAFE_INTEGER,
        sourceIndex
      });
    });
  }

  vocabulary.sort((left, right) => left.sourceNumber - right.sourceNumber || left.sourceIndex - right.sourceIndex);

  return normalizeVocabularyEntries(
    vocabulary.map(({ sourceNumber, sourceIndex, ...entry }) => entry)
  );
}

function buildLevelExampleLookup(root) {
  const sourceDefinitions = [
    {
      ...TRACK_DEFINITIONS.find((definition) => definition.id === "junior-high"),
      sheets: ["Level 1", "Level 2"]
    },
    {
      ...TRACK_DEFINITIONS.find((definition) => definition.id === "senior-high"),
      sheets: ["Level 3", "Level 4", "Level 5", "Level 6"]
    }
  ];
  const exampleLookup = new Map();

  for (const source of sourceDefinitions) {
    const workbook = xlsx.readFile(findSourceWorkbookPath(source, root));

    for (const sheetName of source.sheets) {
      const rows = readSheetRows(workbook, sheetName);
      const sheetLookup = exampleLookup.get(sheetName) ?? new Map();

      rows.slice(1).forEach((row) => {
        const word = String(row[LEVEL_WORKBOOK_COLUMNS.word] ?? "").trim();
        const example = String(
          row[LEVEL_WORKBOOK_COLUMNS.englishExample] || row[LEVEL_WORKBOOK_COLUMNS.fallbackExample] || ""
        ).trim();

        if (!word || !example) {
          return;
        }

        for (const variant of expandWordVariants(word)) {
          if (!sheetLookup.has(variant)) {
            sheetLookup.set(variant, example);
          }
        }
      });

      exampleLookup.set(sheetName, sheetLookup);
    }
  }

  return exampleLookup;
}

function formatPrimaryLevel(levelText, fallbackLevel) {
  const normalizedLevel = String(levelText ?? "").trim();
  const match = /^Level\s+(\d+)$/i.exec(normalizedLevel);

  if (match) {
    return `L${match[1]}`;
  }

  return fallbackLevel;
}

function resolveGeptExample(word, primaryLevel, fallbackExample, exampleLookup, preferFallback = false) {
  if (preferFallback && fallbackExample) {
    return fallbackExample;
  }

  const normalizedLevel = String(primaryLevel ?? "").trim();

  if (normalizedLevel) {
    const levelExamples = exampleLookup.get(normalizedLevel);

    if (levelExamples) {
      for (const variant of expandWordVariants(word)) {
        const example = levelExamples.get(variant);

        if (example) {
          return example;
        }
      }
    }
  }

  return fallbackExample;
}

function consolidateGeptEntries(vocabulary) {
  const groups = new Map();

  for (const entry of vocabulary) {
    const groupKey = `${entry.level}\u0000${entry.word}`;
    const group =
      groups.get(groupKey) ?? {
        level: entry.level,
        word: entry.word,
        senses: [],
        examples: []
      };

    const senseKey = `${entry.pos}\u0000${entry.meaning}`;

    if (!group.senses.some((sense) => `${sense.pos}\u0000${sense.meaning}` === senseKey)) {
      group.senses.push({
        pos: entry.pos,
        meaning: entry.meaning
      });
    }

    if (entry.example && !group.examples.includes(entry.example)) {
      group.examples.push(entry.example);
    }

    groups.set(groupKey, group);
  }

  return Array.from(groups.values(), (group) => ({
    level: group.level,
    word: group.word,
    pos: [...new Set(group.senses.map((sense) => sense.pos).filter(Boolean))].join("\n"),
    meaning: group.senses
      .map((sense) => (sense.pos ? `${sense.pos} ${sense.meaning}` : sense.meaning))
      .join("\n"),
    example: group.examples[0] ?? ""
  }));
}

function readGeptVocabularyRows(workbookPath, definition, exampleLookup) {
  const workbook = xlsx.readFile(workbookPath);
  const rows = readSheetRows(workbook, definition.sheets[0]);
  const vocabulary = [];
  const columns = definition.columns;

  rows.slice(1).forEach((row) => {
    const word = String(row[columns.word] ?? "").trim();
    const pos = String(row[columns.pos] ?? "").trim();
    const meaning = String(row[columns.meaning] ?? "").trim();
    const geptGrade = String(row[columns.grade] ?? "").trim();
    const primaryLevel = String(row[columns.primaryLevel] ?? "").trim();
    const fallbackExample = String(row[columns.fallbackExample] ?? "").trim();

    if (geptGrade !== definition.geptGrade || !word || !meaning) {
      return;
    }

    vocabulary.push({
      level: formatPrimaryLevel(primaryLevel, definition.geptGrade),
      word,
      pos,
      meaning,
      example: resolveGeptExample(
        word,
        primaryLevel,
        fallbackExample,
        exampleLookup,
        ["gept-intermediate", "gept-high-intermediate"].includes(definition.id)
      )
    });
  });

  return normalizeVocabularyEntries(consolidateGeptEntries(vocabulary));
}

function readTrackWorkbookRows(definition, root, exampleLookup) {
  const workbookPath = findSourceWorkbookPath(definition, root);

  if (definition.type === "gept-workbook") {
    return readGeptVocabularyRows(workbookPath, definition, exampleLookup);
  }
  if (definition.type === "named-column-workbook") {
    return readNamedColumnVocabularyRows(workbookPath, definition);
  }
  if (definition.type === "elementary-workbook") {
    return readElementaryVocabularyRows(workbookPath, definition);
  }
  if (definition.type === "toeic-workbook") {
    return readToeicVocabularyRows(workbookPath, definition);
  }
  if (definition.type === "level-workbook") {
    return readLevelVocabularyRows(workbookPath, definition.sheets, definition.columns);
  }

  throw new Error(`Unsupported workbook source type for ${definition.id}: ${definition.type}`);
}

export function readWorkbookTrackEntries(root = process.cwd(), { skipTrackIds = [] } = {}) {
  const exampleLookup = buildLevelExampleLookup(root);
  const tracks = new Map();
  const skippedTrackIds = new Set(skipTrackIds);

  for (const definition of TRACK_DEFINITIONS) {
    if (!definition.available || definition.type === "jsonl-source" || skippedTrackIds.has(definition.id)) {
      tracks.set(definition.id, []);
      continue;
    }

    tracks.set(definition.id, readTrackWorkbookRows(definition, root, exampleLookup));
  }

  return tracks;
}
