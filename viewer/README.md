# hexarch viewer

Standalone Vite + React + TypeScript viewer for the [hexarch DSL](../dsl/SPEC.md).

## Run

```bash
npm install
npm run dev                                  # serves ../examples on :5179
HEXARCH_DIR=/abs/path/to/specs npm run dev   # serve any project's specs
```

`HEXARCH_DIR` may hold `*.hexarch.yaml`, `*.hexarch.yml`, `*.yaml` or `*.yml`.
Files are watched; edits hot-reload the diagram.

## Scripts

| command | what |
|---------|------|
| `npm run dev` | dev server with hot-reload |
| `npm run build` | typecheck + production bundle into `dist/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run export -- <url> <outDir> [light\|dark]` | render every spec to a cropped PNG (needs the dev server running) |

Verification helpers: `scripts/shot.mjs` (screenshot a spec) and
`scripts/hover.mjs` (screenshot a port's hover state).

## How it's built

| path | responsibility |
|------|----------------|
| `src/dsl/model.ts` | semantic model types (no geometry) |
| `src/dsl/parser.ts` | YAML -> model, with validation |
| `src/layout/measure.ts` | real text measurement (canvas) |
| `src/layout/layout.ts` | model + UI state -> positioned geometry (pure) |
| `src/components/Diagram.tsx` | SVG rendering + pan/zoom/hover/focus |
| `src/App.tsx` | sidebar, toolbar, theme, spec selection |
| `vite.config.ts` | `hexarchSpecs` plugin: loads/watches `HEXARCH_DIR` |

The layout is a pure function of the model plus measured text, so the same code
path drives the interactive viewer and the static export.
