import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { TRACK_DEFINITIONS } from "./vocabulary-source-definitions.mjs";
import { formatSourceExample } from "./vocabulary-data-utils.mjs";
import { createCanonicalSensedRow } from "./vocabulary-senses.mjs";
import { buildIeltsSourceRecords } from "./build-ielts-source.mjs";
import { readWorkbookTrackEntries, splitCombinedExample } from "./vocabulary-workbook-conversion.mjs";

const DEFAULT_DATA_REPO = "D:\\Game\\VocabularyKing-data";

function parseArguments(args) {
  const options = {
    root: process.cwd(),
    outputDirectory: process.env.VOCABULARY_DATA_REPO || DEFAULT_DATA_REPO,
    force: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === "--source-root") {
      options.root = path.resolve(args[++index]);
    } else if (argument === "--output-dir") {
      options.outputDirectory = path.resolve(args[++index]);
    } else if (argument === "--force") {
      options.force = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  options.root = path.resolve(options.root);
  options.outputDirectory = path.resolve(options.outputDirectory);
  return options;
}

function sourceRowToJsonlRecord(trackId, entry) {
  const exampleParts = splitCombinedExample(entry.example);
  const pos = Array.isArray(entry.pos) ? entry.pos.join("\n") : String(entry.pos ?? "");
  const sourceRow = createCanonicalSensedRow({
    track: trackId,
    level: entry.level,
    word: entry.word,
    pos,
    kk: String(entry.kk ?? ""),
    meaning_zh: String(entry.sourceMeaning ?? entry.meaning ?? ""),
    example_en: exampleParts.example_en,
    example_zh: exampleParts.example_zh,
    meaning_ja: "",
    example_ja: "",
    meaning_ko: "",
    example_ko: "",
    example_format: exampleParts.example_format
  });

  if (formatSourceExample(sourceRow) !== String(entry.example ?? "").trim()) {
    throw new Error(`Could not losslessly split an example for ${trackId}/${entry.word}.`);
  }

  return sourceRow;
}

export function convertWorkbookSources({ root = process.cwd(), outputDirectory = process.env.VOCABULARY_DATA_REPO || DEFAULT_DATA_REPO, force = false } = {}) {
  const resolvedRoot = path.resolve(root);
  const resolvedOutput = path.resolve(outputDirectory);
  const existingFiles = TRACK_DEFINITIONS
    .map((definition) => path.join(resolvedOutput, "data", `${definition.id}.jsonl`))
    .filter((filePath) => fs.existsSync(filePath));

  if (existingFiles.length && !force) {
    throw new Error(`Refusing to overwrite ${existingFiles.length} existing track file(s); pass --force to replace them.`);
  }

  const trackEntries = readWorkbookTrackEntries(resolvedRoot, { skipTrackIds: ["ielts"] });
  const ieltsRecords = buildIeltsSourceRecords({ root: resolvedRoot }).records;
  const summaries = [];

  for (const definition of TRACK_DEFINITIONS) {
    const entries = trackEntries.get(definition.id) ?? [];
    const sourceRecords = definition.id === "ielts" ? ieltsRecords : entries;

    if (definition.available && sourceRecords.length === 0) {
      throw new Error(`Workbook conversion produced no entries for ${definition.id}.`);
    }

    const filePath = path.join(resolvedOutput, "data", `${definition.id}.jsonl`);
    const records = definition.id === "ielts"
      ? sourceRecords
      : sourceRecords.map((entry) => sourceRowToJsonlRecord(definition.id, entry));
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : ""), "utf8");
    summaries.push(`${definition.id}: ${records.length} entries -> ${path.relative(resolvedOutput, filePath)}`);
  }

  console.log(`Converted workbook sources:\n- ${summaries.join("\n- ")}`);
  console.log(`Local vocabulary data directory: ${resolvedOutput}`);
  return { outputDirectory: resolvedOutput, summaries };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    convertWorkbookSources(parseArguments(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
