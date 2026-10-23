// The pill next to a word names the vocabulary track it came from. Only the school tracks
// add the word's CEEC level (L1-L6); the GEPT and TOEIC sources also carry CEEC levels, but
// showing "L5" there reads like a GEPT or TOEIC grade, so those tracks show their name only.
const BADGE_KEYS = {
  elementary: "wordBadgeElementary",
  "junior-high": "wordBadgeJuniorHigh",
  "senior-high": "wordBadgeSeniorHigh",
  "senior-high-5-6": "wordBadgeSeniorHigh",
  "gept-elementary": "wordBadgeGeptElementary",
  "gept-intermediate": "wordBadgeGeptIntermediate",
  "gept-high-intermediate": "wordBadgeGeptHighIntermediate",
  toeic: "wordBadgeToeic",
  "toeic-advanced": "wordBadgeToeicAdvanced",
  toefl: "wordBadgeToefl",
  ielts: "wordBadgeIelts",
  gre: "wordBadgeGre",
  gmat: "wordBadgeGmat"
};

const LEVELED_TRACKS = new Set(["junior-high", "senior-high", "senior-high-5-6"]);
const EXAM_LEVEL_TRACKS = new Set(["toeic", "toeic-advanced", "toefl", "ielts", "gre", "gmat"]);

export function formatWordBadge(text, trackId, level) {
  const name = text[BADGE_KEYS[trackId]];
  if (!name) {
    return level ?? "";
  }
  const examLevel = String(level ?? "").trim();
  if (EXAM_LEVEL_TRACKS.has(trackId) && examLevel) {
    return `${name} ${examLevel}`;
  }
  const levelNumber = LEVELED_TRACKS.has(trackId) ? /^L([1-6])$/.exec(String(level ?? "").trim())?.[1] : null;
  return levelNumber ? `${name} Level ${levelNumber}` : name;
}
