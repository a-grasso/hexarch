/**
 * Live server for `hex-render --serve`: serves the viewer with freshly-read
 * specs on every request and pushes a reload over SSE when a watched file
 * changes. No Vite, no build step - just Bun.serve + fs.watch.
 */
import fs from "node:fs";
import path from "node:path";
import { renderHtml, type RawSpec } from "./html";

export interface ServeOptions {
  /** Absolute paths to the spec files to serve and watch. */
  files: string[];
  /** Optional directory to watch for added/removed specs. */
  dir?: string;
  port: number;
  theme?: "light" | "dark";
}

function readSpecs(files: string[]): RawSpec[] {
  return files
    .filter((f) => fs.existsSync(f))
    .map((f) => ({
      filename: path.basename(f),
      content: fs.readFileSync(f, "utf-8"),
    }));
}

export function serve(opts: ServeOptions): { url: string; stop: () => void } {
  const clients = new Set<ReadableStreamDefaultController>();
  const encoder = new TextEncoder();
  const notify = () => {
    for (const c of clients) {
      try {
        c.enqueue(encoder.encode("data: reload\n\n"));
      } catch {
        clients.delete(c);
      }
    }
  };

  const server = Bun.serve({
    port: opts.port,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/__hexarch_events") {
        const stream = new ReadableStream({
          start(controller) {
            clients.add(controller);
          },
          cancel() {
            /* controller removed lazily on next notify */
          },
        });
        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
          },
        });
      }
      if (url.pathname === "/" || url.pathname === "/index.html") {
        const html = renderHtml({
          specs: readSpecs(opts.files),
          theme: opts.theme,
          live: true,
        });
        return new Response(html, {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      return new Response("not found", { status: 404 });
    },
  });

  // Debounced watch: editors often fire several events per save.
  let timer: ReturnType<typeof setTimeout> | null = null;
  const bump = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(notify, 60);
  };
  const watchers = new Set<fs.FSWatcher>();
  const watchTargets = opts.dir ? [opts.dir, ...opts.files] : opts.files;
  for (const t of watchTargets) {
    try {
      watchers.add(fs.watch(t, { persistent: true }, bump));
    } catch {
      /* a file that vanished; the dir watcher (if any) still fires */
    }
  }

  return {
    url: `http://localhost:${server.port}`,
    stop: () => {
      for (const w of watchers) w.close();
      server.stop(true);
    },
  };
}
