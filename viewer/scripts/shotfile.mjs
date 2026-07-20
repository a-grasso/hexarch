// Screenshot a local HTML file (used to verify CLI output). Args: <htmlPath> <pngPath>
import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 2 });
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));
p.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
await p.goto("file://" + process.argv[2], { waitUntil: "networkidle" });
await p.waitForTimeout(600);
await p.screenshot({ path: process.argv[3] });
console.log("errors:", errs.length ? errs.join("\n") : "none");
await b.close();
