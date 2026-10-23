const MOBILE_RULER_TRACK_IDS = ["junior-high", "toeic", "ielts", "gre"];
const RULER_TRACK_PRIORITY = [
  ...MOBILE_RULER_TRACK_IDS,
  "elementary",
  "toeic-advanced",
  "senior-high-5-6",
  "gept-high-intermediate",
  "toefl",
  "gmat",
  "senior-high",
  "gept-intermediate",
  "gept-elementary"
];

export function getLevelTestRulerMarkers(tracks, getLabel) {
  const groupsByMedian = new Map();

  for (const track of tracks) {
    const group = groupsByMedian.get(track.median) ?? [];
    group.push(track);
    groupsByMedian.set(track.median, group);
  }

  const groups = [...groupsByMedian.entries()]
    .sort(([left], [right]) => left - right)
    .map(([median, groupedTracks]) => ({ median, tracks: groupedTracks }));
  let mobileLabelIndex = 0;

  return groups.map((group, index) => {
    const representative = group.tracks.slice().sort((left, right) =>
      getTrackPriority(left.id) - getTrackPriority(right.id)
    )[0];
    const mobileRepresentative = group.tracks.find((track) =>
      MOBILE_RULER_TRACK_IDS.includes(track.id)
    );
    const marker = {
      median: group.median,
      trackIds: group.tracks.map((track) => track.id),
      label: getLabel(representative.id),
      names: group.tracks.map((track) => getLabel(track.id)).join(", "),
      desktopLabelRow: index % 4,
      mobileLabel: Boolean(mobileRepresentative),
      mobileLabelRow: mobileRepresentative ? mobileLabelIndex % 2 : 0
    };

    if (mobileRepresentative) {
      mobileLabelIndex += 1;
    }

    return marker;
  });
}

function getTrackPriority(trackId) {
  const index = RULER_TRACK_PRIORITY.indexOf(trackId);
  return index === -1 ? RULER_TRACK_PRIORITY.length : index;
}
