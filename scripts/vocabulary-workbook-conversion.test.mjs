import { describe, expect, it } from "vitest";
import { formatSourceExample } from "./vocabulary-data-utils.mjs";
import { splitCombinedExample } from "./vocabulary-workbook-conversion.mjs";

describe("workbook example splitting", () => {
  it.each([
    "The lesson was useful. (這堂課很有用。)",
    "The sentence ends here.（句子在這裡結束。）",
    "He wrote (and rewrote) the note. (他重寫了那張便條。)",
    "The note is marked (draft).",
    "This workbook has an English-only example."
  ])("reconstructs the original export example: %s", (example) => {
    const sourceFields = splitCombinedExample(example);

    expect(formatSourceExample(sourceFields)).toBe(example);
  });
});
