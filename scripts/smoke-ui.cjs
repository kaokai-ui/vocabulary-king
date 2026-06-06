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

  const desktop = await browser.newPage({
    viewport: { width: 1440, height: 1024 }
  });

  await desktop.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
  await desktop.evaluate(() => window.localStorage.clear());
  await desktop.reload({ waitUntil: "networkidle" });
  await capture(desktop, "home-desktop.png");
  console.log("Captured home desktop");

  await desktop.getByRole("button", { name: /閃卡練習（隨機）|Flashcards \\(Random\\)/i }).click();
  await capture(desktop, "flashcard-game.png");
  console.log("Captured flashcard game");

  await desktop.getByRole("button", { name: /主畫面|Home/i }).first().click();
  await capture(desktop, "home-resume.png");
  console.log("Captured resume home");

  await desktop.getByRole("button", { name: /繼續目前進度|Resume session/i }).click();
  await desktop.getByRole("button", { name: /主畫面|Home/i }).first().click();
  await desktop.getByRole("button", { name: /單字測驗|Quiz/i }).click();
  await capture(desktop, "quiz-setup.png");
  console.log("Captured quiz setup");

  await desktop.getByRole("button", { name: /開始測驗|Start quiz/i }).first().click();
  await capture(desktop, "quiz-game.png");
  console.log("Captured quiz game");

  const phone = await browser.newPage(devices["iPhone 13"]);
  await phone.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
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
