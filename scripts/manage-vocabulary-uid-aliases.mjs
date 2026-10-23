import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { TRACK_DEFINITIONS } from "./vocabulary-source-definitions.mjs";
import {
  addUidAlias,
  readUidAliasData,
  recordDeletedUid,
  UID_ALIASES_RELATIVE_PATH,
  validateVocabularyUidState
} from "./vocabulary-uids.mjs";

const DEFAULT_DATA_REPO = "D:\\Game\\VocabularyKing-data";

function readSourceRowsByTrack(root) {
  const rowsByTrack = new Map();
  for (const definition of TRACK_DEFINITIONS.filter((track) => track.available)) {
    const filePath = path.join(root, "data", `${definition.id}.jsonl`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing vocabulary source file: ${filePath}`);
    }
    rowsByTrack.set(definition.id, fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/u)
      .filter((line) => line.trim())
      .map((line, index) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          throw new Error(`Invalid JSON in ${filePath}:${index + 1}: ${error instanceof Error ? error.message : error}`);
        }
      }));
  }
  return rowsByTrack;
}

function parseArguments(args) {
  const options = { action: "", track: "", uid: "", targetUid: "", reason: "", dataDirectory: process.env.VOCABULARY_DATA_REPO || DEFAULT_DATA_REPO };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--merge") {
      options.action = "merge";
    } else if (argument === "--delete") {
      options.action = "delete";
    } else if (argument === "--track") {
      options.track = args[++index] ?? "";
    } else if (argument === "--uid" || argument === "--from") {
      options.uid = args[++index] ?? "";
    } else if (argument === "--to") {
      options.targetUid = args[++index] ?? "";
    } else if (argument === "--reason") {
      options.reason = args[++index] ?? "";
    } else if (argument === "--data-dir") {
      options.dataDirectory = path.resolve(args[++index] ?? "");
    } else {
      throw new Error("Usage: node scripts/manage-vocabulary-uid-aliases.mjs --merge --track <track> --from <old-uid> --to <kept-uid> [--data-dir <repo>] | --delete --track <track> --uid <uid> [--reason <text>] [--data-dir <repo>]");
    }
  }

  if (!options.action || !options.track || !options.uid || (options.action === "merge" && !options.targetUid)) {
    throw new Error("Usage: node scripts/manage-vocabulary-uid-aliases.mjs --merge --track <track> --from <old-uid> --to <kept-uid> [--data-dir <repo>] | --delete --track <track> --uid <uid> [--reason <text>] [--data-dir <repo>]");
  }
  return options;
}

export function manageVocabularyUidAlias({ dataDirectory, action, track, uid, targetUid, reason = "" }) {
  const root = path.resolve(dataDirectory);
  const sourceRowsByTrack = readSourceRowsByTrack(root);
  const aliasData = readUidAliasData(root);
  const { allUids, uidsByTrack } = validateVocabularyUidState({ sourceRowsByTrack, aliasData });
  const next = action === "merge"
    ? addUidAlias(aliasData, { track, aliasUid: uid, targetUid, uidsByTrack, allUids })
    : action === "delete"
      ? recordDeletedUid(aliasData, { track, uid, reason, uidsByTrack })
      : (() => { throw new Error(`Unsupported UID alias action '${action}'.`); })();
  fs.writeFileSync(path.join(root, UID_ALIASES_RELATIVE_PATH), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const result = manageVocabularyUidAlias(options);
    console.log(`Updated UID aliases in ${path.join(options.dataDirectory, UID_ALIASES_RELATIVE_PATH)} (${result.aliases.length} aliases, ${result.deleted.length} deletions).`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
