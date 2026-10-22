# IELTS 匯入報告

日期：2026-10-22

## 匯入與來源

- 新增可重跑工具 `scripts/build-ielts-source.mjs`，從 `examples/part-01.jsonl`～`part-19.jsonl` 讀取 5,597 筆資料，產生 `Source/ielts.final.xlsx`。
- 活頁簿工作表為 `IELTS`，欄位採 TOEFL 四欄格式：`Word`、`Chinese Meaning`、`English Example`、`Chinese Translation`。`Source/` 位於 `.gitignore`，由工具重建，不納入版本控制。
- 本次沒有使用長句：目前沒有 `examples-long/DONE`，故 0 筆使用長句，全部採用 `examples/`。工具在日後發現完成標記時，會先核對 starred 字詞、sense 及長句完整度，再只用長句取代重點字例句。
- IELTS 沒有細分程度，依 TOEFL 的 fallback-level 做法，匯出每筆 `level: "IELTS"`。
- 匯出器新增 IELTS 來源定義，移除舊停用 placeholder；`catalog.json` 現為 `available: true`、`totalWords: 5597`，分成 6 個 chunk。
- App 的詞庫選單與中英文說明已加入 IELTS；詞庫切換後可載入資料並開始閃卡與測驗。

## 檢查器結果

`npm run check:content` 掃描 31,865 筆、11 個軌道。IELTS 共 **98 筆 findings，涉及 90 個詞條**：

| 檢查項目 | IELTS findings |
|---|---:|
| 簡體字（程式判定） | 3 |
| 簡繁一字多義（需人工確認） | 27 |
| 疑似轉換錯誤／大陸用語：確定錯誤 | 5 |
| 疑似轉換錯誤／大陸用語：需人工確認 | 20 |
| 例句未出現單字或變化形 | 41 |
| 格式 | 0 |
| 匯出後同單字同詞性重複 | 0 |
| 不同單字重複使用例句 | 2 |
| 中文翻譯太短或疑似沒翻 | 0 |
| **合計** | **98** |

檢查器的詞形比對已修正並加回歸測試：

- `easy-going` 可匹配連字號或空格形式，不會把逗號分開的 `easy, going` 當成該詞。
- `shrink` 現可匹配不規則變化 `shrunk`。
- 兩個指定詞條在 IELTS 檢查結果中均沒有 findings。其餘檢查提示依上表保留，供後續內容複核。

## 匯出與抽樣驗證

以隨機抽取的 30 筆對照 `examples/` 與重新匯出的 chunks，逐筆確認 `word`、`meaning`、`level` 及 `example_en (example_zh)` 完全相符，30/30 通過。抽樣詞頭：

`short-term`、`speculation`、`kindergarten`、`coast`、`cliff`、`bond`、`conjunction`、`itch`、`monster`、`republic`、`champion`、`foundation`、`nuisance`、`entwine`、`phrase`、`rigid`、`versus`、`platform`、`elect`、`justice`、`puff`、`dissemination`、`spray`、`vile`、`route`、`natural`、`scrutinise/scrutinize`、`hedge`、`constrain`、`underling`。

驗證結果：

- `npm run build:vocab`：通過；IELTS 5,597 筆、6 個 chunk。
- `npm run verify:vocab`：通過；11 個軌道全部驗證。
- `npm run test`：通過；23 個測試檔、126 個測試。
- `npm run check:content`：通過；IELTS findings 如上表。
- `npm run build:site`：通過。
- `rtk node scripts/smoke-ui.cjs`：通過；選取 IELTS 後載入 5,597 筆，成功開始閃卡練習與測驗。截圖在 `outputs/ui-smoke/`（`home-desktop.png`、`flashcard-game.png`、`quiz-game.png`、`home-mobile.png`）。

## 本次變更

- `scripts/build-ielts-source.mjs`、`scripts/build-ielts-source.test.mjs`
- `scripts/vocabulary-source-definitions.mjs`、`scripts/export-game-vocabulary.mjs`
- `scripts/check-vocabulary-content.mjs`、`scripts/check-vocabulary-content.test.mjs`
- `src/constants/vocabularyTracks.js`、`src/constants/vocabularyTracks.test.js`
- `src/i18n/locales/en.js`、`src/i18n/locales/zh-TW.js`
- `scripts/smoke-ui.cjs`、`VOCABULARY_LOADING.md`
- `public/data/catalog.json`、`public/data/tracks/ielts/chunk-001.json`～`chunk-006.json`

## 完成度／證據／未確認

- **完成度：** IELTS 已加入 app；來源工具、檢查器修正、chunk 與 UI 練習流程均完成並通過驗證。
- **證據：** 5,597 筆 catalog/chunk 計數、30 筆抽回比對、126 項測試、建置與 UI 冒煙結果如上。
- **未確認：** 長句資料尚未完成，目前沒有 `examples-long/DONE`；後續長句交付後需重跑 `rtk node scripts/build-ielts-source.mjs` 與詞庫匯出驗證。另有 98 筆內容檢查 findings 留待複核。
