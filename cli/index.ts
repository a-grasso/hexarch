#!/usr/bin/env bun
/**
 * hex-render - render a hexarch DSL file to an interactive architecture diagram.
 *
 *   hex-render arch.hexarch.yaml            # write self-contained HTML, open it
 *   hex-render -f arch.yaml -o arch.html    # save the HTML, don't open
 *   hex-render --serve arch.yaml            # live server, reloads on edit
 *   hex-render --dir docs/                  # all specs in a folder (picker)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { parse, ParseError } from "@core/parser";
import { renderHtml, type RawSpec } from "./lib/html";
import { serve } from "./lib/serve";
import { version as VERSION } from "./package.json";

const HELP = `hex-render ${VERSION} - view a hexarch architecture diagram

USAGE
  hex-render [options] <spec.hexarch.yaml> [more specs...]

OPTIONS
  -f, --file <path>    a spec file (repeatable; positionals work too)
  -d, --dir <path>     render every *.yaml / *.hexarch.yaml in a directory
  -o, --out <path>     write the self-contained HTML here (implies --no-open)
  -s, --serve          run a live server that reloads when the spec changes
  -p, --port <n>       server port for --serve (default 5179)
  -t, --theme <t>      force initial theme: light | dark
      --no-open        don't open a browser
  -h, --help           show this help
  -v, --version        print version

EXAMPLES
  hex-render docs/order-service.hexarch.yaml
  hex-render -f order.yaml -o order.html
  hex-render --serve --port 4000 docs/order.yaml
`;

interface Args {
  files: string[];
  dir?: string;
  out?: string;
  serve: boolean;
  port: number;
  theme?: "light" | "dark";
  open: boolean;
}

/** Accept both `--file x` / `--file=x` and Go-style `-file x` / `-file=x`. */
function normalize(argv: string[]): string[] {
  const out: string[] = [];
  for (const tok of argv) {
    if (/^-[a-zA-Z]{2,}(=.*)?$/.test(tok) && !tok.startsWith("--")) {
      out.push("-" + tok); // -file -> --file
    } else {
      out.push(tok);
    }
  }
  return out;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { files: [], serve: false, port: 5179, open: true };
  const toks = normalize(argv);
  for (let i = 0; i < toks.length; i++) {
    let tok = toks[i];
    let inlineVal: string | undefined;
    const eq = tok.indexOf("=");
    if (tok.startsWith("-") && eq !== -1) {
      inlineVal = tok.slice(eq + 1);
      tok = tok.slice(0, eq);
    }
    const next = () => inlineVal ?? toks[++i];
    switch (tok) {
      case "-h": case "--help": console.log(HELP); process.exit(0);
      case "-v": case "--version": console.log(VERSION); process.exit(0);
      case "-s": case "--serve": a.serve = true; break;
      case "--no-open": a.open = false; break;
      case "-f": case "--file": a.files.push(next()); break;
      case "-d": case "--dir": a.dir = next(); break;
      case "-o": case "--out": a.out = next(); a.open = false; break;
      case "-p": case "--port": a.port = Number(next()); break;
      case "-t": case "--theme": {
        const v = next();
        if (v !== "light" && v !== "dark") fail(`--theme must be light or dark, got '${v}'`);
        a.theme = v;
        break;
      }
      default:
        if (tok.startsWith("-")) fail(`unknown option '${tok}' (try --help)`);
        a.files.push(tok);
    }
  }
  return a;
}

function fail(msg: string): never {
  console.error(`hex-render: ${msg}`);
  process.exit(1);
}

const isSpec = (f: string) =>
  /\.(hexarch\.)?ya?ml$/.test(f);

function resolveFiles(a: Args): string[] {
  const files: string[] = [...a.files];
  if (a.dir) {
    const dir = path.resolve(a.dir);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory())
      fail(`--dir is not a directory: ${a.dir}`);
    for (const f of fs.readdirSync(dir).filter(isSpec).sort())
      files.push(path.join(dir, f));
  }
  const abs = files.map((f) => path.resolve(f));
  const seen = new Set<string>();
  const unique = abs.filter((f) => !seen.has(f) && seen.add(f));
  for (const f of unique)
    if (!fs.existsSync(f)) fail(`no such file: ${path.relative(process.cwd(), f)}`);
  return unique;
}

/** Read + validate each spec, reporting to the terminal. Returns the raw specs. */
function readAndValidate(files: string[]): RawSpec[] {
  const specs: RawSpec[] = [];
  let valid = 0;
  for (const f of files) {
    const content = fs.readFileSync(f, "utf-8");
    const filename = path.basename(f);
    specs.push({ filename, content });
    try {
      const arch = parse(content);
      valid++;
      console.error(`  \x1b[32m✓\x1b[0m ${filename}  (${arch.name})`);
    } catch (e) {
      const msg = e instanceof ParseError ? e.message : String(e);
      console.error(`  \x1b[31m✗\x1b[0m ${filename}: ${msg}`);
    }
  }
  if (valid === 0) fail("no valid specs to render");
  return specs;
}

function openBrowser(target: string): void {
  const cmd =
    process.platform === "darwin" ? "open"
    : process.platform === "win32" ? "cmd"
    : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", target] : [target];
  spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  const files = resolveFiles(a);
  if (files.length === 0) {
    console.error(HELP);
    fail("no spec given");
  }

  if (a.serve) {
    const { url } = serve({ files, dir: a.dir ? path.resolve(a.dir) : undefined, port: a.port, theme: a.theme });
    // Validate once for terminal feedback (server re-reads on each request).
    readAndValidate(files);
    console.error(`\nhex-render serving \x1b[36m${url}\x1b[0m  (watching for changes, ctrl-c to stop)`);
    if (a.open) openBrowser(url);
    return; // Bun keeps the process alive while the server is listening.
  }

  const specs = readAndValidate(files);
  const html = renderHtml({ specs, theme: a.theme });

  const outPath = a.out
    ? path.resolve(a.out)
    : path.join(fs.mkdtempSync(path.join(os.tmpdir(), "hexarch-")), "diagram.html");
  fs.writeFileSync(outPath, html);
  console.error(`\nwrote \x1b[36m${path.relative(process.cwd(), outPath) || outPath}\x1b[0m`);

  if (a.open) {
    openBrowser(outPath);
    console.error("opening in browser...");
  }
}

main();
