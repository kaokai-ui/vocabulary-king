import { describe, expect, it } from "vitest";
import { enMessages } from "./locales/en";
import { jaMessages } from "./locales/ja";
import { koMessages } from "./locales/ko";
import { createMessages } from "./messages";
import { normalizeLocale, parseEnabledExtraLocales } from "./localeConfig";

describe("optional locale messages", () => {
  it("keeps extra locales disabled unless the build flag names them", () => {
    expect(parseEnabledExtraLocales(undefined)).toEqual([]);
    expect(parseEnabledExtraLocales("ja,ko,fr,ja")).toEqual(["ja", "ko"]);
    expect(Object.keys(createMessages([]))).toEqual(["zh-TW", "en"]);
    expect(normalizeLocale("ja", [])).toBe("zh-TW");
    expect(normalizeLocale("ja", ["ja"])).toBe("ja");
  });

  it("adds Japanese and Korean options when enabled", () => {
    const enabledMessages = createMessages(["ja", "ko"]);

    expect(Object.keys(enabledMessages)).toEqual(["zh-TW", "en", "ja", "ko"]);
    expect(enabledMessages.ja.localeLabel).toBe("日本語");
    expect(enabledMessages.ko.localeLabel).toBe("한국어");
  });

  it.each([
    ["Japanese", jaMessages],
    ["Korean", koMessages]
  ])("keeps %s interface keys aligned with English", (_label, localeMessages) => {
    expect(Object.keys(localeMessages).sort()).toEqual(Object.keys(enMessages).sort());
  });
});
