# Vocabulary Loading Notes

## Current Tracks

The app currently exposes 11 available vocabulary tracks:

- `elementary`
- `junior-high`
- `senior-high`
- `senior-high-5-6`
- `gept-elementary`
- `gept-intermediate`
- `gept-high-intermediate`
- `toeic`
- `toeic-advanced`
- `toefl`
- `ielts`

Track metadata is stored in `public/data/catalog.json`.

## Persistent Vocabulary IDs

Every private source row in `VocabularyKing-data/data/*.jsonl` has a `uid` that is unique within its track. The app identity is the pair `(track, uid)`, so the same UID may appear in different tracks. The initializer fills missing values with the row's current exported ID and writes them back to JSONL:

```powershell
rtk npm run ensure:vocab-uids -- --data-dir "D:\Game\VocabularyKing-data"
```

Cross-track duplicate IDs are valid and stay unchanged. UIDs are never given a track suffix. Duplicate UIDs within one track fail validation.

Vocabulary exports keep the public record shape and set `id` to the source row's `uid`. Editing a word, meaning, or example does not change its `uid`. Review writeback is matched by `uid` and rejects attempts to change that field. Rows that are merged or removed must be recorded with `npm run manage:vocab-uid-aliases`; the writeback command does not delete or merge rows.

The iOS export includes `uid-aliases.json` beside the catalog and chunks. Alias and deletion entries are identified by `(track, uid)`; target resolution also stays within that track. **App 端用 辭庫＋uid 當主鍵**. Web runtime progress is stored under the selected track, and starred words, known words, and saved words use the loaded vocabulary record's `id`, which is the source `uid`. Web progress keeps only exact IDs present in the loaded track; it does not infer or regenerate IDs from word or meaning text. Alias-based progress migration is left for a later app change.

## Exam Rebuild Levels

The TOEIC, TOEIC Advanced, TOEFL, and IELTS rebuild tool reads each completed `part-NN.jsonl` by matching `word` within that same part. It takes reused IDs from the corresponding skeleton rows, cross-checks any output `uid`, and rejects mismatches before writing. New IDs use the existing stable vocabulary ID format and are checked for uniqueness within the track. The tool never edits the existing `writeback:vocab` command.

The catalog derives each of these tracks' `levels` and word counts from the ordered source JSONL, so the settings level menu follows the actual rebuild data. The default is all levels; selecting one filters practice cards, quizzes, and word-chain items. Changing tracks resets the level selection to all. Word badges include the source level, while progress identity remains `(track, uid)`.

## Senses and IPA

The JSONL source uses `senses` as the canonical meaning structure. Each row has one sense per POS code; each sense contains `pos`, `meaning_zh`, `meaning_ja`, and `meaning_ko`. POS values use the normalized codes `n.`, `v.`, `vt.`, `vi.`, `adj.`, `adv.`, `prep.`, `conj.`, `pron.`, `det.`, `art.`, `num.`, `int.`, `aux.`, `abbr.`, and `phr.`. Example links can set `example_sense` to a zero-based index; omit it when unknown.

The old `pos` and `meaning_*` fields remain generated compatibility fields. `legacy_display` stores the source strings used for the default web export, so migrating senses does not change `public/data`. Set `VOCAB_EXPORT_SENSES_DISPLAY=1` for a deliberate normalized-senses display build. IPA is stored in `ipa_us` and `ipa_uk`; `ipa_uk` is blank in this migration. The empty `kk` field is retained for compatibility.

The web export omits sense arrays and IPA fields by default. `npm run export:ios-locales -- --out <empty-folder>` includes each record's full `senses`, optional `example_sense`, and both IPA fields in the base chunks. Locale overlays remain available under the same track folders.

For a new or updated data copy, run the idempotent migration and IPA fill with explicit paths:

```powershell
rtk npm run migrate:vocab-senses -- --data-dir "D:\Game\VocabularyKing-data"
rtk npm run fill:vocab-ipa -- --data-dir "D:\Game\VocabularyKing-data" --cmudict "D:\Game\VocabularyKing-data\sources\cmudict\cmudict.dict"
```

The migration writes per-track parse rates and unresolved rows to `reports/vocab-senses-migration.json` and `reports/vocab-senses-unresolved.jsonl`. The IPA fill records coverage, unmatched words, and rows with multiple pronunciations under `reports/`.

Current elementary build source:

- `Source/elementary.english_final001.xlsx`
- workbook columns:
  - `NO.`
  - `英文`
  - `解釋`
  - `英文例句`
  - `中文翻譯 (台灣用語)`

Current TOEFL build source:

- `Source/toefl.final.checked.xlsx`
- workbook columns:
  - `Word`
  - `Chinese Meaning`
  - `English Example`
  - `Chinese Translation`

Current IELTS build source:

- `Source/ielts.final.xlsx`, generated from `docs/tasks/ielts-merge-20261022/examples/` by `scripts/build-ielts-source.mjs`
- If `examples-long/DONE` is present, completed long examples replace the short examples for starred words.
- Workbook columns match TOEFL:
  - `Word`
  - `Chinese Meaning`
  - `English Example`
  - `Chinese Translation`
- IELTS has no finer level split, so each exported entry uses `IELTS` as its level, following the TOEFL fallback-level pattern.

## Runtime Loading Strategy

Runtime loading happens in `src/hooks/useVocabularyData.js`.

The app does not load all 10 databases at startup.

Instead it:

1. Loads `public/data/catalog.json`
2. Resolves the currently selected `trackId`
3. Fetches only that track's chunk files
4. Flattens the chunk payloads into one vocabulary array

This keeps initial network and parse cost bounded to a single active track.

## Japanese and Korean Export

`npm run build:vocab` exports the public web dataset without Japanese or Korean overlay files, even when the source data repository contains translations. The public `catalog.json` therefore has no `locales` metadata.

To opt into locale overlays for a deliberate PowerShell build, set `VOCAB_EXPORT_EXTRA_LOCALES` to `ja`, `ko`, or `ja,ko` before running `rtk npm run build:vocab`. For example:

```powershell
$env:VOCAB_EXPORT_EXTRA_LOCALES = "ja,ko"
rtk npm run build:vocab
```

Only those requested locales are included in the generated catalog and track folders.

For a local iOS data bundle, export both locales to an empty folder outside the VocabularyKing repo and the vocabulary data repo:

```powershell
rtk npm run export:ios-locales -- --out "D:\Game\VocabularyKing-ios-export"
```

The output contains `catalog.json`, the base track chunks, and available locale overlays under `tracks/<track-id>/ja/` and `tracks/<track-id>/ko/`. The command requires an explicit `--out` folder and rejects targets inside either repo or non-empty folders.

`rtk npm run verify:vocab` fails if `public/data` contains any `ja` or `ko` path or any `locales` catalog property.

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

- `elementary`: 250 KB
- `toeic`: 843 KB
- `toeic-advanced`: 1065 KB
- `junior-high`: 416 KB
- `senior-high`: 458 KB
- `senior-high-5-6`: 438 KB
- `gept-elementary`: 466 KB
- `gept-intermediate`: 551 KB
- `gept-high-intermediate`: 689 KB
- `toefl`: 1361 KB
- `ielts`: 1581 KB

Even though all track files exist in the repo, only one track is loaded into app memory at a time unless the user switches tracks.

## Practical Performance Conclusion

At the current dataset size, 11 available tracks do not create a major startup performance problem because:

- the app fetches one active track at a time
- chunk files are split per track
- active-track data is cached in memory during the session

The bigger performance risk would come from:

- much larger single-track datasets
- adding media-heavy assets into the runtime path
- forcing eager preloading of every track at startup
