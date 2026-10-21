# 寫回第 3 輪報告

日期：2026-10-22
範圍：`toeic`（469 筆判讀）
來源：`judge/toeic/part-01～11.decisions.jsonl`

## 寫回摘要

使用 `scripts/apply-vocabulary-decisions.mjs` 將結果寫回 `toeic3000_final.xlsx`。決策為 accept 309 筆、revise 160 筆。469 筆都有至少一格實際變更，沒有未寫回項目。

| 辭庫 | 判讀數 | accept / revise | 寫回筆數 | 實際變更欄位數（word / meaning / example_en / example_zh） | 變更儲存格 | 匯出 ID 改變 |
|---|---:|---:|---|---|---:|---:|
| toeic | 469 | 309 / 160 | 469 | 3 / 427 / 23 / 69 | 665 | 157 |

決策檔指定 `word` 3 筆、`meaning` 428 筆、`example_en` 23 筆、`example_zh` 70 筆。1 筆 meaning 與 1 筆中文例句已和來源相同，未重寫該格；其餘指定欄位均有實際變更。TOEIC 工作簿把詞性與釋義分欄；meaning 判讀含詞性時，工具將其拆回來源欄位。本輪另改詞性 149 格、釋義 421 格；meaning 欄位合計有 427 筆判讀產生變更。實際儲存格變更為 word 3、詞性 149、釋義 421、英文例句 23、中文例句 69，共 665 格。

匯出後 ID 有 157 筆因詞條內容改變；依本輪要求不做 ID 對照或修補。

## 改動的 word

| 工作表列 | 原 word | 新 word | 結果 |
|---:|---|---|---|
| Sheet1!1485 | headquarter | headquarters | 寫回；與同辭庫既有詞條不重複 |
| Sheet1!1951 | maternal | maternity | 寫回；與同辭庫既有詞條不重複 |
| Sheet1!2123 | outskirt | outskirts | 寫回；與同辭庫既有詞條不重複 |

## 未寫回

無。469 筆均唯一對應來源列，三筆改 word 都通過同辭庫重複檢查。

## 備份與逐格比對

寫入前備份與來源檔 SHA-256 相同：

| 工作簿 | 備份 | 寫入前來源與備份 SHA-256 |
|---|---|---|
| `toeic3000_final.xlsx` | `backup-round3/toeic3000_final.xlsx` | `2639024b404457e761050c15cc72755f7971b95e943c513ecda9fcd103cad18a` |

寫回後逐格比對通過：除了預期的 665 格外，所有工作表及其餘儲存格值相同；工作表名稱與順序、範圍、欄寬、列高、合併儲存格，以及目標格以外的公式和樣式均相同。來源列回讀 469 筆全數符合判讀。寫回後來源檔 SHA-256：`95cd96c4fcfeac332e5e40de982b4de1426100230544150fdb657725d2aa65fd`。

## 匯出及抽回驗證

- `npm run build:vocab`：通過；`toeic` 匯出 3,036 筆、4 個 chunk。
- `npm run verify:vocab`：通過；10 個辭庫資料均核對通過。
- `npm run test`：通過，21 個測試檔、118 個測試全數通過。
- `npm run check:content`：通過，檢查 26,269 筆來源資料。
- 抽回驗證逐筆核對 469 筆決策在重建 chunks 中的 `word`、`meaning`、`example`；另以固定種子 `20261024` 抽樣 20 筆，強制包含全部 3 筆改 word 的判讀。抽樣欄位均符合 final，未指定修改的欄位與原值一致。

抽樣記錄 ID：

`TOEIC-headquarter-n`、`TOEIC-maternal-a`、`TOEIC-outskirt-n`、`L4-emphasis-v`、`L4-guilt-n`、`L4-reference-n`、`TOEIC-deceleration-n`、`TOEIC-getaway-v`、`L2-doubt-v`、`L3-stable-n`、`TOEIC-info-n`、`TOEIC-implementation-n`、`L1-check-n`、`TOEIC-leverage-n`、`TOEIC-reimburse-v`、`TOEIC-refurbish-v`、`L2-contact-n-a`、`L6-betray-v`、`L2-handle-v`、`L5-purchase-v`。

## 內容檢查前後比較與新發現調查

以寫回前保存的檢查器結果比較 `toeic`。總問題數由 36 筆增至 38 筆，淨增 2 筆；新增 6 項、原有 4 項消失。

| 檢查項目 | 寫回前 | 寫回後 | 變化 |
|---|---:|---:|---:|
| 簡繁一字多義需人工確認 | 16 | 15 | -1 |
| 需人工確認的轉換用詞 | 2 | 4 | +2 |
| 例句未出現單字或變化形 | 6 | 8 | +2 |
| 格式 | 2 | 1 | -1 |
| 不同單字重複使用例句 | 10 | 10 | 0 |
| **合計** | **36** | **38** | **+2** |

新增項目逐筆調查如下：

| 工作表列／單字 | 新檢查結果 | 調查 |
|---|---|---|
| Sheet1!86 `addict` | 例句未出現詞頭 | 判讀改用 `addiction`（成癮）描述戒癮，語義吻合；是檢查器未涵蓋字族變化的誤報。 |
| Sheet1!380 `being` | 例句未出現詞頭 | 新例句使用 `survival`，沒有示範詞頭 `being`；屬實質例句問題，留待後續修正。 |
| Sheet1!1291 `figure` | 「數據」需人工確認 | 該義項包含銷售數字等統計語境；「數據」可用但需依語境判斷，列人工覆核。 |
| Sheet1!1485 `headquarters` | 例句未出現詞頭 | 詞頭已改為複數 `headquarters`，例句仍使用單數 `headquarter`；屬實質詞形不一致，留待後續修正。 |
| Sheet1!1787 `item` | 「項目」需人工確認 | 例句指裝運清單上的貨品項目，「項目」符合此處語義；檢查器未區分一般項目與專案用法，屬語境誤報。 |
| Sheet1!2008 `moral` | 例句未出現詞頭 | 新例句使用另一詞 `morale`（士氣），沒有示範詞頭 `moral`；屬實質例句問題，留待後續修正。 |

本輪只寫回判讀 final 指定的欄位，未自行擴寫例句或詞條修正。以下 4 項原有問題在寫回後消失：`customize` 的一字多義提示、`disembark` 與 `treat` 的例句詞形提示，以及 `woo` 的句尾格式提示。
