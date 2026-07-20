import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import fs from "node:fs";
import path from "node:path";

/**
 * Loads *.hexarch.yaml / *.yaml specs from an arbitrary project directory and
 * exposes them to the app as `virtual:hexarch-specs`. This is what lets the
 * viewer point at ANY project's diagrams without that project depending on the
 * viewer - set HEXARCH_DIR to the folder holding the specs.
 *
 * In dev it watches the directory and triggers a full reload when a spec
 * changes, so editing a .hexarch.yaml in your project hot-reloads the diagram.
 */
function hexarchSpecs(dir: string): Plugin {
  const VIRTUAL = "virtual:hexarch-specs";
  const RESOLVED = "\0" + VIRTUAL;

  const isSpec = (f: string) =>
    f.endsWith(".hexarch.yaml") ||
    f.endsWith(".hexarch.yml") ||
    f.endsWith(".yaml") ||
    f.endsWith(".yml");

  function readSpecs() {
    let files: string[] = [];
    try {
      files = fs.readdirSync(dir).filter(isSpec).sort();
    } catch {
      return [];
    }
    return files.map((filename) => ({
      filename,
      content: fs.readFileSync(path.join(dir, filename), "utf-8"),
    }));
  }

  return {
    name: "hexarch-specs",
    resolveId(id) {
      if (id === VIRTUAL) return RESOLVED;
    },
    load(id) {
      if (id === RESOLVED) {
        return `export const SPECS_DIR = ${JSON.stringify(dir)};\n` +
          `export default ${JSON.stringify(readSpecs())};`;
      }
    },
    configureServer(server) {
      server.watcher.add(dir);
      const bust = () => {
        const mod = server.moduleGraph.getModuleById(RESOLVED);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: "full-reload" });
      };
      const onChange = (file: string) => {
        if (isSpec(file) && path.resolve(file).startsWith(path.resolve(dir))) {
          bust();
        }
      };
      server.watcher.on("add", onChange);
      server.watcher.on("change", onChange);
      server.watcher.on("unlink", onChange);
    },
  };
}

// EMBED mode builds the self-contained bundle that the `hex-render` CLI ships:
// no specs are baked in (the CLI injects them at runtime via window.__HEXARCH__).
// Otherwise the dev server / plain build reads HEXARCH_DIR, defaulting to the
// bundled examples.
const EMBED = process.env.HEXARCH_EMBED === "1";
const CORE_DIR = path.resolve(__dirname, "../core");
const SPECS_DIR = EMBED
  ? path.resolve(__dirname, ".no-specs") // nonexistent -> readSpecs() yields []
  : process.env.HEXARCH_DIR
    ? path.resolve(process.env.HEXARCH_DIR)
    : path.resolve(__dirname, "../examples");

export default defineConfig({
  plugins: [
    react(),
    hexarchSpecs(SPECS_DIR),
    // Inline JS+CSS into a single index.html so the CLI can embed one file.
    ...(EMBED ? [viteSingleFile()] : []),
  ],
  resolve: {
    alias: { "@core": CORE_DIR },
  },
  server: {
    port: 5179,
    fs: { allow: [path.resolve(__dirname), CORE_DIR, SPECS_DIR] },
  },
});
