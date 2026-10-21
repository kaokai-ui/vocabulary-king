# 寫回第 2 輪報告

日期：2026-10-22
範圍：`toefl`（496 筆判讀）與 `toeic-advanced`（45 筆判讀）
來源：`judge/<track>/*.decisions.jsonl`

## 寫回摘要

兩個工作簿都依來源欄位分開寫入 `word`、`meaning`、英文例句及中文翻譯欄。TOEFL 使用 `Word`、`Chinese Meaning`、`English Example`、`Chinese Translation` 標題欄；TOEIC Advanced 使用 `KK` 工作表第 1–4 欄。TOEFL 寫回 495/496 筆，TOEIC Advanced 寫回 45/45 筆，合計 540 筆；TOEFL 有 1 筆因重複詞條風險整筆略過。

| 辭庫 | 判讀數 | accept / revise | 寫回筆數 | 寫入欄位數（word / meaning / example_en / example_zh） | 變更儲存格 | 匯出 ID 改變 |
|---|---:|---:|---:|---|---:|---:|
| toefl | 496 | 419 / 77 | 495 | 2 / 70 / 390 / 481 | 943 | 71 |
| toeic-advanced | 45 | 17 / 28 | 45 | 7 / 5 / 23 / 33 | 68 | 11 |
| **合計** | **541** | **436 / 105** | **540** | **9 / 75 / 413 / 514** | **1,011** | **82** |

> 「欄位數」統計實際變更的儲存格；單一工作簿欄位依來源定義映射到上述欄位。原始判讀中的 ID 未回寫或重整。

## 改動的 word

| 辭庫 | 工作表列 | 原 word | 新 word | 結果 |
|---|---:|---|---|---|
| toefl | 工作表1!943 | chronical | chronic | 寫回；未與其他詞條重複 |
| toefl | 工作表1!2974 | sargeant | sergeant | 寫回；未與其他詞條重複 |
| toeic-advanced | KK!446 | call on urgent meeting | call an urgent meeting | 寫回；未與其他詞條重複 |
| toeic-advanced | KK!924 | don't have nerve to do | don't have the nerve to do | 寫回；未與其他詞條重複 |
| toeic-advanced | KK!1208 | for change | for a change | 寫回；未與其他詞條重複 |
| toeic-advanced | KK!1248 | from now | from now on | 寫回；未與其他詞條重複 |
| toeic-advanced | KK!1858 | make on outside call | make an outside call | 寫回；未與其他詞條重複 |
| toeic-advanced | KK!2143 | over the lnternet | over the Internet | 寫回；未與其他詞條重複 |
| toeic-advanced | KK!2323 | post an notice on | post a notice on | 寫回；未與其他詞條重複 |

## 未寫回

| 辭庫 | 判讀 ID | 來源列 | 原 word → 判讀 word | 原因 |
|---|---|---:|---|---|
| toefl | TOEFL-misinterprete-misinterpret | 工作表1!2413 | misinterprete → misinterpret | 同一辭庫已有 `misinterpret`（工作表1!2412）。依規則不合併重複詞條；整筆決定未寫回。 |

## 備份與逐格比對

寫入前的工作簿備份與來源檔 SHA-256 相同：

| 工作簿 | 備份 | SHA-256（來源與備份相同） |
|---|---|---|
| `Source/toefl.final.checked.xlsx` | `backup-round2/toefl.final.checked.xlsx` | `e50d64627c0520b0ccebc69cd96fb1693fac00cd93f86aec9d47fdcaedac637b` |
| `Toeic.Advanced.xlsx` | `backup-round2/Toeic.Advanced.xlsx` | `ce23f8271a2667572284103e4b458330777b1cb41fe21ae6b89422a6d9013ce0` |

寫回後逐格比對通過：除上表預期的 943 格及 68 格外，所有工作表及儲存格值相同；欄寬、列高、合併儲存格也相同。重新讀取來源工作簿，495 筆 TOEFL 與 45 筆 TOEIC Advanced 已寫回記錄都符合判讀結果。

## 匯出及抽回驗證

- `npm run build:vocab`：通過；重新匯出 `toefl` 3,800 筆、`toeic-advanced` 3,475 筆，各 4 個 chunk。
- `npm run verify:vocab`：通過。
- `npm run test`：通過，21 個測試檔、116 個測試全數通過。
- `npm run check:content`：通過，檢查 26,269 筆來源資料。
- 抽回驗證從重建後 chunks 按 `word`、`meaning`、組合後的 `example` 比對所有判讀；未寫回的 TOEFL 判讀則比對原值。540 筆寫回記錄及該筆保留原值的判讀均符合預期。另以固定種子做每庫 20 筆抽樣，強制納入所有實際變更 `word` 的記錄；抽樣項目的三個欄位全部相符。

抽樣種子與記錄 ID：

- `toefl`，種子 `20261022`：`TOEFL-chronical-m1316sgw`、`TOEFL-sargeant-sergeant`、`TOEFL-overproduction-mxrhmke`、`TOEFL-arousal-m1b1ebyw`、`TOEFL-bustle-m1mz6ssz`、`TOEFL-endotherms-mvcdrog`、`TOEFL-academician-mwcr3n`、`TOEFL-bandanna-mzy75pq`、`TOEFL-magnetism-m15nsrwv`、`TOEFL-ere-before`、`TOEFL-ancestral-mk2z3by`、`TOEFL-maize-mkc22`、`TOEFL-watercolor-mp1734g`、`TOEFL-neatness-m1v1xft1`、`TOEFL-stratosphere-mr0t9hp`、`TOEFL-cenote-cenotes`、`TOEFL-insightful-mzbwfzn`、`TOEFL-peruvian-m1bxnyad`、`TOEFL-spinal-miniq5c`、`TOEFL-kinglet-mz0tb0h`。
- `toeic-advanced`，種子 `20261023`：`TOEIC-ADV-call-on-urgent-meeting-m1bfat6v`、`TOEIC-ADV-don-t-have-nerve-to-do-me8ohzq`、`TOEIC-ADV-for-change-mejukql`、`TOEIC-ADV-from-now-mcjl10v`、`TOEIC-ADV-make-on-outside-call-md3tw0i`、`TOEIC-ADV-over-the-lnternet-mirv7x8`、`TOEIC-ADV-post-an-notice-on-m1hm8y48`、`TOEIC-ADV-accept-and-award-m1hpyw14`、`TOEIC-ADV-be-full-of-mefkq`、`TOEIC-ADV-congestion-m1gkaqnt`、`TOEIC-ADV-casually-m3zv354`、`TOEIC-ADV-stand-in-line-mhrg8`、`TOEIC-ADV-familiarize-oneself-with-mjutm`、`TOEIC-ADV-as-if-mv7e8nt`、`TOEIC-ADV-personal-mc43th`、`TOEIC-ADV-alluring-m1nzvvxw`、`TOEIC-ADV-company-regulations-mamo2k7`、`TOEIC-ADV-compact-car-mdx3hq`、`TOEIC-ADV-go-wrong-with-mer1x`、`TOEIC-ADV-competitiveness-mik8sk`。

## 內容檢查前後比較與新發現調查

以寫回前保存的檢查器結果為基準，兩庫合計由 250 筆降至 247 筆。TOEFL 由 54 降至 51；TOEIC Advanced 維持 196。共有 11 筆新出現、14 筆原有問題消失，淨減少 3 筆。以下新項目都已逐筆調查：

| 辭庫／列 | 新檢查結果 | 調查 |
|---|---|---|
| TOEFL 工作表1!286 `neurilemmal` | 「網絡」地域用詞 | 可能需要改成台灣較常用的「網路」，列為人工覆核，不視為純字串誤判。 |
| TOEFL 工作表1!312 `Americanism` | 例句未含詞頭 | 例句的 `American individualism` 在語義上呼應美國特徵；檢查器未辨識字族變化，較可能是誤報。 |
| TOEFL 工作表1!401 `contamination` | 例句未含詞頭 | 例句使用同源動詞 `contaminate` 描述污染過程；屬派生形式未被檢查器辨識。 |
| TOEFL 工作表1!435 `magnetism` | 例句未含詞頭 | 例句使用 `magnetic field`，語義吻合但詞性派生不同；較可能是檢查器誤報。 |
| TOEFL 工作表1!440 `monolithic` | 例句未含詞頭 | 新例句只描述由大型石塊建成的立面，沒有使用或清楚示範 `monolithic`；屬需後續修正的實質例句問題。 |
| TOEFL 工作表1!449 `quasar` | 「質量」需覆核 | 這裡是天文物理的 `massive black hole`，中文「超大質量黑洞」正確；檢查器已說明物理語境中的「質量」正確，屬誤報。 |
| TOEFL 工作表1!901 `acquiesce` | 「默認」地域用詞 | 本筆同時列有「默許」及「勉強同意」，「默認」採默許義而非軟體預設義；屬語境不足的誤報。 |
| TOEIC Advanced KK!953 `dressed in suit` | 例句未含詞頭 | 例句已正確使用 `dressed in a suit`，但詞頭仍缺冠詞；判讀只指定修改例句，詞頭問題仍待後續覆核。 |
| TOEIC Advanced KK!1007 `empty a trash can` | 例句未含詞頭 | 例句用 `emptying the trash cans`，是合乎語法且語義相符的動名詞與複數變化；屬檢查器形態判斷誤報。 |
| TOEIC Advanced KK!1541 `in the distance past` | 例句未含詞頭 | 新例句已改用正確的 `in the distant past`，但詞頭本身仍是錯誤搭配；判讀未指定改 `word`，列為待後續修正。 |
| TOEIC Advanced KK!2342 `preciously` | 中文含「只」需覆核 | 「那只古董花瓶」中的「只」是台灣繁體常用量詞，屬誤報。 |

新項目中 7 筆是檢查器未辨識字族、語境或繁體用法；4 筆（`neurilemmal` 的地域用詞，以及 `monolithic`、`dressed in suit`、`in the distance past` 的詞例問題）保留供後續人工修訂。本輪依判讀檔的 `final` 欄位寫回，未自行改動判讀未指定的欄位。
