const fs = require("node:fs");
const path = require("node:path");
const { chromium, devices } = require("playwright");

const OUTPUT_DIR = path.resolve("outputs", "ui-smoke");

async function finishTest(page) {
  await page.goto("http://127.0.0.1:" + (process.env.VOCABULARY_UI_SMOKE_PORT || 4173), {
    waitUntil: "networkidle"
  });
  await page.getByRole("button", {
    name: /單字量測驗|Vocabulary Size Test|語彙数チェック|어휘량 테스트/i
  }).click();
  await page.locator(".level-test-question-panel").waitFor({ state: "visible" });

  for (let question = 0; question < 30; question += 1) {
    await page.locator(".level-test-choice").first().click();
    if (question < 29) {
      await page.getByText("第 " + (question + 2) + " 題，共 30 題", { exact: true })
        .waitFor({ state: "visible" });
    }
  }

  await page.locator(".level-test-result-panel").waitFor({ state: "visible" });
  const wordCount = (await page.locator(".level-test-result-number strong").textContent())?.trim() ?? "";
  if (!/\d/u.test(wordCount)) {
    throw new Error("The level test result did not show an estimated vocabulary size.");
  }
  await page.locator(".level-test-history-list li").first().waitFor({ state: "visible" });
  return wordCount;
}

async function captureResult(browser, pageOptions, fileName) {
  const page = await browser.newPage(pageOptions);
  const wordCount = await finishTest(page);
  await page.screenshot({
    path: path.join(OUTPUT_DIR, fileName),
    fullPage: true
  });
  await page.close();
  return wordCount;
}

async function run() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  try {
    const desktopCount = await captureResult(
      browser,
      { viewport: { width: 1440, height: 1024 } },
      "level-test-result-desktop.png"
    );
    console.log("Desktop level test completed: about " + desktopCount + " words.");

    const phoneCount = await captureResult(
      browser,
      devices["iPhone 13"],
      "level-test-result-mobile.png"
    );
    console.log("Mobile level test completed: about " + phoneCount + " words.");
    console.log("Saved desktop and mobile screenshots in outputs/ui-smoke/.");
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
