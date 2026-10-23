import fs from "node:fs";
import path from "node:path";

export const UID_ALIASES_RELATIVE_PATH = path.join("data", "uid-aliases.json");

export function emptyUidAliasData() {
  return { aliases: [], deleted: [] };
}

export function readUidAliasData(dataRepoRoot) {
  const aliasPath = path.join(dataRepoRoot, UID_ALIASES_RELATIVE_PATH);

  if (!fs.existsSync(aliasPath)) {
    return emptyUidAliasData();
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(aliasPath, "utf8"));
  } catch (error) {
    throw new Error(`Invalid UID aliases JSON in ${aliasPath}: ${error instanceof Error ? error.message : error}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`UID aliases file must contain an object: ${aliasPath}`);
  }
  if (parsed.aliases !== undefined && !Array.isArray(parsed.aliases)) {
    throw new Error(`UID aliases 'aliases' must be an array: ${aliasPath}`);
  }
  if (parsed.deleted !== undefined && !Array.isArray(parsed.deleted)) {
    throw new Error(`UID aliases 'deleted' must be an array: ${aliasPath}`);
  }

  return {
    aliases: Array.isArray(parsed.aliases) ? parsed.aliases : [],
    deleted: Array.isArray(parsed.deleted) ? parsed.deleted : []
  };
}

function aliasKey(track, uid) {
  return `${track}\u0000${uid}`;
}

function requiredString(value, label) {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
    throw new Error(`${label} must be a non-empty, trimmed string.`);
  }
  return value;
}

export function validateUidAliasData(aliasData, { uidsByTrack, allUids }) {
  if (aliasData?.aliases !== undefined && !Array.isArray(aliasData.aliases)) {
    throw new Error("UID alias 'aliases' must be an array.");
  }
  if (aliasData?.deleted !== undefined && !Array.isArray(aliasData.deleted)) {
    throw new Error("UID alias 'deleted' must be an array.");
  }
  const aliases = Array.isArray(aliasData?.aliases) ? aliasData.aliases : [];
  const deleted = Array.isArray(aliasData?.deleted) ? aliasData.deleted : [];
  const aliasTargets = new Map();
  const deletedKeys = new Set();

  for (const [index, record] of aliases.entries()) {
    const track = requiredString(record?.track, `UID alias ${index + 1} track`);
    const aliasUid = requiredString(record?.aliasUid, `UID alias ${index + 1} aliasUid`);
    const targetUid = requiredString(record?.targetUid, `UID alias ${index + 1} targetUid`);
    const key = aliasKey(track, aliasUid);

    if (!uidsByTrack.has(track)) {
      throw new Error(`UID alias references unknown track '${track}'.`);
    }
    if (aliasTargets.has(key)) {
      throw new Error(`Duplicate UID alias '${track}/${aliasUid}'.`);
    }
    if (uidsByTrack.get(track)?.has(aliasUid)) {
      throw new Error(`UID alias '${track}/${aliasUid}' still exists as an active source UID.`);
    }
    aliasTargets.set(key, targetUid);
  }

  for (const [index, record] of deleted.entries()) {
    const track = requiredString(record?.track, `Deleted UID ${index + 1} track`);
    const uid = requiredString(record?.uid, `Deleted UID ${index + 1} uid`);
    const key = aliasKey(track, uid);

    if (!uidsByTrack.has(track)) {
      throw new Error(`UID deletion references unknown track '${track}'.`);
    }
    if (deletedKeys.has(key) || aliasTargets.has(key)) {
      throw new Error(`Duplicate UID deletion record '${track}/${uid}'.`);
    }
    if (uidsByTrack.get(track)?.has(uid)) {
      throw new Error(`Deleted UID '${track}/${uid}' still exists as an active source UID.`);
    }
    deletedKeys.add(key);
  }

  for (const [startKey, firstTarget] of aliasTargets) {
    const [track, sourceUid] = startKey.split("\u0000");
    const visited = new Set([startKey]);
    let targetUid = firstTarget;

    while (true) {
      if (allUids.has(targetUid)) {
        break;
      }

      const targetKey = aliasKey(track, targetUid);
      if (!aliasTargets.has(targetKey)) {
        throw new Error(`UID alias '${track}/${sourceUid}' targets missing uid '${targetUid}'.`);
      }
      if (visited.has(targetKey)) {
        throw new Error(`UID alias cycle detected for '${track}/${sourceUid}'.`);
      }
      visited.add(targetKey);
      targetUid = aliasTargets.get(targetKey);
    }
  }

  return { aliases, deleted };
}

export function validateVocabularyUidState({ sourceRowsByTrack, aliasData = emptyUidAliasData() }) {
  const rowsByTrack = sourceRowsByTrack instanceof Map
    ? sourceRowsByTrack
    : new Map(Object.entries(sourceRowsByTrack ?? {}));
  const allUids = new Set();
  const uidsByTrack = new Map();
  const trackByUid = new Map();

  for (const [track, rows] of rowsByTrack) {
    const trackUids = new Set();
    uidsByTrack.set(track, trackUids);

    for (const [index, row] of rows.entries()) {
      if (typeof row?.uid !== "string" || !row.uid.trim()) {
        throw new Error(`Source row ${track}:${index + 1} is missing uid.`);
      }
      const uid = requiredString(row?.uid, `Source row ${track}:${index + 1} uid`);

      if (trackUids.has(uid) || allUids.has(uid)) {
        throw new Error(`Duplicate vocabulary uid '${uid}' in tracks '${trackByUid.get(uid)}' and '${track}'.`);
      }
      trackUids.add(uid);
      allUids.add(uid);
      trackByUid.set(uid, track);
    }
  }

  validateUidAliasData(aliasData, { uidsByTrack, allUids });
  return { allUids, uidsByTrack };
}

export function addUidAlias(aliasData, { track, aliasUid, targetUid, uidsByTrack, allUids }) {
  const normalized = {
    aliases: [...(aliasData?.aliases ?? [])],
    deleted: [...(aliasData?.deleted ?? [])]
  };
  const record = {
    track: requiredString(track, "track"),
    aliasUid: requiredString(aliasUid, "aliasUid"),
    targetUid: requiredString(targetUid, "targetUid")
  };

  if (record.aliasUid === record.targetUid) {
    throw new Error("A UID alias cannot target itself.");
  }
  if (!allUids.has(record.targetUid)) {
    throw new Error(`UID alias target '${record.targetUid}' does not exist.`);
  }
  if (uidsByTrack.get(record.track)?.has(record.aliasUid)) {
    throw new Error(`UID alias source '${record.track}/${record.aliasUid}' is still active.`);
  }
  if (normalized.aliases.some((item) => item.track === record.track && item.aliasUid === record.aliasUid)) {
    throw new Error(`UID alias '${record.track}/${record.aliasUid}' already exists.`);
  }
  if (normalized.deleted.some((item) => item.track === record.track && item.uid === record.aliasUid)) {
    throw new Error(`UID '${record.track}/${record.aliasUid}' is already recorded as deleted.`);
  }

  normalized.aliases.push(record);
  validateUidAliasData(normalized, { uidsByTrack, allUids });
  return normalized;
}

export function recordDeletedUid(aliasData, { track, uid, reason = "", uidsByTrack }) {
  const normalized = {
    aliases: [...(aliasData?.aliases ?? [])],
    deleted: [...(aliasData?.deleted ?? [])]
  };
  const record = {
    track: requiredString(track, "track"),
    uid: requiredString(uid, "uid"),
    ...(String(reason).trim() ? { reason: String(reason).trim() } : {})
  };

  if (uidsByTrack.get(record.track)?.has(record.uid)) {
    throw new Error(`Deleted UID '${record.track}/${record.uid}' is still active.`);
  }
  if (normalized.aliases.some((item) => item.track === record.track && item.aliasUid === record.uid)) {
    throw new Error(`UID '${record.track}/${record.uid}' is already recorded as an alias.`);
  }
  if (normalized.deleted.some((item) => item.track === record.track && item.uid === record.uid)) {
    throw new Error(`UID '${record.track}/${record.uid}' is already recorded as deleted.`);
  }

  normalized.deleted.push(record);
  return normalized;
}
