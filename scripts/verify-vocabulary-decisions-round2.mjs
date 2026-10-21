import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseTrailingTranslation } from "./check-vocabulary-content.mjs";
import { formatBilingualExample } from "./apply-vocabulary-decisions.mjs";

const ROOT = process.cwd();
const TASK_ROOT = path.join(ROOT, "docs", "tasks", "vocab-review-20261021");
const TRACKS = ["toefl", "toeic-advanced"];

function readJsonLines(filePath) {
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function trim(value) {
  return String(value ?? "").trim();
}

function contentKey(record) {
  return JSON.stringify([
    trim(record.level),
    trim(record.word),
    trim(record.meaning),
    trim(record.example)
  ]);
}

function expectedRecord(part, decision, applyDecision) {
  const final = applyDecision ? decision.final ?? {} : {};
  const parsed = parseTrailingTranslation(part.example);
  const english = final.example_en ?? parsed.english;
  const chinese = final.example_zh ?? parsed.translation;
  return {
    level: trim(part.level),
    word: trim(final.word ?? part.word),
    meaning: trim(final.meaning ?? part.meaning),
    example: formatBilingualExample(english, chinese)
  };
}

function listJsonFiles(directory, expression) {
  return fs.readdirSync(directory)
    .filter((fileName) => expression.test(fileName))
    .sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
}

function loadTrack(track) {
  const partDir = path.join(TASK_ROOT, "parts", track);
  const decisionDir = path.join(TASK_ROOT, "judge", track);
  const parts = listJsonFiles(partDir, /^part-\d+\.jsonl$/u)
    .flatMap((fileName) => readJsonLines(path.join(partDir, fileName)));
  const decisions = listJsonFiles(decisionDir, /^part-\d+\.decisions\.jsonl$/u)
    .flatMap((fileName) => readJsonLines(path.join(decisionDir, fileName)));
  const chunksDir = path.join(ROOT, "public", "data", "tracks", track);
  const chunks = listJsonFiles(chunksDir, /^chunk-\d+\.json$/u)
    .flatMap((fileName) => JSON.parse(fs.readFileSync(path.join(chunksDir, fileName), "utf8")));
  const partById = new Map(parts.map((record) => [record.id, record]));
  if (partById.size !== parts.length) throw new Error(`Duplicate part IDs in ${track}.`);

  const exportedByContent = new Map();
  for (const record of chunks) {
    const key = contentKey(record);
    const group = exportedByContent.get(key) ?? [];
    group.push(record);
    exportedByContent.set(key, group);
  }

  return { partById, decisions, exportedByContent };
}

function shuffle(items, seed) {
  const result = [...items];
  let state = seed >>> 0;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function verifyExport(track, input, unwrittenIds) {
  const applied = [];
  const idChanges = [];
  for (const decision of input.decisions) {
    const part = input.partById.get(decision.id);
    if (!part) throw new Error(`Missing part entry for ${track}/${decision.id}.`);
    const shouldApply = decision.decision !== "reject" && !unwrittenIds.has(decision.id);
    const expected = expectedRecord(part, decision, shouldApply);
    const matches = input.exportedByContent.get(contentKey(expected)) ?? [];
    if (matches.length !== 1) {
      throw new Error(`Expected one exported record for ${track}/${decision.id}; found ${matches.length}.`);
    }
    const [actual] = matches;
    for (const field of ["word", "meaning", "example"]) {
      if (actual[field] !== expected[field]) {
        throw new Error(`Exported ${field} mismatch for ${track}/${decision.id}.`);
      }
    }
    if (actual.id !== part.id) {
      idChanges.push({ decisionId: decision.id, oldId: part.id, newId: actual.id });
    }
    if (shouldApply) {
      applied.push({ decision, part, expected, actual });
    }
  }

  const wordChanges = applied.filter(({ decision, part }) =>
    Object.hasOwn(decision.final ?? {}, "word") && decision.final.word !== part.word
  );
  const chosen = [...wordChanges];
  const remaining = shuffle(
    applied.filter((item) => !wordChanges.some((wordChange) => wordChange.decision.id === item.decision.id)),
    track === "toefl" ? 20261022 : 20261023
  );
  const sampleSize = Math.max(20, wordChanges.length);
  chosen.push(...remaining.slice(0, Math.max(0, sampleSize - chosen.length)));
  for (const { decision, part, expected, actual } of chosen) {
    for (const field of ["word", "meaning", "example"]) {
      if (actual[field] !== expected[field]) {
        throw new Error(`Sample readback mismatch for ${track}/${decision.id} ${field}.`);
      }
    }
  }

  return {
    track,
    decisions: input.decisions.length,
    verifiedDecisions: input.decisions.length,
    writtenRecords: applied.length,
    sampledRecords: chosen.length,
    sampleSeed: track === "toefl" ? 20261022 : 20261023,
    sample: chosen.map(({ decision, part, actual }) => ({
      decisionId: decision.id,
      exportedId: actual.id,
      word: actual.word,
      meaning: actual.meaning,
      example: actual.example,
      hadWordChange: Object.hasOwn(decision.final ?? {}, "word") && decision.final.word !== part.word
    })),
    wordChanges: wordChanges.map(({ decision, part, actual }) => ({
      decisionId: decision.id,
      oldWord: part.word,
      newWord: decision.final.word,
      exportedId: actual.id
    })),
    idChanges: {
      count: idChanges.length,
      totalDecisions: input.decisions.length,
      examples: idChanges.slice(0, 20)
    }
  };
}

function summarizeFindings(filePath) {
  const findings = readJsonLines(filePath).filter((finding) => TRACKS.includes(finding.track));
  const counts = new Map();
  const exactKeys = new Set();
  const rowCheckKeys = new Set();
  for (const finding of findings) {
    counts.set(`${finding.track}\u0000${finding.check}`, (counts.get(`${finding.track}\u0000${finding.check}`) ?? 0) + 1);
    exactKeys.add(JSON.stringify([finding.track, finding.id, finding.check, finding.issue]));
    rowCheckKeys.add(JSON.stringify([finding.track, finding.id, finding.check]));
  }
  return { findings, counts, exactKeys, rowCheckKeys };
}

function compareFindings(beforePath, afterPath) {
  const before = summarizeFindings(beforePath);
  const after = summarizeFindings(afterPath);
  const newExact = after.findings.filter((finding) =>
    !before.exactKeys.has(JSON.stringify([finding.track, finding.id, finding.check, finding.issue]))
  );
  const newCheckRows = after.findings.filter((finding) =>
    !before.rowCheckKeys.has(JSON.stringify([finding.track, finding.id, finding.check]))
  );
  const removedExact = before.findings.filter((finding) =>
    !after.exactKeys.has(JSON.stringify([finding.track, finding.id, finding.check, finding.issue]))
  );
  const keys = new Set([...before.counts.keys(), ...after.counts.keys()]);
  const counts = [...keys].sort().map((key) => {
    const [track, check] = key.split("\u0000");
    return {
      track,
      check,
      before: before.counts.get(key) ?? 0,
      after: after.counts.get(key) ?? 0
    };
  });
  return {
    counts,
    newExact,
    newCheckRows,
    removedExact,
    totalBefore: before.findings.length,
    totalAfter: after.findings.length
  };
}

function parseArgs(args) {
  let beforeFindings = null;
  const unwrittenIds = new Set();
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--before-findings") {
      beforeFindings = path.resolve(args[++index]);
    } else if (args[index] === "--not-written") {
      unwrittenIds.add(args[++index]);
    } else {
      throw new Error(`Unknown argument: ${args[index]}`);
    }
  }
  return { beforeFindings, unwrittenIds };
}

function main() {
  const { beforeFindings, unwrittenIds } = parseArgs(process.argv.slice(2));
  const results = TRACKS.map((track) => verifyExport(track, loadTrack(track), unwrittenIds));
  const findings = beforeFindings
    ? compareFindings(beforeFindings, path.join(TASK_ROOT, "check-findings.jsonl"))
    : null;
  console.log(JSON.stringify({ tracks: results, findings }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(error.stack ?? error.message ?? String(error));
    process.exitCode = 1;
  }
}

export { compareFindings, contentKey, expectedRecord, shuffle, verifyExport };
