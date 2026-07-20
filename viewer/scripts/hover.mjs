// Verify hover interactions: node scripts/hover.mjs <specIndex> <portRectIndex> <out.png> [scheme]
import { chromium } from "playwright";

const [idx = "1", portIdx = "0", out = "hover.png", scheme = "light"] =
  process.argv.slice(2);

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 820 },
  deviceScaleFactor: 2,
  colorScheme: scheme === "dark" ? "dark" : "light",
});
await page.goto("http://localhost:5179", { waitUntil: "networkidle" });
await page.locator(".spec-item").nth(Number(idx)).click();
await page.waitForSelector("svg .hex");

// Labels have pointer-events:none, so move the mouse to the port rect centre.
const rect = page.locator("rect.port").nth(Number(portIdx));
const bb = await rect.boundingBox();
await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
await page.waitForTimeout(350);
await page.screenshot({ path: out });
await browser.close();
console.log("wrote", out);
