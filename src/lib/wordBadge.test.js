import { describe, expect, it } from "vitest";
import { messages } from "../i18n/messages";
import { formatWordBadge } from "./wordBadge";

describe("formatWordBadge", () => {
  it.each([
    ["toeic", "TOEIC", "基礎1"],
    ["toeic-advanced", "TOEIC 進階", "商務1"],
    ["toefl", "TOEFL", "學術核心1"],
    ["ielts", "IELTS", "進階2"]
  ])("shows source level for %s", (trackId, label, level) => {
    expect(formatWordBadge(messages["zh-TW"], trackId, level)).toBe(`${label} ${level}`);
  });

  it("keeps school level badges and leaves other tracks unchanged", () => {
    expect(formatWordBadge(messages["zh-TW"], "junior-high", "L2")).toBe("國中英文 Level 2");
    expect(formatWordBadge(messages["zh-TW"], "gept-elementary", "L1")).toBe("全民英檢初級");
  });
});
