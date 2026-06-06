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

