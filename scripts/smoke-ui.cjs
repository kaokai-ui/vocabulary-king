const fs = require("node:fs");
const path = require("node:path");
const { chromium, devices } = require("playwright");

async function capture(page, fileName) {
  const outputDir = path.resolve("outputs", "ui-smoke");
  fs.mkdirSync(outputDir, { recursive: true });
  await page.screenshot({
    path: path.join(outputDir, fileName),
    fullPage: true
  });
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const port = Number(process.env.VOCABULARY_UI_SMOKE_PORT || 4173);
  const baseUrl = `http://127.0.0.1:${port}`;

  const desktop = await browser.newPage({
    viewport: { width: 1440, height: 1024 }
  });

  await desktop.goto(baseUrl, { waitUntil: "networkidle" });
  await desktop.evaluate(() => window.localStorage.clear());
  await desktop.reload({ waitUntil: "networkidle" });

  await desktop.getByRole("button", { name: /功能設定|Feature Settings/i }).click();
  await desktop.locator(".settings-select").first().selectOption("ielts");
  await desktop.getByText("5594", { exact: true }).waitFor({ state: "visible" });
  await desktop.getByText("IELTS", { exact: true }).first().waitFor({ state: "visible" });
  await capture(desktop, "home-desktop.png");
  console.log("IELTS selected; 5594 words loaded");

  await desktop.getByRole("button", { name: /閃卡練習[（(]隨機[）)]|Flashcards \\(Random\\)/i }).click();
  await desktop.locator(".flashcard-word-lines").waitFor({ state: "visible" });
  await desktop.getByText("IELTS", { exact: true }).first().waitFor({ state: "visible" });
  await capture(desktop, "flashcard-game.png");
  console.log("Started IELTS flashcard practice");

  await desktop.getByRole("button", { name: /主畫面|Home/i }).first().click();
  await capture(desktop, "home-resume.png");
  console.log("Captured resume home");

  await desktop.getByRole("button", { name: /繼續目前進度|Resume session/i }).click();
  await desktop.getByRole("button", { name: /主畫面|Home/i }).first().click();
  await desktop.getByRole("button", { name: /單字測驗|Quiz/i }).first().click();
  await capture(desktop, "quiz-setup.png");
  console.log("Captured quiz setup");

  await desktop.getByRole("button", { name: /開始測驗|Start quiz/i }).first().click();
  await desktop.locator(".quiz-stage").waitFor({ state: "visible" });
  await desktop.getByText("IELTS", { exact: true }).first().waitFor({ state: "visible" });
  await capture(desktop, "quiz-game.png");
  console.log("Started IELTS quiz");

  const phone = await browser.newPage(devices["iPhone 13"]);
  await phone.goto(baseUrl, { waitUntil: "networkidle" });
  await phone.evaluate(() => window.localStorage.clear());
  await phone.reload({ waitUntil: "networkidle" });
  await capture(phone, "home-mobile.png");
  console.log("Captured home mobile");

  console.log("UI smoke run completed");
  await browser.close();
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
