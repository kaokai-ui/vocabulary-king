import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { TRACK_DEFINITIONS } from "./vocabulary-source-definitions.mjs";

const DEFAULT_DATA_REPO = "D:\\Game\\VocabularyKing-data";
const DEFAULT_CMU_DICT = "";
const ARPABET_TO_IPA = Object.freeze({
  AA: "ɑ", AE: "æ", AH: "ʌ", AO: "ɔ", AW: "aʊ", AY: "aɪ", EH: "ɛ", ER: "ɝ", EY: "eɪ",
  IH: "ɪ", IY: "i", OW: "oʊ", OY: "ɔɪ", UH: "ʊ", UW: "u",
  B: "b", CH: "tʃ", D: "d", DH: "ð", F: "f", G: "ɡ", HH: "h", JH: "dʒ",
  K: "k", L: "l", M: "m", N: "n", NG: "ŋ", P: "p", R: "ɹ", S: "s",
  SH: "ʃ", T: "t", TH: "θ", V: "v", W: "w", Y: "j", Z: "z", ZH: "ʒ"
});
const VOWELS = new Set(["AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY", "OW", "OY", "UH", "UW"]);
const LEGAL_ONSETS = new Set([
  "P", "B", "T", "D", "K", "G", "F", "V", "TH", "DH", "S", "Z", "SH", "ZH", "HH", "M", "N", "L", "R", "W", "Y", "CH", "JH",
  "P L", "B L", "K L", "G L", "F L", "S L",
  "P R", "B R", "T R", "D R", "K R", "G R", "F R", "TH R", "SH R",
  "S P", "S T", "S K", "S M", "S N", "S W", "S F", "S L", "S P L", "S P R", "S T R", "S K R", "S K L", "S K W",
  "K W", "G W", "T W", "D W", "P Y", "B Y", "K Y", "F Y", "HH Y", "M Y", "N Y", "L Y", "R Y"
]);
const REPORT_DIRECTORY = "reports";

function parseArguments(args) {
  const options = { dataDir: process.env.VOCABULARY_DATA_REPO || DEFAULT_DATA_REPO, cmudict: DEFAULT_CMU_DICT };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--data-dir") options.dataDir = args[++index] ?? "";
    else if (argument.startsWith("--data-dir=")) options.dataDir = argument.slice("--data-dir=".length);
    else if (argument === "--cmudict") options.cmudict = args[++index] ?? "";
    else if (argument.startsWith("--cmudict=")) options.cmudict = argument.slice("--cmudict=".length);
    else throw new Error("Usage: npm run fill:vocab-ipa -- --data-dir <repo> --cmudict <path>");
  }
  if (!String(options.dataDir).trim() || !String(options.cmudict).trim()) {
    throw new Error("Usage: npm run fill:vocab-ipa -- --data-dir <repo> --cmudict <path>");
  }
  return {
    dataDir: path.resolve(options.dataDir),
    cmudict: path.resolve(options.cmudict)
  };
}

function isVowelToken(token) {
  return VOWELS.has(/^([A-Z]+)/u.exec(token)?.[1] ?? "");
}

function onsetStartForStress(tokens, vowelIndex) {
  let previousVowel = -1;
  for (let index = vowelIndex - 1; index >= 0; index -= 1) {
    if (isVowelToken(tokens[index])) {
      previousVowel = index;
      break;
    }
  }
  const consonantStart = previousVowel + 1;
  const cluster = tokens.slice(consonantStart, vowelIndex).map((token) => token.replace(/[012]$/u, ""));
  for (let length = cluster.length; length > 0; length -= 1) {
    const suffix = cluster.slice(-length).join(" ");
    if (LEGAL_ONSETS.has(suffix)) return vowelIndex - length;
  }
  return cluster.length ? vowelIndex - 1 : vowelIndex;
}

export function arpabetToIpa(pronunciation) {
  const tokens = String(pronunciation ?? "").trim().split(/\s+/u).filter(Boolean);
  if (!tokens.length) return "";
  const stressAt = new Map();
  for (const [index, token] of tokens.entries()) {
    const parsed = /^([A-Z]+)([012])?$/u.exec(token);
    if (!parsed || !Object.hasOwn(ARPABET_TO_IPA, parsed[1])) {
      throw new Error(`Unsupported CMU ARPAbet token '${token}'.`);
    }
    const stress = parsed[2];
    if (isVowelToken(token) && (stress === "1" || stress === "2")) {
      const markerIndex = onsetStartForStress(tokens, index);
      stressAt.set(markerIndex, `${stressAt.get(markerIndex) ?? ""}${stress === "1" ? "ˈ" : "ˌ"}`);
    }
  }

  return tokens.map((token, index) => {
    const parsed = /^([A-Z]+)([012])?$/u.exec(token);
    const phone = parsed[1];
    const stress = parsed[2];
    let ipa = ARPABET_TO_IPA[phone];
    if (phone === "AH" && stress === "0") ipa = "ə";
    if (phone === "ER") ipa = stress === "0" ? "ɚ" : "ɝ";
    return `${stressAt.get(index) ?? ""}${ipa}`;
  }).join("");
}

export function parseCmuDictionary(text) {
  const dictionary = new Map();
  for (const line of String(text ?? "").split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(";;;")) continue;
    const match = /^(\S+)\s+(.+)$/u.exec(trimmed);
    if (!match) continue;
    const variant = /^(.*)\((\d+)\)$/u.exec(match[1]);
    const word = (variant?.[1] ?? match[1]).toLocaleLowerCase("en-US");
    const pronunciationIndex = variant ? Number(variant[2]) : 1;
    const pronunciations = dictionary.get(word) ?? [];
    pronunciations.push({ index: pronunciationIndex, arpabet: match[2].trim() });
    dictionary.set(word, pronunciations);
  }
  for (const pronunciations of dictionary.values()) pronunciations.sort((left, right) => left.index - right.index);
  return dictionary;
}

function readJsonl(filePath) {
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/u).filter((line) => line.trim()).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid JSON in ${filePath}:${index + 1}: ${error instanceof Error ? error.message : error}`);
    }
  });
}

function writeJsonl(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

export function fillVocabularyIpa({ dataDir, cmudict } = {}) {
  const dataRepoRoot = path.resolve(dataDir ?? process.env.VOCABULARY_DATA_REPO ?? DEFAULT_DATA_REPO);
  const cmudictPath = path.resolve(cmudict ?? "");
  if (!fs.existsSync(cmudictPath) || !fs.statSync(cmudictPath).isFile()) {
    throw new Error(`CMUdict file not found: ${cmudictPath}`);
  }
  const dictionaryText = fs.readFileSync(cmudictPath, "utf8");
  const dictionary = parseCmuDictionary(dictionaryText);
  const sourceMetadataPath = path.join(path.dirname(cmudictPath), "SOURCE.json");
  const sourceMetadata = fs.existsSync(sourceMetadataPath)
    ? JSON.parse(fs.readFileSync(sourceMetadataPath, "utf8"))
    : {};
  const unmatched = [];
  const multiplePronunciations = [];
  const tracks = {};

  for (const definition of TRACK_DEFINITIONS.filter((track) => track.available)) {
    const filePath = path.join(dataRepoRoot, "data", `${definition.id}.jsonl`);
    if (!fs.existsSync(filePath)) throw new Error(`Missing vocabulary source JSONL: ${filePath}`);
    const rows = readJsonl(filePath);
    let matched = 0;
    let phraseRows = 0;
    let multiplePronunciationCount = 0;

    for (const [index, row] of rows.entries()) {
      if (row.track !== definition.id) throw new Error(`Unexpected track '${row.track}' in ${filePath}:${index + 1}.`);
      const word = String(row.word ?? "").trim();
      let pronunciationList;
      let reason = "";
      if (/\s/u.test(word)) {
        phraseRows += 1;
        reason = "phrase";
      } else {
        pronunciationList = dictionary.get(word.toLocaleLowerCase("en-US"));
        if (!pronunciationList?.length) reason = "not-in-cmudict";
      }

      row.ipa_uk = "";
      if (reason) {
        row.ipa_us = "";
        unmatched.push({ track: definition.id, uid: String(row.uid ?? ""), word, reason });
        continue;
      }

      row.ipa_us = arpabetToIpa(pronunciationList[0].arpabet);
      matched += 1;
      if (pronunciationList.length > 1) {
        multiplePronunciationCount += 1;
        multiplePronunciations.push({
          track: definition.id,
          uid: String(row.uid ?? ""),
          word,
          variants: pronunciationList.length,
          selectedVariant: pronunciationList[0].index,
          ipa_us: row.ipa_us
        });
      }
    }

    writeJsonl(filePath, rows);
    tracks[definition.id] = {
      rows: rows.length,
      matched,
      matchedPercent: rows.length ? Number((matched * 100 / rows.length).toFixed(2)) : 0,
      phrases: phraseRows,
      unmatched: rows.length - matched,
      multiplePronunciationRows: multiplePronunciationCount
    };
  }

  const reportRoot = path.join(dataRepoRoot, REPORT_DIRECTORY);
  fs.mkdirSync(reportRoot, { recursive: true });
  const report = {
    schemaVersion: 1,
    dictionary: {
      name: "CMU Pronouncing Dictionary (CMUdict)",
      version: String(sourceMetadata.version ?? "CMUdict file version not specified"),
      commit: String(sourceMetadata.commit ?? ""),
      sourceUrl: String(sourceMetadata.sourceUrl ?? ""),
      sourceFile: path.relative(dataRepoRoot, cmudictPath).replaceAll("\\", "/"),
      sha256: createHash("sha256").update(dictionaryText).digest("hex")
    },
    totals: {
      rows: Object.values(tracks).reduce((total, track) => total + track.rows, 0),
      matched: Object.values(tracks).reduce((total, track) => total + track.matched, 0),
      unmatched: unmatched.length,
      multiplePronunciationRows: multiplePronunciations.length
    },
    tracks,
    unmatchedFile: "reports/vocab-ipa-unmatched.jsonl",
    multiplePronunciationsFile: "reports/vocab-ipa-multiple-pronunciations.jsonl"
  };
  fs.writeFileSync(path.join(reportRoot, "vocab-ipa-fill.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeJsonl(path.join(reportRoot, "vocab-ipa-unmatched.jsonl"), unmatched);
  writeJsonl(path.join(reportRoot, "vocab-ipa-multiple-pronunciations.jsonl"), multiplePronunciations);

  for (const [track, summary] of Object.entries(tracks)) {
    console.log(`${track}: ${summary.matched}/${summary.rows} IPA matches (${summary.matchedPercent}%), ${summary.unmatched} blank, ${summary.multiplePronunciationRows} multiple pronunciations`);
  }
  console.log(`Unmatched words: ${unmatched.length}; multiple pronunciations: ${multiplePronunciations.length}`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    fillVocabularyIpa(parseArguments(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
