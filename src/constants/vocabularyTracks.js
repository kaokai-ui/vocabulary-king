export const vocabularyTracks = [
  { value: "elementary", labelKey: "vocabularyTrackElementary", enabled: true },
  { value: "junior-high", labelKey: "vocabularyTrackJuniorHigh", enabled: true },
  { value: "senior-high", labelKey: "vocabularyTrackSeniorHigh", enabled: true },
  { value: "senior-high-5-6", labelKey: "vocabularyTrackSeniorHigh56", enabled: true },
  { value: "gept-elementary", labelKey: "vocabularyTrackGeptElementary", enabled: true },
  { value: "gept-intermediate", labelKey: "vocabularyTrackGeptIntermediate", enabled: true },
  { value: "gept-high-intermediate", labelKey: "vocabularyTrackGeptHighIntermediate", enabled: true },
  { value: "toeic", labelKey: "vocabularyTrackToeic", enabled: true },
  { value: "toeic-advanced", labelKey: "vocabularyTrackToeicAdvanced", enabled: true },
  { value: "toefl", labelKey: "vocabularyTrackToefl", enabled: true }
];

const legacyVocabularyTrackAliases = {
  gept: "gept-elementary"
};

export const defaultVocabularyTrack = "junior-high";

export function normalizeVocabularyTrack(trackId) {
  const candidate = legacyVocabularyTrackAliases[trackId] ?? trackId;
  const matchedTrack = vocabularyTracks.find((track) => track.value === candidate && track.enabled);

  if (matchedTrack) {
    return matchedTrack.value;
  }

  return defaultVocabularyTrack;
}
