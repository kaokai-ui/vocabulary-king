import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertNoPublicLocaleArtifacts } from "./vocabulary-locale-safety.mjs";

const temporaryDirectories = [];

function createDataRoot() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vocabulary-locale-safety-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("public vocabulary locale safety", () => {
  it("accepts catalog and paths without locale artifacts", () => {
    const dataRoot = createDataRoot();
    fs.mkdirSync(path.join(dataRoot, "tracks", "junior-high"), { recursive: true });

    expect(() => assertNoPublicLocaleArtifacts(dataRoot, { tracks: { "junior-high": {} } })).not.toThrow();
  });

  it("rejects Japanese or Korean overlay paths", () => {
    const dataRoot = createDataRoot();
    const overlayPath = path.join(dataRoot, "tracks", "junior-high", "ja", "chunk-001.json");
    fs.mkdirSync(path.dirname(overlayPath), { recursive: true });
    fs.writeFileSync(overlayPath, "[]\n", "utf8");

    expect(() => assertNoPublicLocaleArtifacts(dataRoot, { tracks: { "junior-high": {} } })).toThrow(/ja/);
  });

  it("rejects locale metadata even when overlay files are absent", () => {
    const dataRoot = createDataRoot();

    expect(() =>
      assertNoPublicLocaleArtifacts(dataRoot, {
        tracks: { "junior-high": { locales: { ko: { totalWords: 1 } } } }
      })
    ).toThrow(/locales/);
  });
});
