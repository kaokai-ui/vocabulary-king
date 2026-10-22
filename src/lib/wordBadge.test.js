import { describe, expect, it } from "vitest";
import { enMessages } from "../i18n/locales/en";
import { zhTWMessages } from "../i18n/locales/zh-TW";
import { formatWordBadge } from "./wordBadge";
import { vocabularyTracks } from "../constants/vocabularyTracks";

describe("formatWordBadge", () => {
  it("names the track, adding the CEEC level only for the school tracks", () => {
    expect(formatWordBadge(zhTWMessages, "senior-high-5-6", "L5")).toBe("高中英文 Level 5");
    expect(formatWordBadge(zhTWMessages, "junior-high", "L1")).toBe("國中英文 Level 1");
    expect(formatWordBadge(zhTWMessages, "elementary", "Elementary")).toBe("國小英文");
    expect(formatWordBadge(zhTWMessages, "gept-high-intermediate", "L5")).toBe("全民英檢中高級");
    expect(formatWordBadge(zhTWMessages, "toeic", "L5")).toBe("TOEIC");
    expect(formatWordBadge(zhTWMessages, "toeic-advanced", "TOEIC-ADV")).toBe("TOEIC 進階");
    expect(formatWordBadge(zhTWMessages, "ielts", "IELTS")).toBe("IELTS");
    expect(formatWordBadge(enMessages, "senior-high", "L3")).toBe("Senior High Level 3");
    expect(formatWordBadge(enMessages, "gept-elementary", "初級")).toBe("GEPT Elementary");
  });

  it("falls back to the stored level when the track is unknown", () => {
    expect(formatWordBadge(zhTWMessages, undefined, "L2")).toBe("L2");
    expect(formatWordBadge(zhTWMessages, "unknown-track", undefined)).toBe("");
  });

  it("does not invent a level for school-track words without one", () => {
    expect(formatWordBadge(zhTWMessages, "senior-high", "")).toBe("高中英文");
  });

  it("has a badge name for every track in every interface language", () => {
    for (const messages of [zhTWMessages, enMessages]) {
      for (const track of vocabularyTracks) {
        expect(formatWordBadge(messages, track.value, "")).not.toBe("");
      }
    }
  });
});
