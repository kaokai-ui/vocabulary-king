import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import OpenCC from "opencc-js";
import xlsx from "xlsx";
import {
  findSourceWorkbookPath,
  TRACK_DEFINITIONS
} from "./vocabulary-source-definitions.mjs";

const CONVERT_TO_TAIWAN_TRADITIONAL = OpenCC.Converter({ from: "cn", to: "tw" });
const HAN_CHARACTER = /\p{Script=Han}/u;
const HAN_CHARACTERS = /\p{Script=Han}/gu;
// These common OpenCC collisions need context to choose the Taiwan Traditional form.
const HIGH_RISK_SIMPLIFIED_CHARACTERS = new Set([
  "干", "后", "里", "发", "着", "表", "余", "范", "只", "面", "斗", "准", "托", "板", "制", "征", "凶", "咸", "泄", "夸"
]);
const HIGH_RISK_CHARACTER_RATIONALES = [
  ["干", "乾／幹", "干涉、乾燥、幹部須依詞義選字。"],
  ["后", "後", "皇后與前後的「后」字形不同。"],
  ["里", "裡", "距離單位「里」與方位「裡」不同。"],
  ["发", "發／髮", "發生與頭髮的用字不同。"],
  ["着", "著", "助詞、著作等詞組在臺灣常用「著」，需看詞義確認。"],
  ["表", "錶", "表面、表演與計時器具用字不同。"],
  ["余", "餘", "姓氏／代詞與剩餘義不同。"],
  ["范", "範", "姓氏與範圍、典範義不同。"],
  ["只", "隻", "限定副詞與量詞不同。"],
  ["面", "麵", "表面、方面與麵食不同。"],
  ["斗", "鬥", "容量單位與競鬥義不同。"],
  ["准", "準", "准許、準確等詞的標準字形不同。"],
  ["托", "託", "托住與託付義不同。"],
  ["板", "闆", "板材與店家負責人不同。"],
  ["制", "製", "制度、限制與製作義不同。"],
  ["征", "徵", "遠征與徵求義不同。"],
  ["凶", "兇", "凶兆與兇惡義不同。"],
  ["咸", "鹹", "皆、全義與鹹味不同。"],
  ["泄", "洩", "排泄、泄洪與洩漏等詞須依詞義選字。"],
  ["夸", "誇", "誇獎與專有量詞「夸脫」的字形選擇不同。"]
];
// Common Taiwan characters in the old review list are valid in ordinary use and
// should not be reported just because OpenCC has a one-character alternative.
const COMMON_TAIWAN_CHARACTER_VARIANTS = new Set([
  "台", "游", "伙", "划", "布", "念", "了", "占", "家", "具", "污", "雇", "岩", "克", "卷", "么",
  "祕", "蒙", "注", "回", "霉", "采", "搜", "弦", "癡", "脣", "郁", "局", "拐"
]);
const SEPARABLE_PHRASAL_PARTICLES = new Set([
  "about", "across", "along", "around", "away", "back", "down", "in", "off", "on", "out", "over", "through", "up"
]);
const HEADWORD_PLACEHOLDERS = new Set([
  "__slot_a__", "__slot_b__", "sb", "sth", "someone", "something", "__slot_possessive__", "oneself", "..."
]);
const ARTICLE_DETERMINERS = new Set([
  "a", "an", "the", "this", "that", "these", "those", "my", "your", "his", "her", "its", "our", "their",
  "some", "any", "each", "every", "either", "neither", "one"
]);
const POSSESSIVE_PRONOUNS = new Set(["one's", "my", "your", "his", "her", "its", "our", "their"]);
const REFLEXIVE_PRONOUNS = new Set([
  "oneself", "myself", "yourself", "yourselves", "himself", "herself", "itself", "ourselves", "themselves"
]);
const BE_FORM_SEQUENCES = [
  ["will", "have", "been"], ["would", "have", "been"], ["could", "have", "been"], ["should", "have", "been"],
  ["might", "have", "been"], ["may", "have", "been"], ["must", "have", "been"], ["shall", "have", "been"],
  ["has", "been"], ["have", "been"], ["had", "been"], ["is", "being"], ["are", "being"], ["was", "being"], ["were", "being"],
  ["will", "be"], ["would", "be"], ["could", "be"], ["should", "be"], ["might", "be"], ["may", "be"], ["must", "be"], ["shall", "be"],
  ["am"], ["is"], ["are"], ["was"], ["were"], ["be"], ["been"], ["being"]
];
const POS_CODES = ["interj", "modal", "prep", "pron", "conj", "abbr", "aux", "art", "det", "num", "phr", "adj", "adv", "vt", "vi", "int", "ad", "n", "v", "a"];
const POS_PREFIX = new RegExp(
  `^(?:\\s*(?:${POS_CODES.join("|")})\\.?(?=\\s|\\/|,|;|&|$)\\s*(?:(?:\\/|,|;|&|\\band\\b)\\s*)?)+`,
  "i"
);

const IRREGULAR_WORD_FORMS = {
  am: ["am", "is", "are", "was", "were", "been", "being"],
  be: ["am", "is", "are", "was", "were", "been", "being"],
  is: ["am", "is", "are", "was", "were", "been", "being"],
  are: ["am", "is", "are", "was", "were", "been", "being"],
  was: ["am", "is", "are", "was", "were", "been", "being"],
  were: ["am", "is", "are", "was", "were", "been", "being"],
  have: ["has", "had", "having"],
  do: ["does", "did", "done", "doing"],
  go: ["goes", "went", "gone", "going"],
  say: ["says", "said", "saying"],
  make: ["makes", "made", "making"],
  take: ["takes", "took", "taken", "taking"],
  come: ["comes", "came", "coming"],
  see: ["sees", "saw", "seen", "seeing"],
  get: ["gets", "got", "gotten", "getting"],
  give: ["gives", "gave", "given", "giving"],
  know: ["knows", "knew", "known", "knowing"],
  write: ["writes", "wrote", "written", "writing"],
  eat: ["eats", "ate", "eaten", "eating"],
  drink: ["drinks", "drank", "drunk", "drinking"],
  begin: ["begins", "began", "begun", "beginning"],
  break: ["breaks", "broke", "broken", "breaking"],
  choose: ["chooses", "chose", "chosen", "choosing"],
  drive: ["drives", "drove", "driven", "driving"],
  fall: ["falls", "fell", "fallen", "falling"],
  feel: ["feels", "felt", "feeling"],
  find: ["finds", "found", "finding"],
  fly: ["flies", "flew", "flown", "flying"],
  forget: ["forgets", "forgot", "forgotten", "forgetting"],
  freeze: ["freezes", "froze", "frozen", "freezing"],
  grow: ["grows", "grew", "grown", "growing"],
  hear: ["hears", "heard", "hearing"],
  keep: ["keeps", "kept", "keeping"],
  leave: ["leaves", "left", "leaving"],
  lose: ["loses", "lost", "losing"],
  meet: ["meets", "met", "meeting"],
  pay: ["pays", "paid", "paying"],
  put: ["puts", "put", "putting"],
  run: ["runs", "ran", "run", "running"],
  send: ["sends", "sent", "sending"],
  sit: ["sits", "sat", "sitting"],
  speak: ["speaks", "spoke", "spoken", "speaking"],
  stand: ["stands", "stood", "standing"],
  swim: ["swims", "swam", "swum", "swimming"],
  teach: ["teaches", "taught", "teaching"],
  tell: ["tells", "told", "telling"],
  think: ["thinks", "thought", "thinking"],
  wear: ["wears", "wore", "worn", "wearing"],
  win: ["wins", "won", "winning"],
  build: ["builds", "built", "building"],
  buy: ["buys", "bought", "buying"],
  catch: ["catches", "caught", "catching"],
  fight: ["fights", "fought", "fighting"],
  lead: ["leads", "led", "leading"],
  read: ["reads", "read", "reading"],
  set: ["sets", "set", "setting"],
  shut: ["shuts", "shut", "shutting"],
  sleep: ["sleeps", "slept", "sleeping"],
  spend: ["spends", "spent", "spending"],
  understand: ["understands", "understood", "understanding"],
  bring: ["brings", "brought", "bringing"],
  deal: ["deals", "dealt", "dealing"],
  draw: ["draws", "drew", "drawn", "drawing"],
  hide: ["hides", "hid", "hidden", "hiding"],
  hold: ["holds", "held", "holding"],
  lay: ["lays", "laid", "laying"],
  lie: ["lies", "lay", "lain", "lying"],
  lend: ["lends", "lent", "lending"],
  seek: ["seeks", "sought", "seeking"],
  shake: ["shakes", "shook", "shaken", "shaking"],
  show: ["shows", "showed", "shown", "showing"],
  steal: ["steals", "stole", "stolen", "stealing"],
  strike: ["strikes", "struck", "stricken", "striking"],
  throw: ["throws", "threw", "thrown", "throwing"],
  wake: ["wakes", "woke", "woken", "waking"],
  child: ["children"],
  man: ["men"],
  woman: ["women"],
  person: ["people"],
  mouse: ["mice"],
  tooth: ["teeth"],
  foot: ["feet"],
  goose: ["geese"],
  ox: ["oxen"],
  good: ["better", "best"],
  bad: ["worse", "worst"],
  far: ["farther", "farthest", "further", "furthest"],
  little: ["less", "least"],
  many: ["more", "most"],
  much: ["more", "most"],
  old: ["older", "oldest", "elder", "eldest"]
};

const REPORT_CATEGORIES = [
  ["simplified-script", "簡體字（程式判定）"],
  ["simplified-manual-review", "簡繁一字多義（需人工確認）"],
  ["conversion-term-definite", "疑似轉換錯誤／大陸用語：確定錯誤"],
  ["conversion-term-review", "疑似轉換錯誤／大陸用語：需人工確認"],
  ["example-word-missing", "例句未出現單字或變化形"],
  ["format", "格式"],
  ["duplicate-word-pos", "匯出後同單字同詞性重複"],
  ["duplicate-example", "不同單字重複使用例句"],
  ["translation-suspect", "中文翻譯太短或疑似沒翻"]
];

const CONVERSION_AND_MAINLAND_TERM_RULES = [
  {
    term: "錶演",
    suggestion: "表演",
    certainty: "definite",
    rationale: "「錶」指手錶表面；固定詞「表演」使用「表」。"
  },
  {
    term: "錶示",
    suggestion: "表示",
    certainty: "definite",
    rationale: "固定詞「表示」使用「表」，「錶」指手錶表面。"
  },
  {
    term: "錶達",
    suggestion: "表達",
    certainty: "definite",
    rationale: "固定詞「表達」使用「表」，「錶」指手錶表面。"
  },
  {
    term: "髮生",
    suggestion: "發生",
    certainty: "definite",
    rationale: "「髮」指頭髮；固定詞「發生」使用「發」。"
  },
  {
    term: "髮展",
    suggestion: "發展",
    certainty: "definite",
    rationale: "「髮」指頭髮；固定詞「發展」使用「發」。"
  },
  {
    term: "乾涉",
    suggestion: "干涉",
    certainty: "definite",
    rationale: "此詞使用「干涉」；「乾」用於乾燥、乾杯等義項。"
  },
  {
    term: "乾預",
    suggestion: "干預",
    certainty: "definite",
    rationale: "此詞使用「干預」；「乾」用於乾燥、乾杯等義項。"
  },
  {
    term: "乾擾",
    suggestion: "干擾",
    certainty: "definite",
    rationale: "此詞使用「干擾」；「乾」用於乾燥、乾杯等義項。"
  },
  {
    term: "乾部",
    suggestion: "幹部",
    certainty: "definite",
    rationale: "組織職務使用「幹部」；「乾」用於乾燥、乾杯等義項。"
  },
  {
    term: "透過了…檢查／考試",
    pattern: /透過了[^，,。；;！？!?]{0,16}(?:檢查|考試)/u,
    suggestion: "通過了…檢查／考試",
    certainty: "definite",
    rationale: "依主線提供的安全檢查例子延伸為「透過了…檢查／考試」搭配；表示達成檢查或考試要求時用「通過」。"
  },
  {
    term: "透過安全檢查",
    pattern: /透過安全檢查/u,
    suggestion: "通過安全檢查（若表示檢查合格）",
    certainty: "review",
    rationale: "可能表示檢查合格，也可能表示藉由檢查程序，依句意確認。"
  },
  {
    term: "複印件",
    suggestion: "影本",
    certainty: "definite",
    rationale: "臺灣一般稱「影本」；「複印件」是大陸常見說法。"
  },
  {
    term: "複印",
    pattern: /複印(?!件)/u,
    suggestion: "影印",
    certainty: "definite",
    rationale: "臺灣一般稱「影印」；「複印」是大陸常見說法。"
  },
  {
    term: "視頻",
    suggestion: "影片",
    certainty: "definite",
    rationale: "臺灣一般稱「影片」；「視頻」是大陸常見說法。"
  },
  {
    term: "軟件",
    suggestion: "軟體",
    certainty: "definite",
    rationale: "臺灣一般稱「軟體」；「軟件」是大陸常見說法。"
  },
  {
    term: "信息",
    suggestion: "資訊",
    certainty: "definite",
    rationale: "一般資訊語境下臺灣常用「資訊」；「信息」是大陸常見用語。"
  },
  {
    term: "網絡",
    suggestion: "網路",
    certainty: "definite",
    rationale: "臺灣一般稱「網路」；「網絡」是大陸常見說法。"
  },
  {
    term: "打印",
    suggestion: "列印",
    certainty: "definite",
    rationale: "臺灣一般稱「列印」；「打印」是大陸常見說法。"
  },
  {
    term: "服務器",
    suggestion: "伺服器",
    certainty: "definite",
    rationale: "臺灣一般稱「伺服器」；「服務器」是大陸常見說法。"
  },
  {
    term: "默認",
    suggestion: "預設",
    certainty: "definite",
    rationale: "軟體設定語境下臺灣一般稱「預設」；「默認」是大陸常見說法。"
  },
  {
    term: "後臺",
    suggestion: "後台（軟體介面）",
    certainty: "review",
    rationale: "軟體介面通常寫「後台」，但「後臺」可指舞臺後方，需看語境。"
  },
  {
    term: "改造過程",
    suggestion: "整修過程（若指建物修繕）",
    certainty: "review",
    rationale: "「改造」可為一般中文；建物修繕語境常用「整修」，需看上下文。"
  },
  {
    term: "項目",
    suggestion: "計畫／專案（依語境）",
    certainty: "review",
    rationale: "「項目」可指台灣常用的比賽項目，也可能是大陸用語，需看語境。"
  },
  {
    term: "質量",
    suggestion: "品質（若指 quality）",
    certainty: "review",
    rationale: "台灣常用「品質」，但理化語境的「質量」是正確術語。"
  },
  {
    term: "數據",
    suggestion: "資料（依語境）",
    certainty: "review",
    rationale: "台灣多用「資料」，部分統計或技術語境也會使用「數據」。"
  },
  {
    term: "優化",
    suggestion: "最佳化（依語境）",
    certainty: "review",
    rationale: "台灣也使用「優化」，部分技術文件偏好「最佳化」，需看語境。"
  }
];

function asText(value) {
  return String(value ?? "");
}

function hasAnyValue(values) {
  return values.some((value) => asText(value).trim().length > 0);
}

function readRowsWithSourceNumbers(sheet) {
  if (!sheet?.["!ref"]) {
    return [];
  }

  const range = xlsx.utils.decode_range(sheet["!ref"]);
  const rows = xlsx.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: true
  });

  return rows.map((cells, index) => ({
    cells,
    sourceRow: range.s.r + index + 1
  }));
}

function relativeWorkbookPath(workbookPath) {
  return path.relative(process.cwd(), workbookPath).replaceAll("\\", "/");
}

function buildRecord(definition, workbookPath, worksheet, sourceRow, fields) {
  const sourceWorkbook = relativeWorkbookPath(workbookPath);
  const source = { sourceWorkbook, worksheet, row: sourceRow };

  return {
    track: definition.id,
    id: `${definition.id}:${worksheet}:${sourceRow}`,
    word: asText(fields.word),
    meaning: asText(fields.meaning),
    pos: asText(fields.pos),
    exportLevel: asText(fields.exportLevel ?? definition.fallbackLevel ?? worksheet),
    englishExample: asText(fields.englishExample),
    chineseTranslation: asText(fields.chineseTranslation),
    example: asText(fields.example),
    separateTranslation: Boolean(fields.separateTranslation),
    sourceWorkbook,
    worksheet,
    row: sourceRow,
    exampleSource: fields.exampleSource ?? source,
    rawFields: fields.rawFields ?? {}
  };
}

function makeCombinedRecord(definition, workbookPath, worksheet, sourceRow, fields) {
  const example = asText(fields.example);
  const parsed = parseTrailingTranslation(example);

  return buildRecord(definition, workbookPath, worksheet, sourceRow, {
    ...fields,
    englishExample: parsed.english,
    chineseTranslation: parsed.translation,
    example,
    separateTranslation: false
  });
}

function makeSeparateTranslationRecord(definition, workbookPath, worksheet, sourceRow, fields) {
  const englishExample = asText(fields.englishExample);
  const chineseTranslation = asText(fields.chineseTranslation);
  const example = englishExample && chineseTranslation
    ? `${englishExample} (${chineseTranslation})`
    : englishExample || chineseTranslation;

  return buildRecord(definition, workbookPath, worksheet, sourceRow, {
    ...fields,
    englishExample,
    chineseTranslation,
    example,
    separateTranslation: true
  });
}

function readIndexedWorkbookRows(definition, workbookPath) {
  const workbook = xlsx.readFile(workbookPath);
  const entries = [];

  for (const worksheet of definition.sheets?.length ? definition.sheets : workbook.SheetNames) {
    const sheet = workbook.Sheets[worksheet];

    if (!sheet) {
      throw new Error(`Missing worksheet ${worksheet} in ${workbookPath}`);
    }

    const rows = readRowsWithSourceNumbers(sheet);

    if (definition.type === "level-workbook") {
      for (const { cells, sourceRow } of rows.slice(1)) {
        const columns = definition.columns;
        if (!hasAnyValue([cells[columns.word], cells[columns.meaning], cells[columns.englishExample], cells[columns.fallbackExample]])) {
          continue;
        }

        const word = asText(cells[columns.word]);
        const meaning = asText(cells[columns.meaning]);
        const example = asText(cells[columns.englishExample] || cells[columns.fallbackExample] || "");
        entries.push(makeCombinedRecord(definition, workbookPath, worksheet, sourceRow, {
          word,
          meaning,
          exportLevel: worksheet.replace(/^Level\s+/u, "L"),
          example,
          rawFields: { word, meaning, example }
        }));
      }

      continue;
    }

    const headerCells = rows[0]?.cells ?? [];
    const headerIndexes = new Map(headerCells.map((header, index) => [asText(header), index]));
    const columns = definition.columnsByHeader;

    for (const { cells, sourceRow } of rows.slice(1)) {
      const columnIndex = (key) => headerIndexes.get(columns[key]);
      const word = asText(cells[columnIndex("word")]);
      const meaning = asText(cells[columnIndex("meaning")]);
      const englishExample = asText(cells[columnIndex("englishExample")]);
      const chineseTranslation = asText(cells[columnIndex("chineseExample")]);

      if (!hasAnyValue([word, meaning, englishExample, chineseTranslation])) {
        continue;
      }

      entries.push(makeSeparateTranslationRecord(definition, workbookPath, worksheet, sourceRow, {
        word,
        meaning,
        exportLevel: definition.fallbackLevel ?? worksheet,
        englishExample,
        chineseTranslation,
        rawFields: { word, meaning, englishExample, chineseTranslation }
      }));
    }
  }

  return entries;
}

function readToeicWorkbookRows(definition, workbookPath) {
  const workbook = xlsx.readFile(workbookPath);
  const entries = [];
  const columns = definition.columns;

  for (const worksheet of definition.sheets ?? [workbook.SheetNames[0]]) {
    const sheet = workbook.Sheets[worksheet];
    if (!sheet) {
      throw new Error(`Missing worksheet ${worksheet} in ${workbookPath}`);
    }

    const rows = readRowsWithSourceNumbers(sheet);

    for (const { cells, sourceRow } of rows.slice(1)) {
      const word = asText(cells[columns.word]);
      const pos = columns.pos == null ? "" : asText(cells[columns.pos]);
      const rawMeaning = asText(cells[columns.meaning]);
      const englishExample = columns.englishExample == null ? "" : asText(cells[columns.englishExample]);
      const chineseTranslation = columns.chineseExample == null ? "" : asText(cells[columns.chineseExample]);

      if (!hasAnyValue([word, pos, rawMeaning, englishExample, chineseTranslation])) {
        continue;
      }

      const meaning = pos ? `${pos}. ${rawMeaning}` : rawMeaning;
      const exportLevel = columns.level != null
        ? asText(cells[columns.level]).trim() || definition.fallbackLevel || definition.id
        : definition.fallbackLevel || definition.id;
      entries.push(makeSeparateTranslationRecord(definition, workbookPath, worksheet, sourceRow, {
        word,
        meaning,
        pos,
        exportLevel,
        englishExample,
        chineseTranslation,
        rawFields: { word, meaning: rawMeaning, pos, englishExample, chineseTranslation }
      }));
    }
  }

  return entries;
}

function buildLevelExampleLookup(root) {
  const lookup = new Map();
  const sourceDefinitions = TRACK_DEFINITIONS.filter((definition) =>
    ["junior-high", "senior-high", "senior-high-5-6"].includes(definition.id)
  );
  const loadedSheets = new Set();

  for (const definition of sourceDefinitions) {
    const workbookPath = findSourceWorkbookPath(definition, root);
    const workbook = xlsx.readFile(workbookPath);

    for (const worksheet of definition.sheets) {
      const sheetKey = `${workbookPath}\u0000${worksheet}`;
      if (loadedSheets.has(sheetKey)) {
        continue;
      }
      loadedSheets.add(sheetKey);

      const sheet = workbook.Sheets[worksheet];
      if (!sheet) {
        throw new Error(`Missing worksheet ${worksheet} in ${workbookPath}`);
      }

      const columns = definition.columns;
      const examplesByWord = new Map();
      for (const { cells, sourceRow } of readRowsWithSourceNumbers(sheet).slice(1)) {
        const word = asText(cells[columns.word]).trim();
        const example = asText(cells[columns.englishExample] || cells[columns.fallbackExample]).trim();
        if (!word || !example) {
          continue;
        }

        for (const variant of expandOptionalWordForms(word)) {
          const key = normalizedHeadword(variant);
          if (key && !examplesByWord.has(key)) {
            examplesByWord.set(key, {
              example,
              source: {
                sourceWorkbook: relativeWorkbookPath(workbookPath),
                worksheet,
                row: sourceRow
              }
            });
          }
        }
      }
      lookup.set(worksheet, examplesByWord);
    }
  }

  return lookup;
}

export function resolveGeptExample(word, primaryLevel, fallbackExample, fallbackSource, exampleLookup, preferFallback = false) {
  if (preferFallback && asText(fallbackExample).trim()) {
    return { example: fallbackExample, source: fallbackSource };
  }

  const normalizedLevel = asText(primaryLevel).trim();
  const levelExamples = exampleLookup.get(normalizedLevel);

  if (levelExamples) {
    for (const variant of expandOptionalWordForms(word)) {
      const match = levelExamples.get(normalizedHeadword(variant));
      if (match) {
        return match;
      }
    }
  }

  return { example: fallbackExample, source: fallbackSource };
}

function exportedGeptLevel(primaryLevel, fallbackLevel) {
  const match = /^Level\s+(\d+)$/iu.exec(asText(primaryLevel).trim());
  return match ? `L${match[1]}` : fallbackLevel;
}

function readGeptWorkbookRows(definition, workbookPath, root) {
  const workbook = xlsx.readFile(workbookPath);
  const exampleLookup = buildLevelExampleLookup(root);
  const entries = [];
  const worksheet = definition.sheets[0];
  const sheet = workbook.Sheets[worksheet];

  if (!sheet) {
    throw new Error(`Missing worksheet ${worksheet} in ${workbookPath}`);
  }

  const columns = definition.columns;
  const rows = readRowsWithSourceNumbers(sheet);

  for (const { cells, sourceRow } of rows.slice(1)) {
    const word = asText(cells[columns.word]);
    const pos = asText(cells[columns.pos]);
    const rawMeaning = asText(cells[columns.meaning]);
    const grade = asText(cells[columns.grade]).trim();
    const fallbackExample = asText(cells[columns.fallbackExample]);

    if (grade !== definition.geptGrade || !hasAnyValue([word, pos, rawMeaning, fallbackExample])) {
      continue;
    }

    const fallbackSource = {
      sourceWorkbook: relativeWorkbookPath(workbookPath),
      worksheet,
      row: sourceRow
    };
    const resolvedExample = resolveGeptExample(
      word,
      cells[columns.primaryLevel],
      fallbackExample,
      fallbackSource,
      exampleLookup,
      definition.id === "gept-high-intermediate"
    );

    entries.push(makeCombinedRecord(definition, workbookPath, worksheet, sourceRow, {
      word,
      meaning: pos ? `${pos} ${rawMeaning}` : rawMeaning,
      pos,
      exportLevel: exportedGeptLevel(cells[columns.primaryLevel], definition.geptGrade),
      example: resolvedExample.example,
      exampleSource: resolvedExample.source,
      rawFields: { word, meaning: rawMeaning, pos, example: resolvedExample.example }
    }));
  }

  return entries;
}

export function readTrackSourceRows(definition, root = process.cwd()) {
  const workbookPath = findSourceWorkbookPath(definition, root);

  if (!fs.existsSync(workbookPath)) {
    throw new Error(`Source workbook does not exist: ${workbookPath}`);
  }

  if (definition.type === "level-workbook") {
    return readIndexedWorkbookRows(definition, workbookPath);
  }
  if (definition.type === "gept-workbook") {
    return readGeptWorkbookRows(definition, workbookPath, root);
  }
  if (definition.type === "toeic-workbook") {
    return readToeicWorkbookRows(definition, workbookPath);
  }
  return readIndexedWorkbookRows(definition, workbookPath);
}

export function readAllTrackSourceRows(root = process.cwd()) {
  return TRACK_DEFINITIONS.flatMap((definition) => readTrackSourceRows(definition, root));
}

export function parseTrailingTranslation(example) {
  const text = asText(example).trim();
  let closingIndex = text.length - 1;

  while (closingIndex >= 0 && /[.!?。！？]/u.test(text[closingIndex])) {
    closingIndex -= 1;
  }

  const closing = text[closingIndex];
  const opening = closing === ")" ? "(" : closing === "）" ? "（" : "";

  if (!opening) {
    return { english: text, translation: "", hasTranslationWrapper: false };
  }

  let depth = 0;
  for (let index = closingIndex; index >= 0; index -= 1) {
    if (text[index] === closing) {
      depth += 1;
    } else if (text[index] === opening) {
      depth -= 1;
      if (depth === 0) {
        return {
          english: text.slice(0, index).trim(),
          translation: text.slice(index + 1, closingIndex).trim(),
          hasTranslationWrapper: true
        };
      }
    }
  }

  return { english: text, translation: "", hasTranslationWrapper: false };
}

function editChangedSourceCharacters(original, converted) {
  const sourceChars = Array.from(original);
  const convertedChars = Array.from(converted);
  const rows = Array.from({ length: sourceChars.length + 1 }, () => new Uint16Array(convertedChars.length + 1));

  for (let i = sourceChars.length; i >= 0; i -= 1) {
    rows[i][convertedChars.length] = sourceChars.length - i;
  }
  for (let j = convertedChars.length; j >= 0; j -= 1) {
    rows[sourceChars.length][j] = convertedChars.length - j;
  }

  for (let i = sourceChars.length - 1; i >= 0; i -= 1) {
    for (let j = convertedChars.length - 1; j >= 0; j -= 1) {
      const replaceCost = sourceChars[i] === convertedChars[j] ? 0 : 1;
      rows[i][j] = Math.min(
        rows[i + 1][j + 1] + replaceCost,
        rows[i + 1][j] + 1,
        rows[i][j + 1] + 1
      );
    }
  }

  const changed = [];
  let i = 0;
  let j = 0;

  while (i < sourceChars.length || j < convertedChars.length) {
    if (i < sourceChars.length && j < convertedChars.length && sourceChars[i] === convertedChars[j]) {
      i += 1;
      j += 1;
      continue;
    }

    if (i < sourceChars.length && j < convertedChars.length && rows[i][j] === rows[i + 1][j + 1] + 1) {
      changed.push({ character: sourceChars[i], index: i });
      i += 1;
      j += 1;
      continue;
    }

    if (i < sourceChars.length && rows[i][j] === rows[i + 1][j] + 1) {
      changed.push({ character: sourceChars[i], index: i });
      i += 1;
      continue;
    }

    j += 1;
  }

  return changed;
}

function isCommonTaiwanContextVariant(original, index, character) {
  if (COMMON_TAIWAN_CHARACTER_VARIANTS.has(character)) {
    return true;
  }
  if (character === "征" && original[index - 1] === "遠") {
    return true;
  }
  if (character === "夸" && original[index + 1] === "脫") {
    return true;
  }
  if (character === "采" && original[index - 1] === "打") {
    return true;
  }
  if (character === "郁" && original[index - 1] === "濃") {
    return true;
  }
  return false;
}

export function classifySimplifiedText(text) {
  const original = asText(text);
  if (!original) {
    return { definite: [], manualReview: [] };
  }

  const converted = CONVERT_TO_TAIWAN_TRADITIONAL(original);
  if (converted === original) {
    return { definite: [], manualReview: [] };
  }

  const changed = editChangedSourceCharacters(original, converted)
    .filter(({ character }) => HAN_CHARACTER.test(character));
  const definite = new Set();
  const manualReview = new Set();

  for (const { character, index } of changed) {
    if (isCommonTaiwanContextVariant(original, index, character)) {
      continue;
    }
    if (HIGH_RISK_SIMPLIFIED_CHARACTERS.has(character)) {
      manualReview.add(character);
    } else if (CONVERT_TO_TAIWAN_TRADITIONAL(character) !== character) {
      definite.add(character);
    }
  }

  return { definite: Array.from(definite), manualReview: Array.from(manualReview) };
}

function scanBracketFormat(text) {
  const openingToClosing = new Map([["(", ")"], ["（", "）"]]);
  const closings = new Map([[")", "("], ["）", "（"]]);
  const stack = [];
  let hasAscii = false;
  let hasFullWidth = false;
  let unbalanced = false;
  let mismatched = false;

  for (const character of asText(text)) {
    if (character === "(" || character === ")") {
      hasAscii = true;
    }
    if (character === "（" || character === "）") {
      hasFullWidth = true;
    }

    if (openingToClosing.has(character)) {
      stack.push(character);
    } else if (closings.has(character)) {
      const opening = stack.pop();
      if (opening !== closings.get(character)) {
        unbalanced = true;
        mismatched = true;
      }
    }
  }

  const hasUnbalancedBrackets = unbalanced || stack.length > 0;
  return {
    unbalanced: hasUnbalancedBrackets,
    mixed: mismatched || (hasAscii && hasFullWidth && hasUnbalancedBrackets)
  };
}

function normalizeTranslationComparison(text) {
  return asText(text).toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function countHanCharacters(text) {
  return Array.from(asText(text).matchAll(HAN_CHARACTERS)).length;
}

function sentenceEndsWithEnglishPunctuation(text) {
  const cleaned = asText(text).trim().replace(/[\s\])}'"”’」』]+$/gu, "");
  return /[.!?]$/u.test(cleaned);
}

function normalizeEnglishTokens(text) {
  return asText(text)
    .toLocaleLowerCase()
    .replace(/[‐‑‒–—-]/gu, " ")
    .match(/[a-z]+(?:'[a-z]+)?/gu) ?? [];
}

function expandOptionalWordForms(word) {
  const alternatives = [];

  for (const slashPart of asText(word).split("/")) {
    let variants = new Set([slashPart.trim()]);

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
        next.add(`${variant.slice(0, match.index)}${variant.slice(match.index + match[0].length)}`);
        next.add(`${variant.slice(0, match.index)}${match[1]}${variant.slice(match.index + match[0].length)}`);
      }

      variants = next;
      if (!changed) {
        break;
      }
    }

    alternatives.push(...variants);
  }

  return alternatives;
}

function isConsonantY(word) {
  return word.length > 1 && word.endsWith("y") && !/[aeiou]y$/u.test(word);
}

function shouldDoubleFinalConsonant(word) {
  const vowelGroups = word.match(/[aeiou]+/gu) ?? [];
  return vowelGroups.length === 1 && /^[^aeiou][aeiou][^aeiouwxy]$/u.test(word.slice(-3));
}

function regularInflections(word) {
  const forms = new Set([word]);
  const doubleFinal = shouldDoubleFinalConsonant(word);
  const consonantY = isConsonantY(word);

  if (consonantY) {
    forms.add(`${word.slice(0, -1)}ies`);
    forms.add(`${word.slice(0, -1)}ied`);
    forms.add(`${word.slice(0, -1)}ier`);
    forms.add(`${word.slice(0, -1)}iest`);
    forms.add(`${word}ing`);
  } else {
    const pluralEnding = /(?:s|x|z|ch|sh|o)$/u.test(word) ? "es" : "s";
    forms.add(`${word}${pluralEnding}`);
    forms.add(`${word}${word.endsWith("e") ? "d" : `${doubleFinal ? word.slice(-1) : ""}ed`}`);
    forms.add(`${word.endsWith("e") ? word.slice(0, -1) : word}${doubleFinal ? word.slice(-1) : ""}ing`);

    if (word.endsWith("ie")) {
      forms.add(`${word.slice(0, -2)}ying`);
    }
    if (word.endsWith("e")) {
      forms.add(`${word}r`);
      forms.add(`${word}st`);
    } else {
      const stem = doubleFinal ? `${word}${word.slice(-1)}` : word;
      forms.add(`${stem}er`);
      forms.add(`${stem}est`);
    }
  }

  return forms;
}

function inflectionsForFirstToken(word) {
  const base = word.toLocaleLowerCase();
  const irregular = IRREGULAR_WORD_FORMS[base];
  return irregular ? new Set([base, ...irregular]) : regularInflections(base);
}

function normalizeHeadwordTokens(text) {
  const tokens = asText(text)
    .replace(/[’‘]/gu, "'")
    .replace(/[‐‑‒–—-]/gu, " ")
    .match(/[A-Za-z]+(?:'[A-Za-z]+)?|\.{3,}/gu) ?? [];

  return tokens.map((token) => {
    if (token === "A") {
      return "__slot_a__";
    }
    if (token === "B") {
      return "__slot_b__";
    }

    const lower = token.toLocaleLowerCase();
    if (["one's", "sb's", "sth's", "someone's", "something's"].includes(lower)) {
      return "__slot_possessive__";
    }
    return lower;
  });
}

function formsForHeadword(word) {
  const forms = [];

  for (const alternative of expandOptionalWordForms(word)) {
    const tokens = normalizeHeadwordTokens(alternative);
    if (!tokens.length) {
      continue;
    }

    const firstToken = tokens[0];
    const firstTokenForms = HEADWORD_PLACEHOLDERS.has(firstToken) || firstToken === "be" || ["a", "an", "the"].includes(firstToken)
      ? [firstToken]
      : inflectionsForFirstToken(firstToken);
    for (const inflectedFirstToken of firstTokenForms) {
      forms.push([inflectedFirstToken, ...tokens.slice(1)]);
    }
  }

  return forms;
}

function placeholderLengths(token, sentenceTokens, sentenceIndex) {
  if (token === "...") {
    const maxLength = Math.min(6, sentenceTokens.length - sentenceIndex);
    return Array.from({ length: maxLength + 1 }, (_, index) => index);
  }

  if (token === "__slot_possessive__") {
    const candidate = sentenceTokens[sentenceIndex];
    return candidate && (POSSESSIVE_PRONOUNS.has(candidate) || /[a-z]+'s$/u.test(candidate)) ? [1] : [];
  }

  if (token === "oneself") {
    return REFLEXIVE_PRONOUNS.has(sentenceTokens[sentenceIndex]) ? [1] : [];
  }

  const maxLength = Math.min(6, sentenceTokens.length - sentenceIndex);
  return Array.from({ length: maxLength }, (_, index) => index + 1);
}

function matchesHeadwordFormAt(sentenceTokens, form, startIndex) {
  const memo = new Map();

  function visit(formIndex, sentenceIndex) {
    if (formIndex === form.length) {
      return true;
    }
    if (sentenceIndex >= sentenceTokens.length) {
      return false;
    }

    const stateKey = `${formIndex}:${sentenceIndex}`;
    if (memo.has(stateKey)) {
      return memo.get(stateKey);
    }

    const token = form[formIndex];
    let matched = false;

    if (HEADWORD_PLACEHOLDERS.has(token)) {
      for (const length of placeholderLengths(token, sentenceTokens, sentenceIndex)) {
        if (visit(formIndex + 1, sentenceIndex + length)) {
          matched = true;
          break;
        }
      }
    } else if (token === "be") {
      matched = BE_FORM_SEQUENCES.some((sequence) =>
        sequence.every((part, offset) => sentenceTokens[sentenceIndex + offset] === part)
        && visit(formIndex + 1, sentenceIndex + sequence.length)
      );
    } else if (formIndex === 0 && form.length > 1 && ["a", "an", "the"].includes(token)) {
      if (ARTICLE_DETERMINERS.has(sentenceTokens[sentenceIndex])) {
        for (let modifierCount = 0; modifierCount <= 3; modifierCount += 1) {
          if (visit(formIndex + 1, sentenceIndex + 1 + modifierCount)) {
            matched = true;
            break;
          }
        }
      }
    } else if (sentenceTokens[sentenceIndex] === token) {
      matched = visit(formIndex + 1, sentenceIndex + 1);
    }

    memo.set(stateKey, matched);
    return matched;
  }

  return visit(0, startIndex);
}

export function exampleUsesHeadword(word, englishExample) {
  const sentenceTokens = normalizeEnglishTokens(englishExample);
  if (!sentenceTokens.length) {
    return false;
  }

  for (const form of formsForHeadword(word)) {
    for (let index = 0; index < sentenceTokens.length; index += 1) {
      if (matchesHeadwordFormAt(sentenceTokens, form, index)) {
        return true;
      }
    }

    if (form.length === 2 && SEPARABLE_PHRASAL_PARTICLES.has(form[1])) {
      for (let index = 0; index < sentenceTokens.length; index += 1) {
        if (sentenceTokens[index] !== form[0]) {
          continue;
        }

        for (let gap = 1; gap <= 5; gap += 1) {
          if (sentenceTokens[index + gap + 1] === form[1]) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

function exampleSource(record) {
  return record.exampleSource ?? record;
}

function addFinding(findings, record, check, issue, originalText, source = record) {
  findings.push({
    track: record.track,
    id: record.id,
    word: record.word,
    sourceWorkbook: source.sourceWorkbook ?? record.sourceWorkbook,
    worksheet: source.worksheet ?? record.worksheet,
    row: source.row ?? record.row,
    check,
    issue,
    originalText: asText(originalText)
  });
}

function checkSimplifiedText(findings, record, fieldName, text, source = record) {
  const { definite, manualReview } = classifySimplifiedText(text);
  if (definite.length) {
    addFinding(
      findings,
      record,
      "simplified-script",
      `${fieldName} 含疑似簡體字：${definite.join("、")}`,
      text,
      source
    );
  }
  if (manualReview.length) {
    addFinding(
      findings,
      record,
      "simplified-manual-review",
      `${fieldName} 含簡繁一字多義字，需人工確認：${manualReview.join("、")}`,
      text,
      source
    );
  }
}

export function checkConversionAndMainlandTerms(record) {
  const findings = [];
  const chineseFields = [
    ["中文意思", record.meaning, record],
    ["中文翻譯", record.chineseTranslation, exampleSource(record)]
  ];

  for (const [fieldName, rawText, source] of chineseFields) {
    const text = asText(rawText);
    if (!text) {
      continue;
    }

    for (const rule of CONVERSION_AND_MAINLAND_TERM_RULES) {
      let matches = [];
      if (rule.pattern) {
        const matcher = new RegExp(rule.pattern.source, rule.pattern.flags.includes("g") ? rule.pattern.flags : `${rule.pattern.flags}g`);
        matches = Array.from(text.matchAll(matcher), (match) => match[0]);
      } else if (text.includes(rule.term)) {
        matches = [rule.term];
      }

      for (const match of new Set(matches)) {
        const category = rule.certainty === "definite" ? "conversion-term-definite" : "conversion-term-review";
        const issue = `${fieldName}「${match}」疑似用詞問題；建議：${rule.suggestion}。理由：${rule.rationale}`;
        addFinding(findings, record, category, issue, text, source);
      }
    }
  }

  return findings;
}

function extractPartOfSpeech(record) {
  const candidate = record.pos || record.meaning;
  const prefix = POS_PREFIX.exec(asText(candidate));
  if (!prefix) {
    return ["unknown"];
  }

  const tags = Array.from(prefix[0].matchAll(new RegExp(`\\b(${POS_CODES.join("|")})\\b`, "gi")), (match) => match[1].toLowerCase());
  return tags.length ? Array.from(new Set(tags)) : ["unknown"];
}

function checkFormat(findings, record) {
  const translationSource = exampleSource(record);
  if (!record.word.trim()) {
    addFinding(findings, record, "format", "英文單字欄位空白", record.rawFields.word ?? "");
  }
  if (!asText(record.rawFields.meaning ?? record.meaning).trim()) {
    addFinding(findings, record, "format", "中文意思欄位空白", record.rawFields.meaning ?? "");
  }
  if (!record.example.trim()) {
    addFinding(findings, record, "format", "例句欄位空白", record.rawFields.example ?? "", translationSource);
  }
  if (!record.englishExample.trim()) {
    addFinding(findings, record, "format", "英文例句欄位空白", record.rawFields.englishExample ?? record.rawFields.example ?? "", translationSource);
  }

  for (const [fieldName, value] of Object.entries(record.rawFields)) {
    const text = asText(value);
    if (text && text !== text.trim()) {
      const source = ["example", "englishExample", "chineseTranslation"].includes(fieldName)
        ? translationSource
        : record;
      addFinding(findings, record, "format", `${fieldName} 前後有多餘空白`, text, source);
    }
  }

  const bracketResult = scanBracketFormat(record.example);
  if (bracketResult.unbalanced) {
    addFinding(findings, record, "format", "例句或翻譯中的括號不成對", record.example, translationSource);
  }
  if (bracketResult.mixed) {
    addFinding(findings, record, "format", "例句混用全形與半形括號", record.example, translationSource);
  }

  const translation = record.separateTranslation
    ? record.chineseTranslation.trim()
    : parseTrailingTranslation(record.example).translation;
  if (!translation) {
    addFinding(findings, record, "format", "缺少中文翻譯或翻譯括號", record.example, translationSource);
  }

  const english = record.englishExample.trim();
  if (english && !sentenceEndsWithEnglishPunctuation(english)) {
    addFinding(findings, record, "format", "英文例句句尾缺少 .、? 或 !", english, translationSource);
  }
}

function checkTranslation(findings, record) {
  const translation = record.chineseTranslation.trim();
  if (!translation) {
    return;
  }

  const reasons = [];
  const hanCount = countHanCharacters(translation);
  if (hanCount < 2) {
    reasons.push(`只有 ${hanCount} 個漢字`);
  }
  if (normalizeTranslationComparison(translation) === normalizeTranslationComparison(record.englishExample)) {
    reasons.push("與英文例句相同");
  }

  if (reasons.length) {
    addFinding(findings, record, "translation-suspect", `中文翻譯疑似過短或未翻：${reasons.join("；")}`, translation, exampleSource(record));
  }
}

export function checkContentRecord(record) {
  const findings = [];
  checkSimplifiedText(findings, record, "中文意思", record.meaning);
  checkSimplifiedText(findings, record, "中文翻譯", record.chineseTranslation, exampleSource(record));
  findings.push(...checkConversionAndMainlandTerms(record));

  if (record.englishExample.trim() && record.word.trim() && !exampleUsesHeadword(record.word, record.englishExample)) {
    addFinding(
      findings,
      record,
      "example-word-missing",
      "英文例句未找到該單字、常見變化形或片語形式",
      record.englishExample,
      exampleSource(record)
    );
  }

  checkFormat(findings, record);
  checkTranslation(findings, record);
  return findings;
}

function normalizedHeadword(word) {
  return asText(word).trim().toLocaleLowerCase().replace(/\s+/gu, " ");
}

function normalizedExample(example) {
  return normalizeEnglishTokens(example).join(" ");
}

function exportedLevel(record) {
  return asText(record.exportLevel || record.worksheet || record.track).trim();
}

function exporterEntryKey(record) {
  const prefix = `${record.track}\u0000${exportedLevel(record)}\u0000${asText(record.word).trim()}`;
  if (record.track.startsWith("gept-")) {
    // consolidateGeptEntries merges all senses for one word and level.
    return prefix;
  }
  // normalizeVocabularyEntries removes exact level/word/meaning/example duplicates.
  return `${prefix}\u0000${asText(record.meaning).trim()}\u0000${asText(record.example).trim()}`;
}

function exportedDuplicateCandidates(records) {
  const unique = new Map();
  for (const record of records) {
    if (!normalizedHeadword(record.word)) {
      continue;
    }
    const key = exporterEntryKey(record);
    if (!unique.has(key)) {
      unique.set(key, record);
    }
  }
  return Array.from(unique.values());
}

function formatLocation(record, useExampleSource = false) {
  const source = useExampleSource ? exampleSource(record) : record;
  return `${source.sourceWorkbook ? `\`${source.sourceWorkbook}\` / ` : ""}${source.worksheet} 第 ${source.row} 列`;
}

function relatedLocations(records, useExampleSource = false) {
  return records.map((record) => formatLocation(record, useExampleSource)).join("、");
}

export function checkDuplicates(records) {
  const findings = [];
  const byWordAndPos = new Map();
  const byExample = new Map();
  const exportedRecords = exportedDuplicateCandidates(records);

  for (const record of exportedRecords) {
    const normalizedWord = normalizedHeadword(record.word);
    if (normalizedWord) {
      for (const pos of extractPartOfSpeech(record)) {
        const key = `${record.track}\u0000${exportedLevel(record)}\u0000${normalizedWord}\u0000${pos}`;
        const group = byWordAndPos.get(key) ?? [];
        group.push(record);
        byWordAndPos.set(key, group);
      }
    }
  }

  for (const record of records) {
    const normalizedWord = normalizedHeadword(record.word);
    const english = normalizedExample(record.englishExample);
    if (normalizedWord && english) {
      const key = `${record.track}\u0000${english}`;
      const group = byExample.get(key) ?? [];
      group.push(record);
      byExample.set(key, group);
    }
  }

  const wordPosFindings = new Map();
  for (const [key, group] of byWordAndPos) {
    if (group.length < 2) {
      continue;
    }
    const pos = key.split("\u0000")[3];
    for (const record of group) {
      const related = group.filter((candidate) => candidate.id !== record.id);
      const issue = `同一單字與詞性（${pos === "unknown" ? "未標詞性" : pos}）也出現在：${relatedLocations(related)}`;
      wordPosFindings.set(`${record.id}\u0000${pos}`, { record, issue });
    }
  }
  for (const { record, issue } of wordPosFindings.values()) {
    addFinding(findings, record, "duplicate-word-pos", issue, record.meaning, record);
  }

  const exampleFindings = new Map();
  for (const group of byExample.values()) {
    const distinctWords = new Set(group.map((record) => normalizedHeadword(record.word)));
    if (distinctWords.size < 2) {
      continue;
    }
    for (const record of group) {
      const related = group.filter((candidate) => candidate.id !== record.id && normalizedHeadword(candidate.word) !== normalizedHeadword(record.word));
      if (!related.length) {
        continue;
      }
      exampleFindings.set(record.id, {
        record,
        issue: `相同英文例句也用於不同單字（${related.map((candidate) => `${candidate.word}：${formatLocation(candidate, true)}`).join("、")}）`
      });
    }
  }
  for (const { record, issue } of exampleFindings.values()) {
    addFinding(findings, record, "duplicate-example", issue, record.englishExample, exampleSource(record));
  }

  return findings;
}

export function analyzeVocabularyRecords(records) {
  return [
    ...records.flatMap(checkContentRecord),
    ...checkDuplicates(records)
  ].sort((left, right) => {
    const trackDiff = left.track.localeCompare(right.track);
    if (trackDiff) {
      return trackDiff;
    }
    if (left.row !== right.row) {
      return left.row - right.row;
    }
    return left.check.localeCompare(right.check);
  });
}

function escapeMarkdown(value) {
  return asText(value).replaceAll("|", "\\|").replace(/\r?\n/gu, " ");
}

function findingsFor(findings, track, category) {
  return findings.filter((finding) => finding.track === track && finding.check === category);
}

export function createContentReport(records, findings, generatedAt = new Date().toISOString()) {
  const lines = [
    "# 單字資料程式檢查報告",
    "",
    `產生時間：${generatedAt}`,
    "",
    "## 檢查範圍",
    "",
    "本檢查直接讀取 `scripts/vocabulary-source-definitions.mjs` 與匯出器共用設定所指定的原始來源工作簿；工作表和欄位定義不另維護。一般內容檢查保留來源列號；同單字同詞性重複則依匯出器的合併和去重規則折算，只報匯出後仍然重複的詞條。這次只讀 xlsx，報告位置以工作簿相對路徑、工作表及 Excel 列號標示。",
    "",
    "簡體字規則以 OpenCC 簡轉臺灣繁體比較整句，只檢查轉換後確實改變的原字。一字多義需人工確認的高風險字限於：干、后、里、发、着、表、余、范、只、面、斗、准、托、板、制、征、凶、咸、泄、夸；這些字可能因詞義選錯繁體字，需看詞組確認。台、岩、污、布、了、家、雇、伙、具、克、占等台灣常用字及詞組不列入此項。",
    "",
    "高風險清單來源是本專案使用的 `opencc-js` `cn`→`tw` 轉換器；只把常見且需要按詞義選字的轉換列為人工確認。程式判定另要求原字單獨轉換時也會改變，並排除已知台灣常用異體及詞組例外。",
    "",
    "| 原字 | 常見轉換分歧 | 判斷理由 |",
    "|---|---|---|",
    ...HIGH_RISK_CHARACTER_RATIONALES.map(([character, variants, rationale]) => `| ${character} | ${variants} | ${rationale} |`),
    "",
    "## 疑似轉換錯誤與大陸用語規則",
    "",
    "清單依主線提供的例子、OpenCC 簡轉臺灣繁體時容易受單字多義影響的字組，以及常見兩岸用詞差異整理。表內理由說明每條規則的依據；語境可能改變用法的詞只列為需人工確認。這是供人工複核的程式篩選清單，不代表所有符合詞組都必然錯誤。",
    "",
    "| 類別 | 偵測詞組 | 建議用語 | 判定 | 理由 |",
    "|---|---|---|---|---|"
  ];

  for (const rule of CONVERSION_AND_MAINLAND_TERM_RULES) {
    lines.push(`| ${rule.certainty === "definite" ? "確定錯誤" : "需人工確認"} | ${escapeMarkdown(rule.term)} | ${escapeMarkdown(rule.suggestion)} | ${rule.certainty} | ${escapeMarkdown(rule.rationale)} |`);
  }

  lines.push(
    "",
    "## 各辭庫筆數",
    "",
    "| 辭庫 | 來源列 | 檢查項目 | 問題筆數 |",
    "|---|---:|---|---:|"
  );

  for (const definition of TRACK_DEFINITIONS) {
    const trackRecords = records.filter((record) => record.track === definition.id);
    for (const [category, label] of REPORT_CATEGORIES) {
      lines.push(`| ${definition.id} | ${trackRecords.length} | ${label} | ${findingsFor(findings, definition.id, category).length} |`);
    }
  }

  lines.push("", "## 各辭庫例子（每項最多 5 筆）", "");

  for (const definition of TRACK_DEFINITIONS) {
    lines.push(`### ${definition.id}`, "");
    for (const [category, label] of REPORT_CATEGORIES) {
      const samples = findingsFor(findings, definition.id, category).slice(0, 5);
      lines.push(`#### ${label}：${findingsFor(findings, definition.id, category).length} 筆`, "");
      if (!samples.length) {
        lines.push("無", "");
        continue;
      }

      for (const sample of samples) {
        lines.push(
          `- \`${sample.sourceWorkbook}\` / ${sample.worksheet} 第 ${sample.row} 列 / **${escapeMarkdown(sample.word) || "（空白）"}**：${escapeMarkdown(sample.issue)}；原文：${escapeMarkdown(sample.originalText)}`
        );
      }
      lines.push("");
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function writeContentReports(records, findings, root = process.cwd()) {
  const reportDirectory = path.join(root, "docs", "tasks", "vocab-review-20261021");
  const markdownPath = path.join(reportDirectory, "check-report.md");
  const jsonlPath = path.join(reportDirectory, "check-findings.jsonl");

  fs.mkdirSync(reportDirectory, { recursive: true });
  fs.writeFileSync(markdownPath, createContentReport(records, findings), "utf8");
  fs.writeFileSync(jsonlPath, findings.map((finding) => JSON.stringify(finding)).join("\n") + (findings.length ? "\n" : ""), "utf8");

  return { markdownPath, jsonlPath };
}

export function runContentCheck(root = process.cwd()) {
  const records = readAllTrackSourceRows(root);
  const findings = analyzeVocabularyRecords(records);
  const paths = writeContentReports(records, findings, root);
  const counts = new Map();

  for (const finding of findings) {
    counts.set(finding.check, (counts.get(finding.check) ?? 0) + 1);
  }

  console.log(`Checked ${records.length} source rows across ${TRACK_DEFINITIONS.length} tracks.`);
  for (const [category, label] of REPORT_CATEGORIES) {
    console.log(`${label}: ${counts.get(category) ?? 0}`);
  }
  console.log(`Markdown report: ${path.relative(root, paths.markdownPath)}`);
  console.log(`JSONL findings: ${path.relative(root, paths.jsonlPath)}`);
  return { records, findings, ...paths };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runContentCheck();
}
