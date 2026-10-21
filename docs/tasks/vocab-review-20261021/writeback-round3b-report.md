# 寫回第 3b 輪報告

日期：2026-10-22

## 寫回摘要

使用 `scripts/apply-vocabulary-decisions-round3b.mjs`，依第 3 輪備份與逐格保護流程，更新 7 筆 judge 決策並寫回三份來源辭庫；另依使用者補充指示，刪除 TOEFL 的重複拼錯詞條。

| 軌道 | 更新決策 | 寫入資料格 | 詞頭變更 | 未寫回 |
|---|---:|---:|---:|---:|
| toeic | 3 | 6 | 0 | 0 |
| toefl | 2 | 3 | 0 | 0 |
| toeic-advanced | 2 | 2 | 2 | 0 |
| **合計** | **7** | **11** | **2** | **0** |

另刪除 TOEFL 工作表「工作表1」第 2413 列，移除 4 個有值的儲存格。這次列刪除不計入上述 11 格寫入數。

## 決策與來源修正

| 軌道／列 | 詞頭 | 修正 |
|---|---|---|
| toeic `Sheet1!2008` | moral | 新例句改用 moral，並對應道德義。 |
| toeic `Sheet1!380` | being | 新例句使用 human being；meaning 增補「人；生物」以符合例句。 |
| toeic `Sheet1!1485` | headquarters | 新例句改用複數詞頭 headquarters。詞頭已在第 3 輪修正，本輪寫入例句。 |
| toefl `工作表1!286` | neurilemmal | 中文翻譯將「網絡」改為臺灣用語「網路」。 |
| toefl `工作表1!440` | monolithic | 新例句直接使用 monolithic，呈現大型而僵化的系統義。 |
| toeic-advanced `KK!953` | dressed in suit → dressed in a suit | 修正詞頭；既有例句已使用完整詞組。 |
| toeic-advanced `KK!1541` | in the distance past → in the distant past | 修正詞頭；例句及中文翻譯與新詞頭相符。 |

更新的決策檔：

- `judge/toeic/part-02.decisions.jsonl`
- `judge/toeic/part-05.decisions.jsonl`
- `judge/toeic/part-07.decisions.jsonl`
- `judge/toefl/part-01.decisions.jsonl`
- `judge/toefl/part-02.decisions.jsonl`
- `judge/toeic-advanced/part-04.decisions.jsonl`
- `judge/toeic-advanced/part-06.decisions.jsonl`

## 備份與 SHA-256

寫入前，來源檔與 `backup-round3b/` 備份逐檔 SHA-256 相同。

| 來源檔 | 備份檔 | 寫入前／備份 SHA-256 | 寫回後 SHA-256 |
|---|---|---|---|
| `toeic3000_final.xlsx` | `backup-round3b/toeic3000_final.xlsx` | `95cd96c4fcfeac332e5e40de982b4de1426100230544150fdb657725d2aa65fd` | `add2e3e305dbd575c16547bf40d43c6fddd1dd7e5a7782e7d600faf8d5936798` |
| `Source/toefl.final.checked.xlsx` | `backup-round3b/toefl.final.checked.xlsx` | `c72ae28fa5ac4364632c74e1df3d6f4debc45fad96ee06a3681adcb888d9d20b` | `93011c9cdedf84bc339d7ec1a40d9ab43e65e5865d0e00160f4ccb66d0855aba` |
| `Toeic.Advanced.xlsx` | `backup-round3b/Toeic.Advanced.xlsx` | `2d783577a8bb038c8c0f5e8f85566bcbf30657ce34977905e63a2bee24b3db21` | `edbef907dc07bbfdc48202ac88fdfb38a832f865935136dd979fecf5a88d7cec` |

## 逐格與列刪除比對

- **toeic**：預期並確認 6 格變更；其餘工作表儲存格、工作表順序、欄寬、列高及合併儲存格均符合備份。
- **toefl 刪列檢查**：刪除前確認 `A2412 = misinterpret`、`A2413 = misinterprete`。以備份先製作只刪列的比對檔，再逐格比較：第 1～2412 列維持原值，原第 2414 列起逐列對應至新第 2413 列起。保留的 15,200 格完全相同；第 2413 列的 4 格移除；沒有其他格變動。工作表範圍由 `A1:D3801` 變為 `A1:D3800`，欄寬、列高映射及合併儲存格檢查通過。
- **toefl 寫回**：在上述列位移結果上，另確認 3 格預期變更：`D286`、`C440`、`D440`。其餘儲存格仍與備份列映射結果相同。
- **toeic-advanced**：預期並確認 2 格詞頭變更；其餘工作表儲存格、工作表順序、欄寬、列高及合併儲存格均符合備份。
- 三份來源的目標列均逐格讀回，與更新後決策的 `final` 相符。

刪列後 TOEFL 來源與匯出資料各有 **3,799 筆**；`misinterpret` 留存 1 筆，`misinterprete` 為 0 筆。

## 檢查器前後對照

| `check:content` 項目 | 寫回前 | 寫回後 |
|---|---:|---:|
| 檢查來源列 | 26,269 | 26,268 |
| 簡體字（程式判定） | 0 | 0 |
| 簡繁一字多義（需人工確認） | 112 | 112 |
| 疑似轉換錯誤／大陸用語：確定錯誤 | 3 | 2 |
| 疑似轉換錯誤／大陸用語：需人工確認 | 122 | 122 |
| 例句未出現單字或變化形 | 357 | 351 |
| 格式 | 171 | 171 |
| 匯出後同單字同詞性重複 | 14 | 14 |
| 不同單字重複使用例句 | 170 | 170 |
| 中文翻譯太短或疑似沒翻 | 0 | 0 |

本輪修正的 6 筆例句缺詞頭問題均已消失；`neurilemmal` 的「網絡」確定用語問題也已消失。其他剩餘檢查結果屬於辭庫中未納入本輪的項目。

## 匯出與驗證

- `npm run build:vocab`：通過；toefl 匯出 3,799 筆、4 個 chunk。
- `npm run verify:vocab`：通過；所有詞彙軌道數量與資料驗證一致。
- `npm run test`：通過，22 個測試檔、120 個測試。
- `npm run check:content`：通過，檢查 26,268 筆來源資料；7 筆目標均無本輪指定問題。
