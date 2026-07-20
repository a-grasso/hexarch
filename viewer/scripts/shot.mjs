// Verification helper: screenshot the running viewer.
// Usage: node scripts/shot.mjs <url> <out.png> [dark|light] [specIndex]
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:5179";
const out = process.argv[3] ?? "shot.png";
const scheme = process.argv[4] === "dark" ? "dark" : "light";
const specIndex = process.argv[5] ? Number(process.argv[5]) : null;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 820 },
  deviceScaleFactor: 2,
  colorScheme: scheme,
});
await page.goto(url, { waitUntil: "networkidle" });
if (specIndex != null) {
  await page.locator(".spec-item").nth(specIndex).click();
}
await page.waitForSelector("svg .hex");
await page.waitForTimeout(300);
await page.screenshot({ path: out });
await browser.close();
console.log("wrote", out);
