# Vocabulary Loading Notes

## Current Tracks

The app currently exposes 6 available vocabulary tracks:

- `junior-high`
- `senior-high`
- `senior-high-5-6`
- `gept-elementary`
- `gept-intermediate`
- `gept-high-intermediate`

Track metadata is stored in `public/data/catalog.json`.

## Runtime Loading Strategy

Runtime loading happens in `src/hooks/useVocabularyData.js`.

The app does not load all 6 databases at startup.

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

## Size Snapshot

Approximate raw JSON size per currently available track:

- `junior-high`: 426 KB
- `senior-high`: 469 KB
- `senior-high-5-6`: 449 KB
- `gept-elementary`: 496 KB
- `gept-intermediate`: 575 KB
- `gept-high-intermediate`: 734 KB

Even though all track files exist in the repo, only one track is loaded into app memory at a time unless the user switches tracks.

## Practical Performance Conclusion

At the current dataset size, 6 available tracks do not create a major startup performance problem because:

- the app fetches one active track at a time
- chunk files are split per track
- active-track data is cached in memory during the session

The bigger performance risk would come from:

- much larger single-track datasets
- adding media-heavy assets into the runtime path
- forcing eager preloading of every track at startup
