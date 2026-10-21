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
  readTrackSourceRows
} from "./check-vocabulary-content.mjs";
import { GEPT_WORKBOOK_COLUMNS } from "./vocabulary-source-definitions.mjs";

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
    xlsx.utils.book_append_sheet(geptWorkbook, xlsx.utils.aoa_to_sheet([["Word", "POS", "Meaning", "", "Grade", "", "", "Primary Level", "Example"], geptRow]), "High");
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
  });
});

describe("simplified Chinese checks", () => {
  it("finds clear simplified characters and routes ambiguous characters to review", () => {
    expect(classifySimplifiedText("遗弃")).toEqual({ definite: ["遗", "弃"], manualReview: [] });
    expect(classifySimplifiedText("后面站着皇后")).toEqual({ definite: [], manualReview: ["后", "着"] });
    expect(classifySimplifiedText("後面站著皇后")).toEqual({ definite: [], manualReview: [] });
    for (const traditionalUsage of ["游泳", "傢伙", "公布欄", "划船"]) {
      expect(classifySimplifiedText(traditionalUsage).definite).toEqual([]);
    }
    for (const traditionalUsage of [
      "了解家具污染", "准許雇用並克制占地", "煙斗和弦管弦樂團", "局限與拐杖",
      "卷髮祕密注定回音無精打采搜集", "老板", "周杰倫遠征白癡夸脫宣泄脣瓣濃郁", "凶惡凶險葛咸"
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
    expect(exampleUsesHeadword("well-known", "The well known author spoke.")).toBe(true);
    expect(exampleUsesHeadword("take off", "He took his wet coat off.")).toBe(true);

    expect(exampleUsesHeadword("take off", "He hung his wet coat in the closet.")).toBe(false);
    const missing = record({ word: "abandon", englishExample: "The family packed the house.", example: "The family packed the house. (一家人打包了房子。)" });
    expect(checkContentRecord(missing).some((finding) => finding.check === "example-word-missing")).toBe(true);
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
  it("flags repeated word and part of speech plus examples shared by different words", () => {
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
