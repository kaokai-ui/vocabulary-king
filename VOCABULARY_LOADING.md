# Vocabulary Loading Notes

## Current Tracks

The app currently exposes 9 available vocabulary tracks:

- `toeic`
- `toeic-advanced`
- `junior-high`
- `senior-high`
- `senior-high-5-6`
- `gept-elementary`
- `gept-intermediate`
- `gept-high-intermediate`
- `toefl`

Track metadata is stored in `public/data/catalog.json`.

Current TOEFL build source:

- `Source/toefl.final.checked.xlsx`
- workbook columns:
  - `Word`
  - `Chinese Meaning`
  - `English Example`
  - `Chinese Translation`

## Runtime Loading Strategy

Runtime loading happens in `src/hooks/useVocabularyData.js`.

The app does not load all 9 databases at startup.

Instead it:

1. Loads `public/data/catalog.json`
2. Resolves the currently selected `trackId`
3. Fetches only that track's chunk files
4. Flattens the chunk payloads into one vocabulary array

This keeps initial network and parse cost bounded to a single active track.

## Cache Behavior

The runtime keeps two in-memory caches:

- `cachedCatalog`
- `cachedVocabularyByTrack`

Effects:

- revisiting a previously opened track does not re-fetch its chunk files during the same page session
- switching tracks no longer briefly renders the previous track's vocabulary

## Loading-State Rules

The UI now distinguishes between three states:

- loading: active track data is still being fetched
- load failed: catalog or chunk fetch failed
- empty track: fetch succeeded but the selected track has zero words

This prevents empty data from being treated as an endless loading screen.

## Legacy Track Migration

Older localStorage values may still contain `vocabularyTrack: "gept"`.

The runtime now normalizes that legacy id to:

- `gept-elementary`

Unknown or disabled track ids fall back to:

- `junior-high`

This migration is handled in:

- `src/constants/vocabularyTracks.js`
- `src/lib/storage.js`
- `src/state/reducers/settingsReducer.js`

## Build-Time vs Runtime Migration

There are two different migration layers in the project:

### 1. Build-time vocabulary migration

This happens when the data files are regenerated during:

- `npm run build:vocab`
- `npm run build`

Example responsibilities:

- merging duplicate GEPT rows such as one word split across multiple parts of speech
- regenerating `public/data/catalog.json`
- regenerating `public/data/tracks/<track-id>/*.json`

This logic lives primarily in:

- `scripts/export-game-vocabulary.mjs`

Build-time migration changes the shipped vocabulary dataset, but it does not touch each player's saved local progress directly.

### 2. Runtime player-data migration

This happens in the browser when a player opens the app and the active vocabulary track is loaded.

Example responsibilities:

- remapping old saved word ids to current vocabulary ids
- preserving starred words after vocabulary merges
- preserving known words and accumulated word stats after id changes

This logic lives primarily in:

- `src/lib/progress.js`

Runtime migration is necessary because each player's saved data lives on their own device, so it cannot be rewritten during the build step.

## Size Snapshot

Approximate raw JSON size per currently available track:

- `toeic`: 843 KB
- `toeic-advanced`: 1065 KB
- `junior-high`: 416 KB
- `senior-high`: 458 KB
- `senior-high-5-6`: 438 KB
- `gept-elementary`: 466 KB
- `gept-intermediate`: 551 KB
- `gept-high-intermediate`: 689 KB
- `toefl`: 1361 KB

Even though all track files exist in the repo, only one track is loaded into app memory at a time unless the user switches tracks.

## Practical Performance Conclusion

At the current dataset size, 9 available tracks do not create a major startup performance problem because:

- the app fetches one active track at a time
- chunk files are split per track
- active-track data is cached in memory during the session

The bigger performance risk would come from:

- much larger single-track datasets
- adding media-heavy assets into the runtime path
- forcing eager preloading of every track at startup
