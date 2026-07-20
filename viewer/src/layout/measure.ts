/**
 * Real text measurement via a canvas 2d context. This is the single biggest
 * reason to render in a browser: box sizes are measured, not estimated, so
 * chips and labels never overflow or leave ragged gaps.
 *
 * Falls back to a rough estimate only when there is no DOM (e.g. a plain Node
 * import), which the actual viewer never hits.
 */
export const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif';

let ctx: CanvasRenderingContext2D | null = null;

function getCtx(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (!ctx) ctx = document.createElement("canvas").getContext("2d");
  return ctx;
}

export interface TextOpts {
  size?: number;
  weight?: number;
}

export function measureText(text: string, opts: TextOpts = {}): number {
  const size = opts.size ?? 13;
  const weight = opts.weight ?? 400;
  const c = getCtx();
  if (!c) return text.length * size * 0.55; // headless-less fallback
  c.font = `${weight} ${size}px ${FONT_STACK}`;
  return c.measureText(text).width;
}
