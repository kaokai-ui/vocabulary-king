import { describe, expect, it } from "vitest";
import { getLevelTestRulerMarkers } from "./levelTestRuler";

describe("level test ruler labels", () => {
  const tracks = [
    { id: "elementary", median: 1000 },
    { id: "gept-elementary", median: 1300 },
    { id: "junior-high", median: 1300 },
    { id: "toeic", median: 2500 },
    { id: "senior-high", median: 3300 },
    { id: "toeic-advanced", median: 4600 },
    { id: "ielts", median: 5200 },
    { id: "toefl", median: 6800 },
    { id: "gre", median: 14500 },
    { id: "gmat", median: 14700 }
  ];

  it("always keeps junior high, TOEIC, IELTS, and GRE labels for mobile", () => {
    const markers = getLevelTestRulerMarkers(tracks, (id) => id);

    expect(markers.filter((marker) => marker.mobileLabel).map((marker) => marker.label))
      .toEqual(["junior-high", "toeic", "ielts", "gre"]);
    expect(markers.filter((marker) => marker.mobileLabel).map((marker) => marker.mobileLabelRow))
      .toEqual([0, 1, 0, 1]);
  });

  it("gives desktop additional labels and combines tracks at the same median", () => {
    const markers = getLevelTestRulerMarkers(tracks, (id) => id);
    const juniorHigh = markers.find((marker) => marker.median === 1300);

    expect(markers.length).toBeGreaterThan(4);
    expect(juniorHigh.label).toBe("junior-high");
    expect(juniorHigh.names).toBe("gept-elementary, junior-high");
    expect(new Set(markers.map((marker) => marker.desktopLabelRow)))
      .toEqual(new Set([0, 1, 2, 3]));
  });
});
