# Project Review And Hardening Notes

## What Was Fixed

- Per-track progress is now isolated.
  Before this change, switching from `junior-high` to `senior-high` mixed studied words, mastered words, starred words, known words, and quiz history across tracks.

- Google Analytics no longer double-counts the first page view.
  The inline GA config now disables the automatic initial `page_view`, and SPA screen tracking remains the single source of truth.

- Vocabulary item ids are now stable.
  Exported ids no longer depend on worksheet row numbers, so editing or reordering spreadsheet rows will not silently remap user progress.

- Legacy progress is migrated forward.
  Existing saved progress that still uses the old row-index ids is migrated to the new stable ids when the active track loads.

## Hardening Improvements

- Progress storage is namespaced by track under `progress.byTrack`.
- Track migration is automatic and persisted after load.
- GitHub Pages CI now runs:
  - unit tests
  - vocabulary data verification
  - production build

## New Validation Scripts

- `npm run verify:vocab`
  Validates `public/data/catalog.json` and all available chunk files.
  Checks:
  - each referenced chunk exists
  - `wordCount` matches actual chunk length
  - `totalWords` matches the combined chunk size
  - all ids are unique per track
  - every id matches the stable id format derived from `level + word + meaning`

- `npm run check:site`
  Runs the site-safe verification path used by GitHub Pages:
  - `npm run test`
  - `npm run verify:vocab`
  - `npm run build:site`

## Recommended Vocabulary Update Flow

1. Update the workbook locally.
2. Run `npm run refresh:vocab`.
3. Optionally run `npm run check:site`.
4. Commit the generated `public/data/` changes.
5. Push to `main` and let GitHub Pages deploy automatically.

## Residual Risks To Watch

- If the same `word` appears multiple times inside the same `level` and only differs by row placement, legacy id migration may be ambiguous.
- The current track model is ready for more datasets, but if future tracks need different metadata, the catalog schema may need another small expansion.
