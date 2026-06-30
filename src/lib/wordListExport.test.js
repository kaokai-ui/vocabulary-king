import { describe, expect, it } from "vitest";
import { buildWordListCsv, buildWordListExportFilename } from "./wordListExport";

describe("wordListExport", () => {
  const words = [
    {
      id: "toefl-stamford",
      word: "Stamford",
      meaning: 'city, "old"',
      displayTrackLabel: "TOEFL",
      level: "TOEFL",
      example: "Line one\nLine two"
    }
  ];

  it("builds csv output with escaped cells", () => {
    expect(buildWordListCsv(words)).toBe(
      '\uFEFFword,meaning,level,example\nStamford,"city, ""old""",TOEFL,Line one Line two'
    );
  });

  it("builds dated filenames", () => {
    expect(buildWordListExportFilename(new Date("2026-06-30T08:00:00.000Z"))).toBe(
      "vocabulary-king-word-list-2026-06-30.csv"
    );
  });
});
