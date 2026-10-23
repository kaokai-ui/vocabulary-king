# 詞彙重建套用工具報告

## 工作位置與範圍

- 程式 worktree：`D:\Game\VocabularyKing-rebuild`，分支 `codex/vocab-rebuild-apply-20261023`。
- 詞庫資料複本：`D:\Game\VocabularyKing-data-rebuild`，分支 `codex/rebuild`。
- 主目錄與主資料 repo 沒有修改；套用工具的正式寫入路徑只指向明確指定的資料複本。
- 新增獨立的 `apply:vocab-rebuild`，既有 `writeback:vocab` 與其實作未修改。

## 實作

- 套用工具依同一 part 內的 `word` 將輸出列對應到骨架；不依賴 out 列順序。重複 word 只有在骨架 level 能唯一辨識時才配對，無法唯一辨識就報錯；out 的 `uid` 僅作交叉檢查，且錯誤會列出預期與收到的 UID。
- 保留列的 UID 一律取自骨架 reuse；無 reuse 的列才產生新 UID。完整 parts 才能寫入，部分輸出只能做 dry-run。驗證失敗不會寫入資料。
- senses 驗證會拒絕同列重複 POS，並檢查 POS、翻譯、例句、例句詞形及共用例句。
- TOEIC、TOEIC 進階、TOEFL、IELTS 的目錄等級由來源資料動態產生；設定頁提供等級篩選和單字表來源／授權說明，練習與測驗沿用所選等級。
- `scripts/smoke-ui.cjs` 的 IELTS 標籤檢查改為接受「IELTS＋等級」顯示。

## 驗證

- `npm run check:site`（`VOCABULARY_DATA_REPO` 指向資料複本）：通過，36 個測試檔、199 項測試；11 個辭庫共 31,332 列驗證完成，Vite site build 成功。
- `npm run check:content`（指向資料複本）：完成，檢查 11 個辭庫共 31,332 列。工具回報 0 格式錯誤、0 不同單字共用英文例句；另列 130 筆一字多義待人工確認、6 筆確定的疑似轉換錯誤、68 筆待人工確認、225 筆例句未含單字或變化形、10 筆同字同詞性重複。這些是內容檢查報告中的 findings，命令正常完成。
- UI 冒煙：通過，首頁載入 IELTS 5,594 字、卡片練習、測驗流程及手機首頁均完成。
- 新套用工具測試：10 項通過，涵蓋輸出順序、UID 交叉檢查、重複 word 歧義、重複 POS、部分 dry-run、保留舊 UID／IPA、新增 UID／IPA、片語、刪除 alias 及動態等級目錄。

## TOEIC 輸出 dry-run

目前輸出有 16/34 個 part，共 2,400 列；只以 `--dry-run --allow-partial` 檢查，沒有套用或寫入。候選統計為更新 1,349、刪除 0、新增 1,051。驗證拒絕 15 列：`after`、`back`、`part` 超過每列 3 個 senses；`percentage`、`south`、`decrease`、`gun`、`frame`、`west`、`combination`、`shot`、`religion`、`unusual`、`neck`、`mate` 的英文例句未含單字或支援的變化形。工具明確回報 `No data files were written.`，完整輸出且修正這些內容後才能套用。

## 資料狀態

- dry-run 沒有修改 `D:\Game\VocabularyKing-data-rebuild`；資料複本保持乾淨。
- `public/data` 沒有變更；未匯出或部署。
