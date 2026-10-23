import { describe, expect, it } from "vitest";
import { arpabetToIpa, parseCmuDictionary } from "./fill-vocabulary-ipa.mjs";
import { isValidIpa } from "./vocabulary-senses.mjs";

describe("CMUdict ARPAbet to IPA conversion", () => {
  it("preserves stress and converts the schwa and rhotic ER variants", () => {
    expect(arpabetToIpa("B AE1 T")).toBe("ˈbæt");
    expect(arpabetToIpa("AH0 B AW1 T")).toBe("əˈbaʊt");
    expect(arpabetToIpa("ER1")).toBe("ˈɝ");
    expect(arpabetToIpa("ER0")).toBe("ɚ");
    expect(arpabetToIpa("AH1")).toBe("ˈʌ");
    expect(arpabetToIpa("K EY1")).toBe("ˈkeɪ");
  });

  it("reads numbered variants in order so the first pronunciation can be selected", () => {
    const dictionary = parseCmuDictionary(";;; comment\nREAD  R IY1 D\nREAD(2)  R EH1 D\n");

    expect(dictionary.get("read")).toEqual([
      { index: 1, arpabet: "R IY1 D" },
      { index: 2, arpabet: "R EH1 D" }
    ]);
    expect(arpabetToIpa(dictionary.get("read")[0].arpabet)).toBe("ˈɹid");
  });

  it("accepts IPA letters and stress marks and rejects ordinary punctuation", () => {
    expect(isValidIpa("ˈɹid")).toBe(true);
    expect(isValidIpa("ˈæktɹəs")).toBe(true);
    expect(isValidIpa("əˈbaʊt")).toBe(true);
    expect(isValidIpa("not-ipa")).toBe(false);
    expect(isValidIpa("not-IPA!")).toBe(false);
  });
});
