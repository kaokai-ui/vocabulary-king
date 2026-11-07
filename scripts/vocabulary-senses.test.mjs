import { describe, expect, it } from "vitest";
import { formatSourceMeaning } from "./vocabulary-data-utils.mjs";
import { snapshotLegacyDisplay, syncCompatibilityFieldsFromSenses } from "./vocabulary-senses.mjs";

function displaySenses(track) {
  return {
    track,
    word: "display",
    senses: [
      { pos: "v.", meaning_zh: "展示；顯示；陳列", meaning_ja: "展示する", meaning_ko: "전시하다" },
      { pos: "n.", meaning_zh: "顯示器；展示；表演", meaning_ja: "ディスプレイ", meaning_ko: "디스플레이" }
    ]
  };
}

describe("compatibility display fields", () => {
  it("gives TOEIC the same one-line-per-part-of-speech display as every other track", () => {
    const toeic = syncCompatibilityFieldsFromSenses(displaySenses("toeic"));
    const toefl = syncCompatibilityFieldsFromSenses(displaySenses("toefl"));

    expect(toeic.pos).toBe("v.\nn.");
    expect(toeic.meaning_zh).toBe("v. 展示；顯示；陳列\nn. 顯示器；展示；表演");
    expect(toeic.meaning_ja).toBe("v. 展示する\nn. ディスプレイ");
    expect({ pos: toeic.pos, meaning_zh: toeic.meaning_zh }).toEqual({ pos: toefl.pos, meaning_zh: toefl.meaning_zh });
  });

  it("exports the TOEIC display meaning without adding a second part-of-speech prefix", () => {
    const row = syncCompatibilityFieldsFromSenses(displaySenses("toeic"));
    row.legacy_display = snapshotLegacyDisplay(row);

    expect(formatSourceMeaning(row, { useSensesDisplay: false })).toBe("v. 展示；顯示；陳列\nn. 顯示器；展示；表演");
  });
});
