# 義項、統一詞性與 IPA 完成報告

## 資料格式與匯出

- 31,332 列來源資料已加上 `senses: [{ pos, meaning_zh, meaning_ja, meaning_ko }]`、`ipa_us`、`ipa_uk`。每個非空 POS 只有一個 sense；多段同 POS 翻譯合併在該 sense。未能可靠判定 POS 的資料使用單一 `pos: ""` sense。
- POS 使用 `n.`、`v.`、`vt.`、`vi.`、`adj.`、`adv.`、`prep.`、`conj.`、`pron.`、`det.`、`art.`、`num.`、`int.`、`aux.`、`abbr.`、`phr.`。`example_sense` 是可省略的 0 起算索引。
- 舊 `pos` 和 `meaning_*` 欄位改由 senses 產生；`legacy_display` 保存遷移前字串，讓預設網頁匯出保持相容。`VOCAB_EXPORT_SENSES_DISPLAY=1` 才輸出整理後的 senses 顯示。網頁預設記錄仍不含 senses/IPA。
- iOS `export:ios-locales` 的基礎詞條包含完整 senses、可選 `example_sense`、`ipa_us` 與 `ipa_uk`。`kk` 保留為空欄位，供舊讀取器相容；新美式、英式音標欄位為 `ipa_us`、`ipa_uk`。
- 進度識別仍是 `(track, uid)`；**App 端用 辭庫＋uid 當主鍵**。

## 義項遷移

指令可重跑；若資料已有合法 senses，會保留它們，同時用 `legacy_display` 重算報告，因此 rerun 結果穩定。

| 辭庫 | 列數 | 自動解析 | 比例 | 未解析 |
|---|---:|---:|---:|---:|
| elementary | 1,200 | 0 | 0% | 1,200 |
| junior-high | 2,066 | 3 | 0.15% | 2,063 |
| senior-high | 2,139 | 11 | 0.51% | 2,128 |
| senior-high-5-6 | 2,146 | 38 | 1.77% | 2,108 |
| gept-elementary | 2,218 | 2,217 | 99.95% | 1 |
| gept-intermediate | 2,568 | 2,567 | 99.96% | 1 |
| gept-high-intermediate | 3,093 | 3,093 | 100% | 0 |
| toeic | 3,034 | 3,034 | 100% | 0 |
| toeic-advanced | 3,475 | 7 | 0.20% | 3,468 |
| toefl | 3,799 | 0 | 0% | 3,799 |
| ielts | 5,594 | 5,594 | 100% | 0 |
| **總計** | **31,332** | **16,564** | **52.87%** | **14,768** |

未解析列的 `(track, uid, word, meaning)` 清單在資料 repo 的 `reports/vocab-senses-unresolved.jsonl`；各辭庫統計在 `reports/vocab-senses-migration.json`。剩餘無詞性列包含原始資料沒有可靠 POS 的 elementary、junior/senior-high、TOEFL 與 TOEIC 進階內容，沒有臆測補詞性。

## IPA 覆蓋與 CMUdict 授權

取每個單字在字典中的第一個發音；有多個發音的列也記錄 variant 數和採用的 variant。多字片語不查字典。英式音標留空。

| 辭庫 | 匹配 / 列數 | 覆蓋率 | 空白列 | 多發音列 |
|---|---:|---:|---:|---:|
| elementary | 1,176 / 1,200 | 98.00% | 24 | 187 |
| junior-high | 1,949 / 2,066 | 94.34% | 117 | 293 |
| senior-high | 2,041 / 2,139 | 95.42% | 98 | 318 |
| senior-high-5-6 | 2,079 / 2,146 | 96.88% | 67 | 277 |
| gept-elementary | 2,174 / 2,218 | 98.02% | 44 | 356 |
| gept-intermediate | 2,557 / 2,568 | 99.57% | 11 | 383 |
| gept-high-intermediate | 3,046 / 3,093 | 98.48% | 47 | 400 |
| toeic | 2,993 / 3,034 | 98.65% | 41 | 530 |
| toeic-advanced | 1,895 / 3,475 | 54.53% | 1,580 | 271 |
| toefl | 3,272 / 3,799 | 86.13% | 527 | 295 |
| ielts | 5,355 / 5,594 | 95.73% | 239 | 755 |
| **總計** | **28,537 / 31,332** | **91.08%** | **2,795** | **4,065** |

2,795 筆空白列（含 1,655 個多字片語）列於 `reports/vocab-ipa-unmatched.jsonl`；4,065 筆有多發音列於 `reports/vocab-ipa-multiple-pronunciations.jsonl`。統計及 CMUdict SHA-256 在 `reports/vocab-ipa-fill.json`。

來源為 Carnegie Mellon Speech Group 維護的 [CMUdict upstream](https://github.com/cmusphinx/cmudict/tree/74790861f652b15e4ac49015a90074ad62a27690)，固定至 master commit `74790861f652b15e4ac49015a90074ad62a27690`；上游 README 未標示語意版本號。字典檔 SHA-256：`81917843c7f44ce2b094ac63873c2c7a4cf802040792c455ba3ca406891c3d22`。原始 `LICENSE` 與 `README` 一併存放於 `sources/cmudict/`。上游 README 要求在描述中註明來源。

`sources/cmudict/LICENSE` 原文：

```text
Copyright (C) 1993-2015 Carnegie Mellon University. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions
are met:

1. Redistributions of source code must retain the above copyright
   notice, this list of conditions and the following disclaimer.
   The contents of this file are deemed to be source code.

2. Redistributions in binary form must reproduce the above copyright
   notice, this list of conditions and the following disclaimer in
   the documentation and/or other materials provided with the
   distribution.

This work was supported in part by funding from the Defense Advanced
Research Projects Agency, the Office of Naval Research and the National
Science Foundation of the United States of America, and by member
companies of the Carnegie Mellon Sphinx Speech Consortium. We acknowledge
the contributions of many volunteers to the expansion and improvement of
this dictionary.

THIS SOFTWARE IS PROVIDED BY CARNEGIE MELLON UNIVERSITY ``AS IS'' AND
ANY EXPRESSED OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO,
THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL CARNEGIE MELLON UNIVERSITY
NOR ITS EMPLOYEES BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## 驗收結果

- `npm run check:site`：通過，35 個測試檔、186 項測試；`verify:vocab` 驗證 11 個辭庫共 31,332 列；Vite production build 成功。
- `npm run check:content`：通過，檢查 31,332 列；報告記錄既有內容待審項目於 `docs/tasks/vocab-review-20261021/`。
- UI 冒煙：4174 埠首頁載入成功，從首頁進入 Quiz Setup 並啟動 Quiz；Playwright console 沒有應用錯誤。
- iOS 匯出實際執行成功，ja/ko overlay 各 31,332 筆；抽查基礎詞條包含 senses、`ipa_us` 與空白 `ipa_uk`。
- 已用資料複本實際執行預設 `build:vocab`。匯出後 `git diff --stat -- public/data` 為空，並直接與 `D:\Game\VocabularyKing\public\data` 比對，40 個檔案逐位元組相同；沒有還原 public 輸出。

## 主線合併與最新資料重跑

本次工作只在 `D:\Game\VocabularyKing-senses`（`codex/vocab-senses-20261023`）及 `D:\Game\VocabularyKing-data-senses`（`codex/senses`）完成，兩邊均未加入 remote、未 push、未 merge。將資料 repo 變更整合到最新主資料 repo 後，因另一個工作正在改例句，請在最新資料上重跑：

```powershell
$env:VOCABULARY_DATA_REPO = "D:\Game\VocabularyKing-data"
rtk npm run migrate:vocab-senses -- --data-dir "D:\Game\VocabularyKing-data"
rtk npm run fill:vocab-ipa -- --data-dir "D:\Game\VocabularyKing-data" --cmudict "D:\Game\VocabularyKing-data\sources\cmudict\cmudict.dict"
rtk npm run check:content
rtk npm run verify:vocab
rtk npm run build:vocab
```

遷移會保留已存在的 senses，對新加但沒有 senses 的列依可解析欄位建立義項；例句欄位不參與解析，所以合併例句更新後可安全重跑。最後在兩個 repo 各自整合本分支的逐檔 commit。
