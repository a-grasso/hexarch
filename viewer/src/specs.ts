/**
 * Where the viewer gets its specs from. Two sources, in priority order:
 *
 *  1. `window.__HEXARCH__` - injected by the `hex-render` CLI into the built,
 *     self-contained HTML (and re-injected on every request in `--serve` mode).
 *  2. `virtual:hexarch-specs` - the dev-server fallback, populated from
 *     HEXARCH_DIR by the Vite plugin. Lets `npm run dev` point at a project.
 *
 * Keeping this behind one module means App.tsx doesn't care which delivered the
 * specs, and the same bundle serves both the CLI and local development.
 */
import virtualSpecs from "virtual:hexarch-specs";

export interface RawSpec {
  filename: string;
  content: string;
}

export interface HexarchGlobal {
  specs?: RawSpec[];
  theme?: "light" | "dark";
  /** true in `hex-render --serve`: enable the live-reload client. */
  live?: boolean;
}

declare global {
  interface Window {
    __HEXARCH__?: HexarchGlobal;
  }
}

const injected: HexarchGlobal =
  (typeof window !== "undefined" && window.__HEXARCH__) || {};

export function loadSpecs(): RawSpec[] {
  if (injected.specs && injected.specs.length) return injected.specs;
  return virtualSpecs as RawSpec[];
}

export function initialTheme(): "light" | "dark" | undefined {
  return injected.theme;
}

export function isLive(): boolean {
  return injected.live === true;
}
