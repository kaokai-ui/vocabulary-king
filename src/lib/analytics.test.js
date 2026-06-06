import { afterEach, describe, expect, it, vi } from "vitest";
import { trackScreenView } from "./analytics";

describe("trackScreenView", () => {
  afterEach(() => {
    delete globalThis.window;
  });

  it("sends one page_view and one screen_view for a screen transition", () => {
    globalThis.window = {
      gtag: vi.fn()
    };

    trackScreenView(
      {
        pagePath: "/stats",
        pageTitle: "Vocabulary King - Stats",
        screenName: "stats"
      },
      {
        vocabulary_track: "senior-high"
      }
    );

    expect(globalThis.window.gtag).toHaveBeenCalledTimes(2);
    expect(globalThis.window.gtag).toHaveBeenNthCalledWith(
      1,
      "event",
      "page_view",
      expect.objectContaining({
        page_path: expect.stringContaining("/stats"),
        screen_name: "stats",
        vocabulary_track: "senior-high"
      })
    );
    expect(globalThis.window.gtag).toHaveBeenNthCalledWith(
      2,
      "event",
      "screen_view",
      expect.objectContaining({
        page_path: expect.stringContaining("/stats"),
        screen_name: "stats",
        vocabulary_track: "senior-high"
      })
    );
  });
});
