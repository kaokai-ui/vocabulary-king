# 寫回第 5 輪報告

日期：2026-10-22
辭庫：`gept-intermediate`（全民英檢中級）
來源工作簿：`GEPT_with_levels.KK.xlsx`，工作表 `High`，只寫入 `Grade=中級` 的來源列

## 寫回摘要

使用 `scripts/apply-vocabulary-decisions.mjs` 寫回 9 個 decisions 檔。147 筆均成功對回來源，accept 83、revise 64、reject 0；未寫回 0 筆，詞頭重複阻擋 0 筆，改詞頭 0 筆。

| 欄位 | decisions 指定 | 實際有變更 |
|---|---:|---:|
| word | 0 | 0 |
| meaning | 16 | 16 |
| example_en | 106 | 106 |
| example_zh | 132 | 131 |
| **決策筆數** | **147** | **147** |

一筆 `example_zh` final 與原值相同；該筆的其他指定值有變更，因此仍屬已寫回決策。

實際改變儲存格共 **170 格**：

| 工作表欄位 | 格數 | 用途 |
|---|---:|---|
| B（詞類） | 15 | 15 筆單列詞義更新將完整 final 存入 C，清空分開存放的詞類 |
| C（中文） | 16 | 15 筆單列更新及合併詞條 `bargain` 的兩個詞性列 |
| I（例句） | 139 | 合併英文與中文 final，存回 GEPT 例句欄 |
| **合計** | **170** | |

詞義更新來源位置：`silk` High!5905、`coward` High!6115、`inform` High!6340、`knit` High!6373、`reveal` High!6618、`spill` High!6709、`tobacco` High!6804、`aggressive` High!6918、`bargain` High!6979–6980、`biography` High!6986、`declare` High!7147、`guilty` High!7365、`imply` High!7414、`refresh` High!7689、`summarize` High!7785、`middle-aged` High!8282。`bargain` 的兩行依原詞類拆回兩個 C 儲存格，重新匯出的合併 meaning 與 final 完全一致。

## 備份與逐格比對

寫入前原檔與 `backup-round5/GEPT_with_levels.KK.xlsx` 的 SHA-256 相同：

| 檔案 | SHA-256 |
|---|---|
| 寫入前 `GEPT_with_levels.KK.xlsx` | `f676d9d258cf0959ade3435105d9f110ccaee673c79f03ecf9611e22561d90f6` |
| `backup-round5/GEPT_with_levels.KK.xlsx` | `f676d9d258cf0959ade3435105d9f110ccaee673c79f03ecf9611e22561d90f6` |
| 寫回後 `GEPT_with_levels.KK.xlsx` | `5d4674807adaee7c159dee3517628d7a0fa949948e9f027f270c43e63614c4a6` |

逐格比對通過：170 格符合預期變更（B 15、C 16、I 139），154 個來源列有實際儲存格變更；所有變更列均屬本輪決策對應的中級列。其他儲存格值及樣式相同，工作表名稱與順序、欄寬、列高、合併儲存格也相同。寫入前後未有初級或中高級列變更。

## GEPT 例句優先規則與 HEAD 比較

寫回前檢查到中級來源共 2,686 列，其中 2,474 列的 GEPT 例句欄為空，匯出器目前會用 L1–L6 工作簿補入例句。這些空白列沒有 GEPT 例句可優先採用；已有 GEPT 例句的列也沒有被不同的 L1–L6 例句覆蓋。本輪決策會將 final 例句寫入 GEPT 欄，因此在匯出器與內容檢查器中，只對 `gept-intermediate` 增加「GEPT 例句非空時優先採用」規則；中高級原規則保留，其他軌道不變。

重建後與 HEAD 的 33 個 chunk 檔逐筆比較 `level`、`word`、`meaning`、`example`，依指示不比較或處理 `id`。25,758 筆匯出資料中只有中級這 147 筆改變；決策外變更 0 筆，其他 9 個辭庫均未變，也沒有新增或缺少 chunk 檔。

## 匯出、抽回與驗證

- `npm run build:vocab`：通過；中級匯出 2,568 筆、3 個 chunk。
- `npm run verify:vocab`：通過；10 個辭庫均核對通過。
- `npm run test`：通過，22 個測試檔、123 個測試全數通過。
- `npm run check:content`：通過，檢查 26,268 筆來源列。
- decisions 全數抽回：來源工作簿與重新匯出的 chunk 各 147/147 筆通過。逐筆核對 word、meaning、example_en、example_zh；final 未指定的欄位與原 part 值相同。

## `check:content` 前後比較

寫入前 findings 保存在 `backup-round5/check-findings-gept-intermediate-before.jsonl`。中級問題由 122 筆降至 22 筆，淨減少 100 筆；檢查項目變化如下：

| 檢查項目 | 寫回前 | 寫回後 | 變化 |
|---|---:|---:|---:|
| 簡體字（程式判定） | 0 | 0 | 0 |
| 簡繁一字多義（需人工確認） | 13 | 12 | -1 |
| 疑似轉換錯誤／大陸用語：確定錯誤 | 0 | 0 | 0 |
| 疑似轉換錯誤／大陸用語：需人工確認 | 7 | 0 | -7 |
| 例句未出現單字或變化形 | 68 | 10 | -58 |
| 格式 | 0 | 0 | 0 |
| 匯出後同單字同詞性重複 | 0 | 0 | 0 |
| 不同單字重複使用例句 | 34 | 0 | -34 |
| 中文翻譯太短或疑似沒翻 | 0 | 0 | 0 |
| **合計** | **122** | **22** | **-100** |

前後 findings 比較有 101 筆消失、1 筆新增。新增的是 `L3-baggage-noun`（High!5983）final 翻譯「乘客登機前必須先辦理行李托運。」觸發「托」字簡繁異義人工複核。這是需人工確認提示，不是程式判定的確定錯誤；保留判讀 final，未自行改寫。
