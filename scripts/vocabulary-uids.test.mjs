import { describe, expect, it } from "vitest";
import { addUidAlias, emptyUidAliasData, validateVocabularyUidState } from "./vocabulary-uids.mjs";

describe("vocabulary uid and alias validation", () => {
  it("requires every source row to have a uid and keeps them globally unique", () => {
    expect(() => validateVocabularyUidState({
      sourceRowsByTrack: new Map([["toefl", [{ word: "apple" }]]])
    })).toThrow(/missing uid/u);

    expect(() => validateVocabularyUidState({
      sourceRowsByTrack: new Map([
        ["toefl", [{ uid: "shared" }]],
        ["toeic", [{ uid: "shared" }]]
      ])
    })).toThrow(/Duplicate vocabulary uid/u);
  });

  it("accepts aliases that resolve to an existing uid", () => {
    expect(() => validateVocabularyUidState({
      sourceRowsByTrack: new Map([["toefl", [{ uid: "kept-uid" }]]]),
      aliasData: {
        aliases: [{ track: "toefl", aliasUid: "old-uid", targetUid: "kept-uid" }],
        deleted: []
      }
    })).not.toThrow();
  });

  it("rejects aliases with missing targets and cycles", () => {
    const sourceRowsByTrack = new Map([["toefl", [{ uid: "active" }]]]);
    expect(() => validateVocabularyUidState({
      sourceRowsByTrack,
      aliasData: {
        aliases: [{ track: "toefl", aliasUid: "old-uid", targetUid: "missing" }],
        deleted: []
      }
    })).toThrow(/targets missing uid/u);

    expect(() => validateVocabularyUidState({
      sourceRowsByTrack,
      aliasData: {
        aliases: [
          { track: "toefl", aliasUid: "first", targetUid: "second" },
          { track: "toefl", aliasUid: "second", targetUid: "first" }
        ],
        deleted: []
      }
    })).toThrow(/cycle detected/u);

    expect(() => validateVocabularyUidState({
      sourceRowsByTrack,
      aliasData: { aliases: { old: "active" }, deleted: [] }
    })).toThrow(/'aliases' must be an array/u);
  });

  it("rejects an alias source that is still active and records deletion entries", () => {
    const sourceRowsByTrack = new Map([["toefl", [{ uid: "active" }]]]);
    const state = validateVocabularyUidState({ sourceRowsByTrack });

    expect(() => addUidAlias(emptyUidAliasData(), {
      track: "toefl",
      aliasUid: "active",
      targetUid: "active",
      ...state
    })).toThrow(/cannot target itself|still active/u);

    expect(() => validateVocabularyUidState({
      sourceRowsByTrack,
      aliasData: { aliases: [], deleted: [{ track: "toefl", uid: "active" }] }
    })).toThrow(/still exists as an active source UID/u);
  });
});
