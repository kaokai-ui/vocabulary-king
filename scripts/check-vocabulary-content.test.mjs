import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import xlsx from "xlsx";
import {
  checkContentRecord,
  checkConversionAndMainlandTerms,
  checkDuplicates,
  classifySimplifiedText,
  exampleUsesHeadword,
  readAllTrackSourceRows,
  readTrackSourceRows,
  resolveGeptExample
} from "./check-vocabulary-content.mjs";
import { GEPT_WORKBOOK_COLUMNS, TRACK_DEFINITIONS } from "./vocabulary-source-definitions.mjs";

const temporaryDirectories = [];

function record(overrides = {}) {
  const base = {
    track: "test-track",
    id: "test-track:Sheet1:2",
    word: "book",
    meaning: "n. 書本",
    pos: "n",
    englishExample: "The book is on the table.",
    chineseTranslation: "書本在桌上。",
    example: "The book is on the table. (書本在桌上。)",
    separateTranslation: true,
    sourceWorkbook: "Source/test.xlsx",
    worksheet: "Sheet1",
    row: 2,
    rawFields: {
      word: "book",
      meaning: "n. 書本",
      pos: "n",
      englishExample: "The book is on the table.",
      chineseTranslation: "書本在桌上。"
    }
  };
  const result = { ...base, ...overrides };
  if (!Object.hasOwn(overrides, "rawFields")) {
    result.rawFields = {
      word: result.word,
      meaning: result.meaning,
      ...(result.pos ? { pos: result.pos } : {}),
      englishExample: result.englishExample,
      chineseTranslation: result.chineseTranslation
    };
  }
  return result;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("source workbook mapping", () => {
  it("keeps the original worksheet and Excel row number for a source record", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vocab-content-check-"));
    temporaryDirectories.push(root);

    const workbook = xlsx.utils.book_new();
    const sheet = xlsx.utils.aoa_to_sheet([
      ["Word", "Chinese Meaning", "English Example", "Chinese Translation"],
      ["book", "n. 書本", "The book is useful.", "這本書很有用。"]
    ]);
    xlsx.utils.book_append_sheet(workbook, sheet, "Source Words");
    xlsx.writeFile(workbook, path.join(root, "fixture.xlsx"));

    const rows = readTrackSourceRows({
      id: "fixture",
      sourceWorkbookPath: "fixture.xlsx",
      type: "named-column-workbook",
      columnsByHeader: {
        word: "Word",
        meaning: "Chinese Meaning",
        englishExample: "English Example",
        chineseExample: "Chinese Translation"
      }
    }, root);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      word: "book",
      worksheet: "Source Words",
      row: 2,
      id: "fixture:Source Words:2"
    });
  });

  it("checks the same primary-level example selected for GEPT export and points to that source row", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vocab-gept-example-check-"));
    temporaryDirectories.push(root);

    const juniorWorkbook = xlsx.utils.book_new();
    for (const sheetName of ["Level 1", "Level 2"]) {
      const rows = [["NO.", "Word", "Meaning", "Fallback Example", "English Example"]];
      if (sheetName === "Level 1") {
        rows.push([1, "book", "書本", "The fallback example is not selected. (備用例句。)", "The class bought a book. (全班買了一本書。)"]);
      }
      xlsx.utils.book_append_sheet(juniorWorkbook, xlsx.utils.aoa_to_sheet(rows), sheetName);
    }
    xlsx.writeFile(juniorWorkbook, path.join(root, "fixture-L1L2.xlsx"));

    const seniorWorkbook = xlsx.utils.book_new();
    for (const sheetName of ["Level 3", "Level 4", "Level 5", "Level 6"]) {
      xlsx.utils.book_append_sheet(seniorWorkbook, xlsx.utils.aoa_to_sheet([["NO.", "Word", "Meaning", "Fallback Example", "English Example"]]), sheetName);
    }
    xlsx.writeFile(seniorWorkbook, path.join(root, "fixture-L3L6.xlsx"));

    const geptWorkbook = xlsx.utils.book_new();
    const geptRow = Array(9).fill("");
    geptRow[GEPT_WORKBOOK_COLUMNS.word] = "book";
    geptRow[GEPT_WORKBOOK_COLUMNS.pos] = "n.";
    geptRow[GEPT_WORKBOOK_COLUMNS.meaning] = "書本";
    geptRow[GEPT_WORKBOOK_COLUMNS.grade] = "初級";
    geptRow[GEPT_WORKBOOK_COLUMNS.primaryLevel] = "Level 1";
    geptRow[GEPT_WORKBOOK_COLUMNS.fallbackExample] = "The fallback example is not selected. (備用例句。)";
    const intermediateRow = [...geptRow];
    intermediateRow[GEPT_WORKBOOK_COLUMNS.grade] = "Intermediate";
    intermediateRow[GEPT_WORKBOOK_COLUMNS.fallbackExample] = "The intermediate GEPT example. (GEPT translation.)";
    xlsx.utils.book_append_sheet(geptWorkbook, xlsx.utils.aoa_to_sheet([["Word", "POS", "Meaning", "", "Grade", "", "", "Primary Level", "Example"], geptRow, intermediateRow]), "High");
    xlsx.writeFile(geptWorkbook, path.join(root, "fixture-GEPT_with_levels.KK.xlsx"));

    const [row] = readTrackSourceRows({
      id: "gept-fixture",
      sourceWorkbookPath: "fixture-GEPT_with_levels.KK.xlsx",
      type: "gept-workbook",
      sheets: ["High"],
      geptGrade: "初級",
      columns: GEPT_WORKBOOK_COLUMNS
    }, root);

    expect(row.example).toBe("The class bought a book. (全班買了一本書。)");
    expect(row.exampleSource).toMatchObject({ sourceWorkbook: expect.stringContaining("fixture-L1L2.xlsx"), worksheet: "Level 1", row: 2 });

    const [intermediate] = readTrackSourceRows({
      id: "gept-intermediate",
      sourceWorkbookPath: "fixture-GEPT_with_levels.KK.xlsx",
      type: "gept-workbook",
      sheets: ["High"],
      geptGrade: "Intermediate",
      columns: GEPT_WORKBOOK_COLUMNS
    }, root);

    expect(intermediate.example).toBe("The intermediate GEPT example. (GEPT translation.)");
    expect(intermediate.exampleSource).toMatchObject({
      sourceWorkbook: expect.stringContaining("fixture-GEPT_with_levels.KK.xlsx"),
      worksheet: "High",
      row: 3
    });
  });

  it("prefers a high-intermediate GEPT row override over the shared level example", () => {
    const fallbackSource = { sourceWorkbook: "fixture.xlsx", worksheet: "High", row: 9 };
    const levelSource = { sourceWorkbook: "levels.xlsx", worksheet: "Level 5", row: 2 };
    const lookup = new Map([
      ["Level 5", new Map([
        ["sample", { example: "The shared-level example.", source: levelSource }]
      ])]
    ]);

    expect(resolveGeptExample("sample", "Level 5", "The GEPT override.", fallbackSource, lookup, true))
      .toEqual({ example: "The GEPT override.", source: fallbackSource });
    expect(resolveGeptExample("sample", "Level 5", "The GEPT override.", fallbackSource, lookup))
      .toEqual({ example: "The shared-level example.", source: levelSource });
  });
});

describe("canonical JSONL source mapping", () => {
  it("reads all available tracks from the configured data repo with JSONL line locations", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vocab-content-jsonl-"));
    temporaryDirectories.push(root);
    const dataRepoRoot = path.join(root, "vocabulary-data");
    const dataDirectory = path.join(dataRepoRoot, "data");
    fs.mkdirSync(dataDirectory, { recursive: true });

    for (const definition of TRACK_DEFINITIONS) {
      if (!definition.available) continue;
      const rows = [
        {
          track: definition.id,
          uid: `${definition.id}-source-1`,
          level: definition.fallbackLevel ?? "Level 1",
          word: `${definition.id}-word`,
          pos: "",
          meaning_zh: "中文意思",
          meaning_ja: "",
          meaning_ko: "",
          senses: [{ pos: "", meaning_zh: "中文意思", meaning_ja: "", meaning_ko: "" }],
          ipa_us: "",
          ipa_uk: "",
          example_en: "A valid example sentence.",
          example_zh: "這是一個例句。",
          example_format: { before: " (", after: ")" }
        }
      ];
      fs.writeFileSync(
        path.join(dataDirectory, `${definition.id}.jsonl`),
        `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
        "utf8"
      );
    }

    const previousDataRepo = process.env.VOCABULARY_DATA_REPO;
    process.env.VOCABULARY_DATA_REPO = dataRepoRoot;
    let records;
    try {
      records = readAllTrackSourceRows(root);
    } finally {
      if (previousDataRepo === undefined) {
        delete process.env.VOCABULARY_DATA_REPO;
      } else {
        process.env.VOCABULARY_DATA_REPO = previousDataRepo;
      }
    }

    expect(records).toHaveLength(TRACK_DEFINITIONS.filter((definition) => definition.available).length);
    expect(records[0]).toMatchObject({
      track: "elementary",
      sourceWorkbook: "data/elementary.jsonl",
      worksheet: "JSONL",
      row: 1,
      word: "elementary-word",
      example: "A valid example sentence. (這是一個例句。)"
    });
  });

  it("rejects invalid sense metadata in JSONL source rows", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vocab-content-jsonl-invalid-senses-"));
    temporaryDirectories.push(root);
    const dataRepoRoot = path.join(root, "vocabulary-data");
    const dataDirectory = path.join(dataRepoRoot, "data");
    fs.mkdirSync(dataDirectory, { recursive: true });

    for (const definition of TRACK_DEFINITIONS.filter((track) => track.available)) {
      const row = {
        track: definition.id,
        uid: `${definition.id}-source-1`,
        level: definition.fallbackLevel ?? "Level 1",
        word: `${definition.id}-word`,
        pos: "",
        meaning_zh: "中文意思",
        meaning_ja: "",
        meaning_ko: "",
        senses: [{ pos: "", meaning_zh: "中文意思", meaning_ja: "", meaning_ko: "" }],
        ipa_us: "",
        ipa_uk: "",
        example_en: "A valid example sentence.",
        example_zh: "這是一個例句。"
      };
      if (definition.id === "elementary") row.senses = [];
      fs.writeFileSync(path.join(dataDirectory, `${definition.id}.jsonl`), `${JSON.stringify(row)}\n`, "utf8");
    }

    expect(() => readAllTrackSourceRows(root, dataRepoRoot)).toThrow(/must have at least one sense/u);
  });

  it("fails clearly when the configured vocabulary data repo is missing", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vocab-content-jsonl-missing-"));
    temporaryDirectories.push(root);
    const missingRepo = path.join(root, "missing-repo");

    expect(() => readAllTrackSourceRows(root, missingRepo))
      .toThrow(`Vocabulary source repo not found at ${missingRepo}; check:content requires the JSONL repo.`);
  });
});

describe("simplified Chinese checks", () => {
  it("reports actual OpenCC changes, limits one-character review to high-risk forms, and ignores valid Taiwan usage", () => {
    expect(classifySimplifiedText("遗弃")).toEqual({ definite: ["遗", "弃"], manualReview: [] });
    expect(classifySimplifiedText("后面站着皇后")).toEqual({ definite: [], manualReview: ["后", "着"] });
    expect(classifySimplifiedText("後面站著皇后")).toEqual({ definite: [], manualReview: [] });
    expect(classifySimplifiedText("老板")).toEqual({ definite: [], manualReview: ["板"] });
    expect(classifySimplifiedText("周杰倫")).toEqual({ definite: [], manualReview: [] });
    expect(classifySimplifiedText("杰出")).toEqual({ definite: ["杰"], manualReview: [] });
    expect(classifySimplifiedText("這台機器裡有岩石、布料、污染，家人雇員走了。"))
      .toEqual({ definite: [], manualReview: [] });
    for (const traditionalUsage of ["游泳", "傢伙", "公布欄", "划船"]) {
      expect(classifySimplifiedText(traditionalUsage).definite).toEqual([]);
    }
    for (const traditionalUsage of [
      "了解家具污染", "准許雇用並克制占地", "煙斗和弦管弦樂團", "局限與拐杖",
      "卷髮祕密注定回音無精打采搜集", "老闆", "周杰倫遠征白癡夸脫宣泄脣瓣濃郁", "凶惡凶險葛咸"
    ]) {
      expect(classifySimplifiedText(traditionalUsage).definite).toEqual([]);
    }
    expect(classifySimplifiedText("指挥带领管弦乐团").definite).toEqual(["挥", "带", "领", "乐", "团"]);

    const bad = record({
      meaning: "v. 遗弃；抛弃",
      englishExample: "The family abandoned the house.",
      chineseTranslation: "他们離開了房子。"
    });
    expect(checkContentRecord(bad).some((finding) => finding.check === "simplified-script")).toBe(true);
  });
});

describe("headword use in examples", () => {
  it("accepts inflections, irregular forms, hyphen variants, and separable phrases", () => {
    expect(exampleUsesHeadword("abandon", "The family abandoned the house.")).toBe(true);
    expect(exampleUsesHeadword("city", "The cities are easy to reach.")).toBe(true);
    expect(exampleUsesHeadword("go", "She goes to work early.")).toBe(true);
    expect(exampleUsesHeadword("good", "This is the best choice.")).toBe(true);
    expect(exampleUsesHeadword("easy-going", "My easy-going colleague handles client meetings calmly.")).toBe(true);
    expect(exampleUsesHeadword("easy-going", "My easy going colleague handles client meetings calmly.")).toBe(true);
    expect(exampleUsesHeadword("easy-going", "The instructions were easy, going on to explain the final step.")).toBe(false);
    expect(exampleUsesHeadword("well-known", "The well known author spoke.")).toBe(true);
    expect(exampleUsesHeadword("shrink", "The lake has shrunk by a third over the past decade.")).toBe(true);
    expect(exampleUsesHeadword("shrink", "The boat sank before the crew could reach shore.")).toBe(false);
    expect(exampleUsesHeadword("think of", "She thought of a better approach.")).toBe(true);
    expect(exampleUsesHeadword("tie up", "They tied the boxes up.")).toBe(true);
    expect(exampleUsesHeadword("time off", "She requested time-off next week.")).toBe(true);
    expect(exampleUsesHeadword("south", "The southern region receives more rain.")).toBe(false);

    const punctuationCounterexample = "The instructions were easy, going on to explain the final step.";
    expect(checkContentRecord(record({
      word: "easy-going",
      englishExample: punctuationCounterexample,
      example: `${punctuationCounterexample} (說明後續步驟。)`
    })).some((finding) => finding.check === "example-word-missing")).toBe(true);

    const irregularExample = "The lake has shrunk by a third over the past decade.";
    expect(checkContentRecord(record({
      word: "shrink",
      englishExample: irregularExample,
      example: `${irregularExample} (湖泊縮小了三分之一。)`
    })).some((finding) => finding.check === "example-word-missing")).toBe(false);

    expect(exampleUsesHeadword("take off", "He took his wet coat off.")).toBe(true);

    expect(exampleUsesHeadword("take off", "He hung his wet coat in the closet.")).toBe(false);
    const missing = record({ word: "abandon", englishExample: "The family packed the house.", example: "The family packed the house. (一家人打包了房子。)" });
    expect(checkContentRecord(missing).some((finding) => finding.check === "example-word-missing")).toBe(true);
  });

  it("matches example phrase substitution slots and rejects sentences without the phrase", () => {
    const phraseExample = "The warehouse was torn down last spring.";
    expect(checkContentRecord(record({
      word: "tear down",
      englishExample: phraseExample,
      example: phraseExample + " (倉庫去年春天拆除了。)"
    })).some((finding) => finding.check === "example-word-missing")).toBe(false);

    expect(exampleUsesHeadword("A as well as B", "The policy applies to employees as well as contractors." )).toBe(true);
    expect(exampleUsesHeadword("A and B alike", "The museum welcomes children and adults alike." )).toBe(true);
    expect(exampleUsesHeadword("A be followed by B", "The ceremony will be followed by a short reception." )).toBe(true);
    expect(exampleUsesHeadword("ask sb", "The teacher asked Maria to wait." )).toBe(true);
    expect(exampleUsesHeadword("find sth", "He found a small package." )).toBe(true);
    expect(exampleUsesHeadword("give someone something", "She gave a child a book." )).toBe(true);
    expect(exampleUsesHeadword("use one's hands", "He used his hands to move the box." )).toBe(true);
    expect(exampleUsesHeadword("prepare oneself", "She prepared herself for the exam." )).toBe(true);
    expect(exampleUsesHeadword("stop ... suddenly", "The car stopped quite suddenly." )).toBe(true);

    expect(exampleUsesHeadword("A as well as B", "The book was left in the bag." )).toBe(false);
    expect(exampleUsesHeadword("A and B alike", "The museum welcomes children and adults." )).toBe(false);
    expect(exampleUsesHeadword("A be followed by B", "The ceremony ended before the guests arrived." )).toBe(false);
    expect(exampleUsesHeadword("ask sb", "The teacher told Maria to wait." )).toBe(false);
  });

  it("allows phrase-opening articles and inflected or future forms of be", () => {
    expect(exampleUsesHeadword("a loaf of", "They ordered a perfect loaf of sourdough." )).toBe(true);
    expect(exampleUsesHeadword("a piece of equipment", "This specific piece of equipment is new." )).toBe(true);
    expect(exampleUsesHeadword("be followed by", "One result will be followed by another." )).toBe(true);
    expect(exampleUsesHeadword("be followed by", "The first item was followed by a short break." )).toBe(true);

    expect(exampleUsesHeadword("a piece of equipment", "The equipment arrived this morning." )).toBe(false);
    expect(exampleUsesHeadword("be followed by", "The path follows the river." )).toBe(false);
  });
});

describe("format checks", () => {
  it("accepts a properly formatted bilingual example and reports malformed counterexamples", () => {
    expect(checkContentRecord(record()).filter((finding) => finding.check === "format")).toEqual([]);
    const nestedTraditionalParentheses = record({
      englishExample: "The book is useful.",
      chineseTranslation: "書本（很有用）。",
      example: "The book is useful. (書本（很有用）。)"
    });
    expect(checkContentRecord(nestedTraditionalParentheses).filter((finding) => finding.check === "format")).toEqual([]);

    const malformed = record({
      word: " book ",
      meaning: "   ",
      englishExample: "A sentence without an ending mark",
      chineseTranslation: "（標籤",
      example: "A sentence (without an ending mark （標籤",
      rawFields: {
        word: " book ",
        meaning: "   ",
        englishExample: "A sentence without an ending mark",
        chineseTranslation: "（標籤"
      }
    });
    const malformedIssues = checkContentRecord(malformed)
      .filter((finding) => finding.check === "format")
      .map((finding) => finding.issue);

    expect(malformedIssues.some((issue) => issue.includes("前後有多餘空白"))).toBe(true);
    expect(malformedIssues.some((issue) => issue.includes("中文意思欄位空白"))).toBe(true);
    expect(malformedIssues.some((issue) => issue.includes("括號不成對"))).toBe(true);
    expect(malformedIssues.some((issue) => issue.includes("混用全形與半形括號"))).toBe(true);
    expect(malformedIssues.some((issue) => issue.includes("缺少中文翻譯"))).toBe(false);
    expect(malformedIssues.some((issue) => issue.includes("句尾缺少"))).toBe(true);

    const untranslated = record({
      englishExample: "A sentence ends here.",
      chineseTranslation: "",
      example: "A sentence ends here.",
      rawFields: { word: "book", meaning: "n. 書本", englishExample: "A sentence ends here.", chineseTranslation: "" }
    });
    expect(checkContentRecord(untranslated).some((finding) => finding.check === "format" && finding.issue.includes("缺少中文翻譯"))).toBe(true);
  });
});

describe("duplicate checks", () => {
  it("flags exported same-level word and part-of-speech duplicates plus reused examples", () => {
    const first = record({ id: "r1", word: "book", pos: "n", englishExample: "A book changes hands.", example: "A book changes hands. (書本易手。)" });
    const repeatedSamePos = record({ id: "r2", row: 3, word: "book", pos: "n", englishExample: "Every book has a cover.", example: "Every book has a cover. (每本書都有封面。)" });
    const differentPos = record({ id: "r3", row: 4, word: "book", pos: "v", meaning: "v. 預訂", englishExample: "Please book a room.", example: "Please book a room. (請預訂房間。)" });
    const reusedSentence = record({ id: "r4", row: 5, word: "read", pos: "v", meaning: "v. 閱讀", englishExample: "A book changes hands.", example: "A book changes hands. (書本易手。)" });

    const findings = checkDuplicates([first, repeatedSamePos, differentPos, reusedSentence]);
    expect(findings.filter((finding) => finding.check === "duplicate-word-pos").map((finding) => finding.id).sort()).toEqual(["r1", "r2"]);
    expect(findings.filter((finding) => finding.check === "duplicate-example").map((finding) => finding.id).sort()).toEqual(["r1", "r4"]);

    const unique = checkDuplicates([
      record({ id: "u1", word: "book", pos: "n", englishExample: "A book changes hands." }),
      record({ id: "u2", word: "read", pos: "v", englishExample: "She reads every day." })
    ]);
    expect(unique).toEqual([]);
  });

  it("does not flag rows the exporter coalesces or copies placed in separate levels", () => {
    const exactSourceCopy = record({
      id: "copy",
      row: 8,
      exportLevel: "Sheet1",
      word: "book",
      pos: "n",
      meaning: "n. 書本",
      englishExample: "A book changes hands.",
      example: "A book changes hands. (書本易手。)"
    });
    const first = record({
      id: "original",
      exportLevel: "Sheet1",
      word: "book",
      pos: "n",
      meaning: "n. 書本",
      englishExample: "A book changes hands.",
      example: "A book changes hands. (書本易手。)"
    });
    expect(checkDuplicates([first, exactSourceCopy]).filter((finding) => finding.check === "duplicate-word-pos")).toEqual([]);

    const anotherLevel = record({
      id: "another-level",
      exportLevel: "Level 2",
      word: "book",
      pos: "n",
      meaning: "n. 書本",
      englishExample: "A book is on the shelf.",
      example: "A book is on the shelf. (書本在架上。)"
    });
    expect(checkDuplicates([
      { ...first, exportLevel: "Level 1" },
      anotherLevel
    ]).filter((finding) => finding.check === "duplicate-word-pos")).toEqual([]);

    const geptFirst = record({
      id: "gept-1",
      track: "gept-high-intermediate",
      exportLevel: "L3",
      word: "bank",
      pos: "n.",
      meaning: "銀行",
      englishExample: "She visited a bank.",
      example: "She visited a bank. (她去了銀行。)"
    });
    const geptSecondSense = record({
      id: "gept-2",
      track: "gept-high-intermediate",
      exportLevel: "L3",
      word: "bank",
      pos: "n.",
      meaning: "河岸",
      englishExample: "They sat on the bank.",
      example: "They sat on the bank. (他們坐在河岸。)"
    });
    expect(checkDuplicates([geptFirst, geptSecondSense]).filter((finding) => finding.check === "duplicate-word-pos")).toEqual([]);
  });
});

describe("translation checks", () => {
  it("flags punctuation-only and untranslated English while accepting a Chinese translation", () => {
    const punctuationOnly = record({ chineseTranslation: "...", example: "The book is useful. (...)" });
    const sameAsEnglish = record({
      englishExample: "She left.",
      chineseTranslation: "She left.",
      example: "She left. (She left.)"
    });
    const good = record();

    expect(checkContentRecord(punctuationOnly).some((finding) => finding.check === "translation-suspect")).toBe(true);
    expect(checkContentRecord(sameAsEnglish).some((finding) => finding.check === "translation-suspect")).toBe(true);
    expect(checkContentRecord(good).some((finding) => finding.check === "translation-suspect")).toBe(false);
  });
});

describe("conversion errors and Mainland Chinese terms", () => {
  it("separates definite replacements from context-dependent terms", () => {
    const definite = record({
      meaning: "n. 軟件信息視頻網絡打印服務器默認；乾涉事件；事故髮生",
      englishExample: "The student presented the work.",
      chineseTranslation: "手勢錶演後，透過了安全檢查，隨後透過了筆試考試，並提交紙本複印件。",
      example: "The student presented the work. (手勢錶演後，透過了安全檢查，隨後透過了筆試考試，並提交紙本複印件。)"
    });
    const review = record({
      meaning: "n. 比賽項目與質量",
      englishExample: "The project data changed.",
      chineseTranslation: "新項目改造過程中，數據與優化方式仍需確認。",
      example: "The project data changed. (新項目改造過程中，數據與優化方式仍需確認。)"
    });
    const traditionalCounterexample = record({
      meaning: "n. 乾燥的紙張",
      englishExample: "They celebrated with a toast.",
      chineseTranslation: "大家乾杯後開始表演。",
      example: "They celebrated with a toast. (大家乾杯後開始表演。)"
    });

    const definiteFindings = checkConversionAndMainlandTerms(definite);
    expect(definiteFindings.length).toBeGreaterThanOrEqual(5);
    expect(definiteFindings.every((finding) => finding.check === "conversion-term-definite")).toBe(true);
    expect(definiteFindings.some((finding) => finding.issue.includes("錶演"))).toBe(true);
    expect(definiteFindings.some((finding) => finding.issue.includes("軟件"))).toBe(true);
    expect(definiteFindings.some((finding) => finding.issue.includes("透過了安全檢查"))).toBe(true);
    expect(definiteFindings.some((finding) => finding.issue.includes("透過了筆試考試"))).toBe(true);
    expect(definiteFindings.some((finding) => finding.issue.includes("複印件"))).toBe(true);
    expect(definiteFindings.some((finding) => finding.issue.includes("乾涉"))).toBe(true);
    expect(definiteFindings.some((finding) => finding.issue.includes("髮生"))).toBe(true);

    const reviewFindings = checkConversionAndMainlandTerms(review);
    expect(reviewFindings.length).toBeGreaterThanOrEqual(4);
    expect(reviewFindings.every((finding) => finding.check === "conversion-term-review")).toBe(true);
    expect(reviewFindings.some((finding) => finding.issue.includes("比賽項目"))).toBe(true);
    expect(reviewFindings.some((finding) => finding.originalText.includes("新項目"))).toBe(true);

    const counterexampleFindings = checkConversionAndMainlandTerms(traditionalCounterexample);
    expect(counterexampleFindings).toEqual([]);
  });
});
