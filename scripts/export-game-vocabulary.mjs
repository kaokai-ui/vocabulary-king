import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import xlsx from "xlsx";
import { buildDisambiguatedVocabularyId, buildStableVocabularyId } from "../src/lib/vocabularyIdentity.js";

const DATA_ROOT = path.resolve("public/data");
const TRACKS_ROOT = path.join(DATA_ROOT, "tracks");
const CHUNK_SIZE = 1000;
const PLACEHOLDER_TRACKS = [
  { id: "ielts", title: "IELTS" }
];
const workbookPathCache = new Map();
let levelExampleLookupCache = null;
const TRACK_DEFINITIONS = [
  {
    id: "junior-high",
    title: "Junior High",
    sourceWorkbookKey: "level-1-level-2-workbook",
    workbookPattern: /L1L2\.xlsx$/i,
    sheets: ["Level 1", "Level 2"],
    type: "level-workbook",
    available: true
  },
  {
    id: "senior-high",
    title: "Senior High (L3-4)",
    sourceWorkbookKey: "level-3-level-4-workbook",
    workbookPattern: /L3L6\.xlsx$/i,
    sheets: ["Level 3", "Level 4"],
    type: "level-workbook",
    available: true
  },
  {
    id: "senior-high-5-6",
    title: "Senior High (L5-6)",
    sourceWorkbookKey: "level-5-level-6-workbook",
    workbookPattern: /L3L6\.xlsx$/i,
    sheets: ["Level 5", "Level 6"],
    type: "level-workbook",
    available: true
  },
  {
    id: "gept-elementary",
    title: "GEPT Elementary",
    sourceWorkbookKey: "gept-with-levels-kk-workbook",
    workbookPattern: /GEPT_with_levels\.KK\.xlsx$/i,
    sheets: ["High"],
    geptGrade: "初級",
    type: "gept-workbook",
    available: true
  },
  {
    id: "gept-intermediate",
    title: "GEPT Intermediate",
    sourceWorkbookKey: "gept-with-levels-kk-workbook",
    workbookPattern: /GEPT_with_levels\.KK\.xlsx$/i,
    sheets: ["High"],
    geptGrade: "中級",
    type: "gept-workbook",
    available: true
  },
  {
    id: "gept-high-intermediate",
    title: "GEPT High-Intermediate",
    sourceWorkbookKey: "gept-with-levels-kk-workbook",
    workbookPattern: /GEPT_with_levels\.KK\.xlsx$/i,
    sheets: ["High"],
    geptGrade: "中高級",
    type: "gept-workbook",
    available: true
  },
  {
    id: "toeic",
    title: "TOEIC(核心)",
    sourceWorkbookKey: "toeic-core-workbook",
    workbookPattern: /toeic3000_final\.xlsx$/i,
    sheets: ["Sheet1"],
    type: "toeic-workbook",
    columns: {
      word: 1,
      pos: 2,
      meaning: 3,
      level: 4,
      englishExample: 6,
      chineseExample: 7
    },
    available: true
  },
  {
    id: "toeic-advanced",
    title: "TOEIC(進階)",
    sourceWorkbookKey: "toeic-advanced-workbook",
    workbookPattern: /Toeic\.Advanced\.xlsx$/i,
    sheets: ["KK"],
    type: "toeic-workbook",
    columns: {
      word: 1,
      meaning: 2,
      englishExample: 3,
      chineseExample: 4
    },
    fallbackLevel: "TOEIC-ADV",
    available: true
  },
  {
    id: "toefl",
    title: "TOEFL",
    sourceWorkbookKey: "toefl-final-checked-workbook",
    sourceWorkbookPath: "Source/toefl.final.checked.xlsx",
    type: "named-column-workbook",
    columnsByHeader: {
      word: "Word",
      meaning: "Chinese Meaning",
      englishExample: "English Example",
      chineseExample: "Chinese Translation"
    },
    fallbackLevel: "TOEFL",
    available: true
  }
];

function findWorkbookPath(workbookPattern) {
  const cacheKey = workbookPattern.toString();

  if (workbookPathCache.has(cacheKey)) {
    return workbookPathCache.get(cacheKey);
  }

  const workbookName = fs
    .readdirSync(process.cwd())
    .find((fileName) => workbookPattern.test(fileName) && !/backup|before/i.test(fileName));

  if (!workbookName) {
    throw new Error(`Could not find a workbook matching ${workbookPattern} in the project root.`);
  }

  const resolvedPath = path.resolve(workbookName);
  workbookPathCache.set(cacheKey, resolvedPath);

  return resolvedPath;
}

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

function findWorkbookPathFromDefinition(definition) {
  if (definition.sourceWorkbookPath) {
    return path.resolve(definition.sourceWorkbookPath);
  }

  return findWorkbookPath(definition.workbookPattern);
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

function normalizeVocabularyEntries(vocabulary) {
  const groups = new Map();

  for (const entry of vocabulary) {
    const groupKey = `${entry.level}\u0000${entry.word}\u0000${entry.meaning}`;
    const group = groups.get(groupKey) ?? [];

    group.push(entry);
    groups.set(groupKey, group);
  }

  const normalizedVocabulary = [];

  for (const group of groups.values()) {
    const uniqueEntries = [];
    const seenExactRows = new Set();

    for (const entry of group) {
      const exactKey = `${entry.level}\u0000${entry.word}\u0000${entry.meaning}\u0000${entry.example}`;

      if (seenExactRows.has(exactKey)) {
        continue;
      }

      seenExactRows.add(exactKey);
      uniqueEntries.push(entry);
    }

    for (const entry of uniqueEntries) {
      normalizedVocabulary.push({
        ...entry,
        id:
          uniqueEntries.length === 1
            ? buildStableVocabularyId(entry.level, entry.word, entry.meaning)
            : buildDisambiguatedVocabularyId(entry.level, entry.word, entry.meaning, entry.example)
      });
    }
  }

  return normalizedVocabulary;
}

function readLevelVocabularyRows(workbookPath, sheetNames) {
  const workbook = xlsx.readFile(workbookPath);
  const vocabulary = [];

  for (const sheetName of sheetNames) {
    const rows = readSheetRows(workbook, sheetName);

    rows.slice(1).forEach((row) => {
      const word = String(row[1] ?? "").trim();
      const meaning = String(row[2] ?? "").trim();
      const example = String(row[4] || row[3] || "").trim();

      if (!word || !meaning) {
        return;
      }

      const level = sheetName.replace("Level ", "L");

      vocabulary.push({
        level,
        word,
        meaning,
        example
      });
    });
  }

  return normalizeVocabularyEntries(vocabulary);
}

function formatToeicMeaning(pos, meaning) {
  const normalizedPos = String(pos ?? "").trim();
  const normalizedMeaning = String(meaning ?? "").trim();

  if (!normalizedPos) {
    return normalizedMeaning;
  }

  return `${normalizedPos}. ${normalizedMeaning}`;
}

function formatToeicExample(englishExample, chineseExample) {
  const normalizedEnglishExample = String(englishExample ?? "").trim();
  const normalizedChineseExample = String(chineseExample ?? "").trim();

  if (normalizedEnglishExample && normalizedChineseExample) {
    return `${normalizedEnglishExample} (${normalizedChineseExample})`;
  }

  return normalizedEnglishExample || normalizedChineseExample;
}

function formatBilingualExample(englishExample, chineseExample) {
  return formatToeicExample(englishExample, chineseExample);
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
      const meaning = String(row[columns.meaning] ?? "").trim();
      const level = columns.level != null ? String(row[columns.level] ?? "").trim() || fallbackLevel : fallbackLevel;
      const englishExample = columns.englishExample != null ? String(row[columns.englishExample] ?? "").trim() : "";
      const chineseExample = columns.chineseExample != null ? String(row[columns.chineseExample] ?? "").trim() : "";

      if (!word || !meaning) {
        return;
      }

      vocabulary.push({
        level,
        word,
        meaning: formatToeicMeaning(pos, meaning),
        example: formatToeicExample(englishExample, chineseExample)
      });
    });
  }

  return normalizeVocabularyEntries(vocabulary);
}

function formatJsonVocabularyMeaning(translations) {
  const senses = [];
  const seen = new Set();

  for (const translation of Array.isArray(translations) ? translations : []) {
    const pos = String(translation?.pos ?? "").trim();
    const meaning = String(translation?.tranCn ?? "").trim();

    if (!meaning) {
      continue;
    }

    const formatted = pos ? `${pos}. ${meaning}` : meaning;

    if (seen.has(formatted)) {
      continue;
    }

    seen.add(formatted);
    senses.push(formatted);
  }

  return senses.join("\n");
}

function formatJsonVocabularyExample(sentences) {
  for (const sentence of Array.isArray(sentences) ? sentences : []) {
    const english = String(sentence?.sContent ?? "").trim();
    const chinese = String(sentence?.sCn ?? "").trim();

    if (english && chinese) {
      return `${english} (${chinese})`;
    }

    if (english || chinese) {
      return english || chinese;
    }
  }

  return "";
}

function readJsonVocabularyRows(sourceJsonPath, definition) {
  const sourcePath = path.resolve(sourceJsonPath);
  const entries = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  const vocabulary = [];

  for (const entry of entries) {
    const word = String(entry?.headWord ?? entry?.content?.word?.wordHead ?? "").trim();
    const content = entry?.content?.word?.content ?? {};
    const meaning = formatJsonVocabularyMeaning(content.trans);
    const example = formatJsonVocabularyExample(content?.sentence?.sentences);
    const level = definition.fallbackLevel ?? "CUSTOM";

    if (!word || !meaning) {
      continue;
    }

    vocabulary.push({
      level,
      word,
      meaning,
      example
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

function buildLevelExampleLookup() {
  if (levelExampleLookupCache) {
    return levelExampleLookupCache;
  }

  const sourceDefinitions = [
    {
      workbookPattern: /L1L2\.xlsx$/i,
      sheets: ["Level 1", "Level 2"]
    },
    {
      workbookPattern: /L3L6\.xlsx$/i,
      sheets: ["Level 3", "Level 4", "Level 5", "Level 6"]
    }
  ];
  const exampleLookup = new Map();

  for (const source of sourceDefinitions) {
    const workbook = xlsx.readFile(findWorkbookPath(source.workbookPattern));

    for (const sheetName of source.sheets) {
      const rows = readSheetRows(workbook, sheetName);
      const sheetLookup = exampleLookup.get(sheetName) ?? new Map();

      rows.slice(1).forEach((row) => {
        const word = String(row[1] ?? "").trim();
        const example = String(row[4] || row[3] || "").trim();

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

  levelExampleLookupCache = exampleLookup;

  return levelExampleLookupCache;
}

function formatPrimaryLevel(levelText, fallbackLevel) {
  const normalizedLevel = String(levelText ?? "").trim();
  const match = /^Level\s+(\d+)$/i.exec(normalizedLevel);

  if (match) {
    return `L${match[1]}`;
  }

  return fallbackLevel;
}

function resolveGeptExample(word, primaryLevel, fallbackExample, exampleLookup) {
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

  rows.slice(1).forEach((row) => {
    const word = String(row[0] ?? "").trim();
    const pos = String(row[1] ?? "").trim();
    const meaning = String(row[2] ?? "").trim();
    const geptGrade = String(row[4] ?? "").trim();
    const primaryLevel = String(row[7] ?? "").trim();
    const fallbackExample = String(row[8] ?? "").trim();

    if (geptGrade !== definition.geptGrade || !word || !meaning) {
      return;
    }

    vocabulary.push({
      level: formatPrimaryLevel(primaryLevel, definition.geptGrade),
      word,
      pos,
      meaning,
      example: resolveGeptExample(word, primaryLevel, fallbackExample, exampleLookup)
    });
  });

  return normalizeVocabularyEntries(consolidateGeptEntries(vocabulary));
}

function chunkItems(items, chunkSize) {
  const chunks = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function contentHash(value) {
  const json = JSON.stringify(value);
  return createHash("sha256").update(json).digest("hex").slice(0, 12);
}

function createCatalogTrack(definition, chunkFiles = [], totalWords = 0) {
  return {
    id: definition.id,
    available: definition.available,
    title: definition.title,
    sourceWorkbookKey: definition.sourceWorkbookKey,
    totalWords,
    chunkSize: CHUNK_SIZE,
    chunkFiles
  };
}

function buildTrack(definition) {
  const vocabulary =
    definition.type === "json-vocabulary"
      ? readJsonVocabularyRows(definition.sourceJsonPath, definition)
      : (() => {
          const workbookPath = findWorkbookPathFromDefinition(definition);
          const exampleLookup = definition.type === "gept-workbook" ? buildLevelExampleLookup() : null;

          return definition.type === "gept-workbook"
            ? readGeptVocabularyRows(workbookPath, definition, exampleLookup)
            : definition.type === "named-column-workbook"
              ? readNamedColumnVocabularyRows(workbookPath, definition)
            : definition.type === "toeic-workbook"
              ? readToeicVocabularyRows(workbookPath, definition)
              : readLevelVocabularyRows(workbookPath, definition.sheets);
        })();
  const chunks = chunkItems(vocabulary, CHUNK_SIZE);
  const trackOutputDir = path.join(TRACKS_ROOT, definition.id);

  fs.rmSync(trackOutputDir, { recursive: true, force: true });

  const chunkFiles = chunks.map((chunk, index) => {
    const fileName = `chunk-${String(index + 1).padStart(3, "0")}.json`;
    const relativePath = `data/tracks/${definition.id}/${fileName}`;

    writeJson(path.join(trackOutputDir, fileName), chunk);

    return {
      id: `${definition.id}-chunk-${index + 1}`,
      path: relativePath,
      wordCount: chunk.length
    };
  });

  return {
    catalogTrack: createCatalogTrack(definition, chunkFiles, vocabulary.length),
    summary: `${definition.id}: ${vocabulary.length} words, ${chunkFiles.length} chunk files`
  };
}

const catalogTracks = {};
const summaries = [];

fs.rmSync(path.join(DATA_ROOT, "vocabulary.json"), { force: true });

for (const definition of TRACK_DEFINITIONS) {
  if (definition.available) {
    const { catalogTrack, summary } = buildTrack(definition);

    catalogTracks[definition.id] = catalogTrack;
    summaries.push(summary);
    continue;
  }

  fs.rmSync(path.join(TRACKS_ROOT, definition.id), { recursive: true, force: true });
  catalogTracks[definition.id] = createCatalogTrack(definition);
}

for (const definition of PLACEHOLDER_TRACKS) {
  catalogTracks[definition.id] = {
    id: definition.id,
    available: false,
    title: definition.title,
    totalWords: 0,
    chunkSize: CHUNK_SIZE,
    chunkFiles: []
  };
}

const catalogPayload = {
  tracks: catalogTracks
};

writeJson(path.join(DATA_ROOT, "catalog.json"), {
  generatedAt: contentHash(catalogPayload),
  tracks: catalogTracks
});

console.log(`Exported tracks:\n- ${summaries.join("\n- ")}`);
