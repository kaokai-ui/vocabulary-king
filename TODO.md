# TODO

## Pronunciation Roadmap

- Current implementation: use browser-native `speechSynthesis` for zero-cost word pronunciation in the web app.
- Upgrade option: add Azure AI Speech for more stable cloud voices and a small free monthly quota.
- Upgrade option: add Google Cloud Text-to-Speech for higher-quality managed voices with free monthly usage on some voice tiers.
- Upgrade option: add Amazon Polly for managed TTS with a time-limited free tier for new accounts.
- Upgrade option: add Piper for offline, self-hosted neural TTS without per-character billing.
- Fallback option: add eSpeak NG for lightweight offline pronunciation when natural voice quality is less important.

## Data Refresh

- After updating the Level 1 / Level 2 workbook, run `npm run refresh:vocab` to rebuild the catalog and chunk files under `public/data/`.
- If you also need a fresh production build after the workbook update, run `npm run build`.

###
你剛更新完 詞彙分級表L1L2.xlsx 之後，手動更新遊戲資料庫的方式是：
npm run refresh:vocab

這個指令會重新產生 public/data/vocabulary.json。
如果你是開發中：
先跑 npm run refresh:vocab
然後重新整理瀏覽器頁面
如果你是要更新正式版：
先跑 npm run refresh:vocab
再跑 npm run build
