import { afterEach, describe, expect, it, vi } from "vitest";
import { getYoudaoAudioUrl, isLikelyInAppBrowser, isShortPronunciationText, speakWord, stopSpeaking } from "./speech";

describe("speech helpers", () => {
  afterEach(() => {
    stopSpeaking();
    delete globalThis.window;
    vi.unstubAllGlobals();
  });

  it("recognizes words and short phrases but not example sentences", () => {
    expect(isShortPronunciationText("apple")).toBe(true);
    expect(isShortPronunciationText("Good morning")).toBe(true);
    expect(isShortPronunciationText("The teacher encouraged the students.")).toBe(false);
    expect(isShortPronunciationText("Good morning（早安）")).toBe(false);
  });

  it("maps Youdao audio types to US and UK accents", () => {
    expect(getYoudaoAudioUrl("good morning", "US")).toContain("audio=good%20morning&type=2");
    expect(getYoudaoAudioUrl("good morning", "UK")).toContain("audio=good%20morning&type=1");
  });

  it("uses Youdao MP3 for a short pronunciation before browser TTS", async () => {
    const play = vi.fn(() => Promise.resolve());
    const Audio = vi.fn(function MockAudio(url) {
      this.url = url;
      this.play = play;
      this.pause = vi.fn();
    });

    globalThis.window = { Audio };

    await expect(speakWord("apple", { accent: "UK" })).resolves.toMatchObject({
      ok: true,
      source: "youdao"
    });
    expect(Audio).toHaveBeenCalledWith(expect.stringContaining("audio=apple&type=1"));
    expect(play).toHaveBeenCalledTimes(1);
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

  it("speaks an example sentence with an English voice when synthesis is available", async () => {
    const speak = vi.fn();
    const cancel = vi.fn();

    globalThis.window = {
      setTimeout,
      clearTimeout,
      speechSynthesis: {
        getVoices: () => [{ name: "Test English", lang: "en-US" }],
        speak,
        cancel
      },
      SpeechSynthesisUtterance: function SpeechSynthesisUtterance(text) {
        this.text = text;
      }
    };

    const result = await speakWord("The teacher encouraged the students to review the new vocabulary before the quiz.");

    expect(result).toMatchObject({ ok: true, source: "speechSynthesis" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0][0].text).toContain("review the new vocabulary");
    expect(speak.mock.calls[0][0].lang).toBe("en-US");
  });

  it("falls back to browser TTS when the MP3 cannot play", async () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    const play = vi.fn(() => Promise.reject(new Error("audio unavailable")));
    const Audio = vi.fn(function MockAudio(url) {
      this.url = url;
      this.play = play;
      this.pause = vi.fn();
    });

    globalThis.window = {
      setTimeout,
      clearTimeout,
      Audio,
      speechSynthesis: {
        getVoices: () => [{ name: "Test English", lang: "en-GB" }],
        speak,
        cancel
      },
      SpeechSynthesisUtterance: function SpeechSynthesisUtterance(text) {
        this.text = text;
      }
    };

    await expect(speakWord("apple", { accent: "UK" })).resolves.toMatchObject({
      ok: true,
      source: "speechSynthesis"
    });
    expect(speak.mock.calls[0][0].lang).toBe("en-GB");
  });
});
