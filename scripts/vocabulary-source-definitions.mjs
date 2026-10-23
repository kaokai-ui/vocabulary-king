import fs from "node:fs";
import path from "node:path";

export const LEVEL_WORKBOOK_COLUMNS = {
  word: 1,
  meaning: 2,
  fallbackExample: 3,
  englishExample: 4
};

export const GEPT_WORKBOOK_COLUMNS = {
  word: 0,
  pos: 1,
  meaning: 2,
  grade: 4,
  primaryLevel: 7,
  fallbackExample: 8
};

export const TRACK_DEFINITIONS = [
  {
    id: "elementary",
    title: "Elementary",
    sourceWorkbookKey: "elementary-english-final-workbook",
    sourceWorkbookPath: "Source/elementary.english_final001.xlsx",
    sheets: ["elementary.english_word_m.extra"],
    type: "elementary-workbook",
    columnsByHeader: {
      number: "NO.",
      word: "英文",
      meaning: "解釋",
      englishExample: "英文例句",
      chineseExample: "中文翻譯 (台灣用語)"
    },
    fallbackLevel: "Elementary",
    available: true
  },
  {
    id: "junior-high",
    title: "Junior High",
    sourceWorkbookKey: "level-1-level-2-workbook",
    workbookPattern: /L1L2\.xlsx$/i,
    sheets: ["Level 1", "Level 2"],
    columns: LEVEL_WORKBOOK_COLUMNS,
    type: "level-workbook",
    available: true
  },
  {
    id: "senior-high",
    title: "Senior High (L3-4)",
    sourceWorkbookKey: "level-3-level-4-workbook",
    workbookPattern: /L3L6\.xlsx$/i,
    sheets: ["Level 3", "Level 4"],
    columns: LEVEL_WORKBOOK_COLUMNS,
    type: "level-workbook",
    available: true
  },
  {
    id: "senior-high-5-6",
    title: "Senior High (L5-6)",
    sourceWorkbookKey: "level-5-level-6-workbook",
    workbookPattern: /L3L6\.xlsx$/i,
    sheets: ["Level 5", "Level 6"],
    columns: LEVEL_WORKBOOK_COLUMNS,
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
    columns: GEPT_WORKBOOK_COLUMNS,
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
    columns: GEPT_WORKBOOK_COLUMNS,
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
    columns: GEPT_WORKBOOK_COLUMNS,
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
    includeSourceLevels: true,
    catalogLevelFamilies: ["基礎", "多益", "延伸", "片語"],
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
    includeSourceLevels: true,
    catalogLevelFamilies: ["商務", "延伸", "片語"],
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
    includeSourceLevels: true,
    catalogLevelFamilies: ["學術核心", "進階", "延伸", "片語"],
    available: true
  },
  {
    id: "ielts",
    title: "IELTS",
    type: "jsonl-source",
    fallbackLevel: "IELTS",
    includeSourceLevels: true,
    catalogLevelFamilies: ["學術核心", "進階", "延伸", "片語"],
    available: true
  },
  {
    id: "gre",
    title: "GRE",
    type: "jsonl-source",
    fallbackLevel: "GRE",
    includeSourceLevels: true,
    catalogLevelFamilies: ["進階"],
    available: true
  },
  {
    id: "gmat",
    title: "GMAT",
    type: "jsonl-source",
    fallbackLevel: "GMAT",
    includeSourceLevels: true,
    catalogLevelFamilies: ["進階"],
    available: true
  }
];

const workbookPathCache = new Map();

export function findSourceWorkbookPath(definition, root = process.cwd()) {
  if (definition.sourceWorkbookPath) {
    return path.resolve(root, definition.sourceWorkbookPath);
  }

  const cacheKey = `${root}\u0000${definition.workbookPattern}`;

  if (workbookPathCache.has(cacheKey)) {
    return workbookPathCache.get(cacheKey);
  }

  const workbookName = fs
    .readdirSync(root)
    .find((fileName) => definition.workbookPattern.test(fileName) && !/backup|before/i.test(fileName));

  if (!workbookName) {
    throw new Error(`Could not find a workbook matching ${definition.workbookPattern} in ${root}.`);
  }

  const resolvedPath = path.resolve(root, workbookName);
  workbookPathCache.set(cacheKey, resolvedPath);

  return resolvedPath;
}
