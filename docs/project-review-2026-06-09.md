# Vocabulary King 專案 Review 與載入測試報告

日期：2026-06-09

## 結論摘要

目前沒有發現會阻擋遊戲主流程的明確 bug。本地測試、詞庫資料驗證、production build 都通過，線上 GitHub Pages 版本也能正常載入所有已開放詞庫。

2026-06-11 已完成第一批載入優化：catalog-first 首頁、chunk 版本化快取、載入 retry，以及 `useVocabularyData` 拆分。首頁現在可在 catalog 載入後先顯示總字數，完整詞庫 chunk 仍在背景載入；需要完整詞庫的入口會暫時 disabled，chunk 完成後自動恢復。

仍需後續處理的是「建置副作用」：`npm run build` 仍會透過 `build:vocab` 更新 `public/data/catalog.json` 的 `generatedAt`，即使資料內容不變也會造成 dirty diff。

## 2026-06-11 實作更新

本次已完成：

- 新增 `src/lib/vocabularyDataClient.js`，集中處理 catalog 載入、track availability、chunk 載入與 module cache。
- `catalog.json` 改用 `cache: "no-cache"` 重新驗證，retry 時使用 `cache: "reload"`。
- chunk URL 加上 `?v=<catalog.generatedAt>`，一般載入使用 `cache: "force-cache"`，讓 GitHub Pages 的 gzip 與 10 分鐘 HTTP cache 能發揮作用，同時用版本參數避免部署後 stale chunk。
- `useVocabularyData` 改成 catalog-first 狀態模型，分開回傳 `isCatalogLoading`、`isVocabularyLoading`、`isVocabularyReady`、`catalogError`、`vocabularyError` 與 `retryVocabulary()`。
- `App` 不再等完整 chunk 才顯示首頁；只有 catalog 還沒載入、非首頁等待完整詞庫、或載入失敗時才顯示 placeholder。
- `HomeScreen` 在完整詞庫尚未載入時，先顯示 catalog 的總字數，並暫時 disabled 隨機閃卡、測驗、克漏字、已會單詞與進度入口。
- 載入失敗時新增「重新載入 / Retry loading」按鈕。
- 新增 `src/lib/vocabularyDataClient.test.js`，覆蓋版本化 URL、catalog revalidation、chunk cache，以及 retry reload 行為。

新增驗證：

```bash
npm run test
npm run verify:vocab
npm run build
```

結果：

- Vitest：12 個 test files、43 個 tests 全部通過。
- 詞庫驗證：8 個已開放詞庫全部通過。
- Production build：通過。
- Playwright 延遲 chunk 測試：首頁在 chunk 延遲 2.5 秒時仍先顯示 `2074` 總字數；需要完整詞庫的 5 個入口暫時 disabled；chunk 載入完成後 disabled 數量回到 0。

## 本地檢查結果

已執行：

```bash
npm run test
npm run verify:vocab
npm run build
```

結果：

- Vitest：12 個 test files、43 個 tests 全部通過。
- 詞庫驗證：8 個已開放詞庫全部通過，總字數與 chunk wordCount 一致。
- Production build：通過，輸出 JS 約 249.58 KB，gzip 約 76.41 KB。

補充：`npm run build` 會先執行 `build:vocab`，即使資料內容不變，也會更新 `public/data/catalog.json` 的 `generatedAt`。這會讓單純 build 產生 dirty working tree，是建置流程上的噪音。

## 線上載入測試

測試網址：

https://kaokai-ui.github.io/vocabulary-king/

測試方式：

- 使用 Playwright 開新的 Chromium context。
- 每個詞庫都在乾淨 storage 中設定 `vocabulary-king:settings`。
- 從 `page.goto()` 開始計時，到首頁 `.hero-stats` 顯示該詞庫總字數為止。
- 同步擷取 `performance.getEntriesByType("resource")` 的 catalog/chunk timing。
- 測試時間：2026-06-09 上午，Asia/Taipei。

| 詞庫 | 總字數 | 主畫面顯示時間 | data 請求數 | data 傳輸量 | 最慢 data 請求 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 國中 | 2,074 | 1.000s | 4 | 130.3 KB | 95ms |
| 高中 L3-4 | 2,141 | 1.575s | 4 | 147.1 KB | 391ms |
| 高中 L5-6 | 2,154 | 1.502s | 4 | 135.7 KB | 615ms |
| 全民英檢初級 | 2,218 | 1.623s | 4 | 132.6 KB | 341ms |
| 全民英檢中級 | 2,568 | 1.535s | 4 | 157.3 KB | 331ms |
| 全民英檢中高 | 3,093 | 1.625s | 5 | 195.8 KB | 367ms |
| TOEIC 核心 | 3,036 | 1.594s | 5 | 278.0 KB | 375ms |
| TOEIC 進階 | 3,475 | 1.581s | 5 | 351.2 KB | 362ms |

觀察：

- 所有詞庫都能成功顯示首頁。
- 詞庫越大，傳輸量越高；TOEIC 進階最大，約 351 KB。
- 原始測試時，GitHub Pages 對 JSON 回傳 `cache-control: max-age=600` 與 `content-encoding: gzip`，但前端 `fetchJson()` 使用 `cache: "no-store"`，因此每次重載都會繞過瀏覽器快取。2026-06-11 已改為 catalog revalidate、chunk versioned cache。
- 測試中看到的 Google Analytics `net::ERR_ABORTED` 是測試 context 關閉時中止分析請求，非詞庫載入失敗。

## Bug 與風險

### 1. 目前未發現主流程阻斷 bug

首頁、詞庫資料驗證、測驗相關 unit tests、production build 都通過。線上 8 個已開放詞庫也都能載入到主畫面。

### 2. Build 會更新 generatedAt，造成無內容變更的 dirty diff

位置：`scripts/export-game-vocabulary.mjs`、`public/data/catalog.json`

`prebuild` 會重新產生詞庫，`catalog.json` 的 `generatedAt` 每次都更新。這不是玩家端 bug，但會讓開發者在單純驗證 build 後看到不必要的 git diff。建議改成：

- 只有資料內容 hash 改變時才更新 `generatedAt`。
- 或將 `generatedAt` 移到 build artifact，不寫回 tracked source data。
- 或在 CI/deploy 流程產生，不在一般 local build 中修改 tracked 檔。

### 3. 未來小型詞庫可能出現測驗題數與實際題數不一致

位置：`src/hooks/useQuizSession.js`、`src/lib/quiz/questionBuilders.js`

`buildQuizQuestions()` 可能因題目不合法而回傳少於要求的題數，尤其是 cloze 題會過濾沒有可挖空例句的單字。目前 8 個詞庫都足夠產生 50 題，所以不是現有資料的使用者可見 bug。不過 `useQuizSession` 仍以使用者選的 `questionCount` 計算 accuracy/history，未來若新增小型詞庫，可能分母錯誤。建議啟動測驗時以 `questions.length` 作為實際 `questionCount`，並在 0 題時回到設定或顯示無可用題目。

### 4. 詞庫載入失敗時缺少 retry 與錯誤細節（2026-06-11 已改善）

位置：`src/App.jsx`、`src/hooks/useVocabularyData.js`

已補上 `retryVocabulary()` 與 UI 重試按鈕。catalog 失敗時顯示整頁重試；chunk 失敗時首頁仍可保留 catalog 資訊並提供重試。仍可後續再把開發環境錯誤細節顯示得更精準，例如區分 catalog、chunk、track unavailable。

## 重構建議

### 1. 拆分詞庫資料 client 與 React hook（2026-06-11 已完成）

位置：`src/hooks/useVocabularyData.js`

原本同時負責 fetch、module cache、catalog fallback、React loading/error state。2026-06-11 已抽成：

- `src/lib/vocabularyDataClient.js`：讀 catalog、讀 track chunks、cache policy。
- `useVocabularyData()`：只管理 React state 與 abort lifecycle。

目前已新增 unit tests 覆蓋 cache、retry、partial loading 所需的資料 client contract。

### 2. 合併重複的 shuffle/sample

位置：`src/lib/game.js`、`src/lib/quiz/questionBuilders.js`

兩邊各有一份 Fisher-Yates shuffle 與 sample。建議抽到 `src/lib/random.js`，並讓 quiz builder 注入 random/shuffle，之後測驗題目測試會更穩定。

### 3. 明確化「生詞」是全域還是當前詞庫

位置：`src/hooks/useVocabularyApp.js`、`src/lib/progress.js`

目前 `savedWords` 是全域清單，首頁 `starredCount` 顯示全域生詞數；但進度與 known words 是依 track 儲存。若產品語意是「目前詞庫的生詞」，首頁數字需要改為 active track 的 `starredWordIds.length`。若產品語意是「跨詞庫生詞本」，建議 UI 文案標示為全域，避免誤解。

### 4. 為 cloze 題目產生器補測試

位置：`src/lib/quiz/questionBuilders.js`

`extractEnglishPrompt()`、`buildWholeWordPattern()`、`createClozePrompt()` 是 cloze 題品質的核心，但目前沒有直接測邊界案例。建議補：

- 英文句子後接中文括號。
- 單字大小寫。
- 多字詞與含 `/` 的字詞。
- 單字是其他字的一部分時不得誤挖空。

## 載入時間是否可優化

可以。2026-06-11 已先完成首頁阻塞策略與 cache 策略調整；下列前兩項已落地。

建議優先順序：

1. 首頁先用 catalog 顯示總字數，詞庫 chunks 背景預載。
   - 已完成：首頁用 catalog 的 `totalWords` 先顯示總字數。
   - 已完成：chunks 背景載入，載入期間需要完整詞庫的入口會暫時 disabled。

2. 保留 catalog revalidate，但讓 chunk 可快取。
   - 已完成：catalog 使用 `cache: "no-cache"`，retry 使用 `cache: "reload"`。
   - 已完成：chunk 使用版本化 URL `chunk-001.json?v=<catalog.generatedAt>` 與 `cache: "force-cache"`。

3. 切換詞庫時保留舊畫面並顯示局部 loading。
   - 已改善：切換 track 後回到首頁時，catalog 可先撐起首頁框架。
   - 後續可再讓非首頁畫面也做更細的局部 loading。

4. 加入 retry 與錯誤分類。
   - 已完成：偶發 catalog/chunk 失敗可以一鍵重試。
   - 後續可再強化開發環境錯誤分類，辨識 catalog stale、chunk 404，或網路問題。

已驗證效果：

- Playwright 延遲 chunk 2.5 秒時，首頁仍能先顯示 catalog 總字數。
- chunk 載入期間，需要完整詞庫的 5 個入口會 disabled；載入完成後自動恢復。
- chunk 版本化並允許 cache，重訪或切回已載入詞庫時可接近瞬間顯示，且仍能避免部署後資料 stale。
