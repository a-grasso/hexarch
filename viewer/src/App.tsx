import { useEffect, useMemo, useState } from "react";
import { parse, ParseError } from "@core/parser";
import type { Architecture } from "@core/model";
import { loadSpecs, initialTheme, isLive } from "./specs";
import { Diagram } from "./components/Diagram";

const specs = loadSpecs();

interface Parsed {
  filename: string;
  title: string;
  arch?: Architecture;
  error?: string;
}

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const forced = initialTheme();
    if (forced) return forced;
    const saved = localStorage.getItem("hexarch-theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("hexarch-theme", theme);
  }, [theme]);
  return [theme, setTheme] as const;
}

/**
 * In `hex-render --serve`, subscribe to the server's change stream and reload
 * when the watched spec file changes. A no-op in static/dev builds.
 */
function useLiveReload() {
  useEffect(() => {
    if (!isLive()) return;
    const es = new EventSource("/__hexarch_events");
    es.onmessage = () => location.reload();
    return () => es.close();
  }, []);
}

export default function App() {
  const parsed = useMemo<Parsed[]>(
    () =>
      specs.map((s) => {
        try {
          const arch = parse(s.content);
          return { filename: s.filename, title: arch.name, arch };
        } catch (e) {
          const msg = e instanceof ParseError ? e.message : String(e);
          return { filename: s.filename, title: s.filename, error: msg };
        }
      }),
    [],
  );

  const [selected, setSelected] = useState(0);
  const [theme, setTheme] = useTheme();
  useLiveReload();
  // Collapsed sections, tracked per spec filename.
  const [collapsedByFile, setCollapsedByFile] = useState<
    Record<string, Set<string>>
  >({});

  const current = parsed[selected];
  const collapsed = collapsedByFile[current?.filename] ?? EMPTY;

  const toggleSection = (key: string) => {
    if (!current) return;
    setCollapsedByFile((prev) => {
      const next = new Set(prev[current.filename] ?? []);
      next.has(key) ? next.delete(key) : next.add(key);
      return { ...prev, [current.filename]: next };
    });
  };

  if (specs.length === 0) {
    return (
      <div className="error">
        No specs found. Render one with the CLI:
        {"\n\n"}hex-render --file path/to/arch.hexarch.yaml
        {"\n\n"}or point the dev server at a folder of specs:
        {"\n\n"}HEXARCH_DIR=/path/to/your/project/docs npm run dev
      </div>
    );
  }

  const arch = current?.arch;
  // A single spec (the common `hex-render --file` case) needs no picker.
  const showSidebar = parsed.length > 1;

  return (
    <div className={"app" + (showSidebar ? "" : " solo")}>
      {showSidebar && (
        <aside className="sidebar">
          <h1>hexarch</h1>
          {parsed.map((p, i) => (
            <button
              key={p.filename}
              className={"spec-item" + (i === selected ? " active" : "")}
              onClick={() => setSelected(i)}
            >
              {p.title}
              {p.error && <span className="err-dot" title={p.error}>●</span>}
            </button>
          ))}
          <div className="spacer" />
          <div className="hint">
            Edit a spec file and the diagram hot-reloads. Hover a port for its
            operations; click a section header to collapse it.
          </div>
        </aside>
      )}

      <main className="main">
        <div className="toolbar">
          <div>
            <div className="title">{current?.title}</div>
            <div className="subtitle">
              {arch
                ? arch.description ??
                  `${arch.core.domain.length} domain · ${arch.inbound.length} inbound · ${arch.outbound.length} outbound · ${arch.primary.length + arch.secondary.length} adapters`
                : current?.filename}
            </div>
          </div>
          <div className="grow" />
          <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? "☀ Light" : "☾ Dark"}
          </button>
        </div>

        {arch ? (
          <Diagram
            key={current.filename}
            arch={arch}
            collapsed={collapsed}
            onToggleSection={toggleSection}
          />
        ) : (
          <div className="error">{current?.error}</div>
        )}

        {arch && (
          <div className="legend">
            <span><i style={{ background: "var(--driving-soft)", border: "2px solid var(--driving)" }} /> Driving (primary)</span>
            <span><i style={{ background: "var(--driven-soft)", border: "2px solid var(--driven)" }} /> Driven (secondary)</span>
            <span><i style={{ background: "var(--chip-domain-bg)", border: "2px solid var(--chip-domain-bd)" }} /> Domain</span>
            <span><i style={{ background: "var(--chip-service-bg)", border: "2px solid var(--chip-service-bd)" }} /> Application</span>
          </div>
        )}
      </main>
    </div>
  );
}

const EMPTY = new Set<string>();
