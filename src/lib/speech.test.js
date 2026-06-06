import { afterEach, describe, expect, it, vi } from "vitest";
import { isLikelyInAppBrowser, speakWord } from "./speech";

describe("speech helpers", () => {
  afterEach(() => {
    delete globalThis.window;
    vi.unstubAllGlobals();
  });

  it("detects common in-app browsers", () => {
    expect(isLikelyInAppBrowser("Mozilla/5.0 Line/14.1.1")).toBe(true);
    expect(isLikelyInAppBrowser("Mozilla/5.0 [FBAN/FB4A;FBAV/460.0.0.0.1;]")).toBe(true);
    expect(isLikelyInAppBrowser("Mozilla/5.0 Chrome/137.0.0.0 Mobile Safari/537.36")).toBe(false);
  });

  it("returns the in-app-browser reason when speech synthesis is unavailable there", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 Line/14.1.1"
    });

    globalThis.window = {};

    await expect(speakWord("apple")).resolves.toEqual({
      ok: false,
      reason: "inAppBrowser"
    });
  });
});
