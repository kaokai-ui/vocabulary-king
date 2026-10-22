import fs from "node:fs";
import path from "node:path";

function collectLocalePaths(dataRoot) {
  const paths = [];

  function visit(directory) {
    if (!fs.existsSync(directory)) {
      return;
    }

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      const relativePath = path.relative(dataRoot, entryPath).split(path.sep).join("/");

      if (["ja", "ko"].includes(entry.name.toLowerCase())) {
        paths.push(relativePath);
      }

      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        visit(entryPath);
      }
    }
  }

  visit(dataRoot);
  return paths;
}

function collectLocaleProperties(value, location = "catalog", found = []) {
  if (!value || typeof value !== "object") {
    return found;
  }

  if (!Array.isArray(value) && Object.hasOwn(value, "locales")) {
    found.push(`${location}.locales`);
  }

  for (const [key, child] of Object.entries(value)) {
    collectLocaleProperties(child, `${location}.${key}`, found);
  }

  return found;
}

export function findPublicLocaleArtifacts(dataRoot, catalog) {
  return [...collectLocalePaths(path.resolve(dataRoot)), ...collectLocaleProperties(catalog)];
}

export function assertNoPublicLocaleArtifacts(dataRoot, catalog) {
  const artifacts = findPublicLocaleArtifacts(dataRoot, catalog);

  if (artifacts.length > 0) {
    throw new Error(
      `public/data must not contain ja/ko locale overlays or locale metadata; found: ${artifacts.join(", ")}.`
    );
  }
}
