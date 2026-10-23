import {
  buildDisambiguatedVocabularyId,
  buildStableVocabularyId,
  hashVocabularyPart
} from "../src/lib/vocabularyIdentity.js";

export function normalizeVocabularyEntries(vocabulary) {
  const groups = new Map();

  for (const entry of vocabulary) {
    const groupKey = `${entry.level}\u0000${entry.word}\u0000${entry.meaning}`;
    const group = groups.get(groupKey) ?? [];

    group.push(entry);
    groups.set(groupKey, group);
  }

  const normalizedVocabulary = [];

  for (const group of groups.values()) {
    const uniqueEntries = [];
    const seenExactRows = new Set();

    for (const entry of group) {
      const exactKey = `${entry.level}\u0000${entry.word}\u0000${entry.meaning}\u0000${entry.example}`;

      if (seenExactRows.has(exactKey)) {
        continue;
      }

      seenExactRows.add(exactKey);
      uniqueEntries.push(entry);
    }

    const candidateIds = uniqueEntries.map((entry) =>
      uniqueEntries.length === 1
        ? buildStableVocabularyId(entry.level, entry.word, entry.meaning)
        : buildDisambiguatedVocabularyId(entry.level, entry.word, entry.meaning, entry.example)
    );
    const candidateIdCounts = new Map();

    for (const id of candidateIds) {
      candidateIdCounts.set(id, (candidateIdCounts.get(id) ?? 0) + 1);
    }

    for (const [index, entry] of uniqueEntries.entries()) {
      const candidateId = candidateIds[index];

      normalizedVocabulary.push({
        ...entry,
        id:
          (candidateIdCounts.get(candidateId) ?? 0) > 1
            ? `${candidateId}-x${hashVocabularyPart(entry.example)}`
            : candidateId
      });
    }
  }

  return normalizedVocabulary;
}

export function formatSourceMeaning(sourceRow) {
  const meaning = String(sourceRow?.meaning_zh ?? "").trim();
  const pos = String(sourceRow?.pos ?? "").trim();

  if (sourceRow?.track === "toeic" && pos) {
    return `${pos}. ${meaning}`;
  }

  return meaning;
}

export function formatSourceExample(sourceRow) {
  const english = String(sourceRow?.example_en ?? "").trim();
  const chinese = String(sourceRow?.example_zh ?? "").trim();
  const format = sourceRow?.example_format;

  if (
    format &&
    typeof format.before === "string" &&
    typeof format.after === "string"
  ) {
    return `${english}${format.before}${chinese}${format.after}`;
  }

  if (english && chinese) {
    return `${english} (${chinese})`;
  }

  return english || chinese;
}

function buildVocabularyRecords(trackId, sourceRows) {
  const vocabulary = sourceRows.map((sourceRow, sourceIndex) => {
    if (sourceRow.track !== trackId) {
      throw new Error(`Source row ${sourceIndex + 1} belongs to '${sourceRow.track}', expected '${trackId}'.`);
    }

    return {
      level: String(sourceRow?.level ?? "").trim(),
      word: String(sourceRow?.word ?? "").trim(),
      meaning: formatSourceMeaning(sourceRow),
      example: formatSourceExample(sourceRow),
      sourceIndex
    };
  });

  return vocabulary;
}

export function buildLegacyTrackExportRecords(trackId, sourceRows) {
  return normalizeVocabularyEntries(buildVocabularyRecords(trackId, sourceRows)).map((entry) => ({
    level: entry.level,
    word: entry.word,
    meaning: entry.meaning,
    example: entry.example,
    id: entry.id,
    uid: entry.id,
    sourceIndex: entry.sourceIndex
  }));
}

export function buildTrackExportRecords(trackId, sourceRows) {
  return buildVocabularyRecords(trackId, sourceRows).map((entry, sourceIndex) => {
    const uid = String(sourceRows[sourceIndex]?.uid ?? "").trim();

    if (!uid) {
      throw new Error(`Source row ${sourceIndex + 1} in '${trackId}' is missing uid. Run npm run ensure:vocab-uids.`);
    }

    return {
      level: entry.level,
      word: entry.word,
      meaning: entry.meaning,
      example: entry.example,
      id: uid,
      uid,
      sourceIndex
    };
  });
}
