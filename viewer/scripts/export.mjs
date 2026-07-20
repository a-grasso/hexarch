/**
 * Headless static export: render every spec to a tightly-cropped PNG.
 * The viewer must be running (npm run dev). Reuses the exact browser layout,
 * so the export matches what you see.
 *
 * Usage:
 *   node scripts/export.mjs [url] [outDir] [light|dark]
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const url = process.argv[2] ?? "http://localhost:5179";
const outDir = process.argv[3] ?? "export";
const scheme = process.argv[4] === "dark" ? "dark" : "light";

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
  colorScheme: scheme,
});
await page.goto(url, { waitUntil: "networkidle" });

const count = await page.locator(".spec-item").count();
for (let i = 0; i < count; i++) {
  const item = page.locator(".spec-item").nth(i);
  const label = (await item.textContent())?.trim() ?? `spec-${i}`;
  await item.click();
  await page.waitForSelector("svg .hex");
  await page.waitForTimeout(250);

  // Tight crop to the rendered diagram (the transformed inner <g>).
  const box = await page.evaluate(() => {
    const g = document.querySelector("svg > g");
    if (!g) return null;
    const r = g.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const file = path.join(outDir, `${slug}.png`);
  await page.screenshot({
    path: file,
    clip: box ? { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height + 16 } : undefined,
  });
  console.log("exported", file);
}
await browser.close();
