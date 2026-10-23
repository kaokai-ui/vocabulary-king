import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exportGameVocabulary, getVocabularyDataRepoPath } from "./export-game-vocabulary.mjs";

function isWithinPath(parentPath, candidatePath) {
  const relativePath = path.relative(parentPath, candidatePath);
  return relativePath === "" ||
    (relativePath !== ".." && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath));
}

function pathsOverlap(firstPath, secondPath) {
  return isWithinPath(firstPath, secondPath) || isWithinPath(secondPath, firstPath);
}

function canonicalizeProspectivePath(targetPath) {
  let existingPath = targetPath;
  const missingSegments = [];

  while (!fs.existsSync(existingPath)) {
    const parentPath = path.dirname(existingPath);
    if (parentPath === existingPath) {
      break;
    }
    missingSegments.unshift(path.basename(existingPath));
    existingPath = parentPath;
  }

  const realExistingPath = fs.existsSync(existingPath) ? fs.realpathSync(existingPath) : existingPath;
  return path.resolve(realExistingPath, ...missingSegments);
}

function validateOutputPath(outPath, projectRoot, dataRepoRoot) {
  if (!String(outPath ?? "").trim()) {
    throw new Error("Missing required --out <folder> argument.");
  }

  const requestedPath = path.resolve(outPath);
  const canonicalOutputPath = canonicalizeProspectivePath(requestedPath);
  const protectedRoots = [projectRoot, dataRepoRoot].map((root) => {
    const resolved = path.resolve(root);
    return fs.existsSync(resolved) ? fs.realpathSync(resolved) : resolved;
  });

  if (protectedRoots.some((root) => pathsOverlap(root, requestedPath) || pathsOverlap(root, canonicalOutputPath))) {
    throw new Error("The iOS export folder must be outside both the VocabularyKing repo and the vocabulary data repo.");
  }

  if (fs.existsSync(requestedPath)) {
    if (!fs.statSync(requestedPath).isDirectory()) {
      throw new Error(`The iOS export target is not a folder: ${requestedPath}`);
    }
    if (fs.readdirSync(requestedPath).length > 0) {
      throw new Error(`The iOS export folder must be empty: ${requestedPath}`);
    }
  }

  return requestedPath;
}

function parseOutputArgument(args) {
  let outPath;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--out") {
      if (outPath !== undefined || !args[index + 1] || args[index + 1].startsWith("--")) {
        throw new Error("Usage: npm run export:ios-locales -- --out <folder>");
      }
      outPath = args[index + 1];
      index += 1;
      continue;
    }

    if (argument.startsWith("--out=")) {
      if (outPath !== undefined || !argument.slice("--out=".length).trim()) {
        throw new Error("Usage: npm run export:ios-locales -- --out <folder>");
      }
      outPath = argument.slice("--out=".length);
      continue;
    }

    throw new Error(`Unknown argument: ${argument}. Usage: npm run export:ios-locales -- --out <folder>`);
  }

  if (outPath === undefined) {
    throw new Error("Usage: npm run export:ios-locales -- --out <folder>");
  }

  return outPath;
}

function countExportedLocales(catalog) {
  return Object.fromEntries(
    ["ja", "ko"].map((locale) => [
      locale,
      Object.values(catalog.tracks ?? {}).reduce((total, track) => total + (track.locales?.[locale]?.totalWords ?? 0), 0)
    ])
  );
}

export function exportIosVocabularyLocales({ outPath, dataRepoRoot = getVocabularyDataRepoPath(), projectRoot = process.cwd() } = {}) {
  const resolvedDataRepoRoot = path.resolve(dataRepoRoot);
  const resolvedProjectRoot = path.resolve(projectRoot);
  const resolvedOutputPath = validateOutputPath(outPath, resolvedProjectRoot, resolvedDataRepoRoot);
  fs.mkdirSync(resolvedOutputPath, { recursive: true });

  const result = exportGameVocabulary({
    dataRepoRoot: resolvedDataRepoRoot,
    dataRoot: resolvedOutputPath,
    extraLocales: ["ja", "ko"],
    includeUidAliases: true
  });

  if (result.skipped) {
    throw new Error(`Vocabulary source repo not found at ${resolvedDataRepoRoot}; iOS locale export was not produced.`);
  }

  const catalog = JSON.parse(fs.readFileSync(path.join(resolvedOutputPath, "catalog.json"), "utf8"));
  const localeCounts = countExportedLocales(catalog);
  const missingLocales = Object.entries(localeCounts).filter(([, totalWords]) => totalWords <= 0).map(([locale]) => locale);

  if (missingLocales.length > 0) {
    throw new Error(`The iOS export is missing translated vocabulary for: ${missingLocales.join(", ")}.`);
  }

  console.log(`iOS locale export written to ${resolvedOutputPath} (ja: ${localeCounts.ja}, ko: ${localeCounts.ko}).`);
  return { outPath: resolvedOutputPath, localeCounts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const outPath = parseOutputArgument(process.argv.slice(2));
    exportIosVocabularyLocales({ outPath });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
