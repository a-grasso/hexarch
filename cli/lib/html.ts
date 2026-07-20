/**
 * Produce the final HTML: take the viewer's self-contained template and inject
 * the spec payload as a global the app reads on boot (see viewer/src/specs.ts).
 */
import { VIEWER_HTML_B64 } from "../embed";

export interface RawSpec {
  filename: string;
  content: string;
}

export interface Payload {
  specs: RawSpec[];
  theme?: "light" | "dark";
  live?: boolean;
}

let templateCache: string | null = null;
export function viewerTemplate(): string {
  if (templateCache == null) {
    templateCache = Buffer.from(VIEWER_HTML_B64, "base64").toString("utf-8");
  }
  return templateCache;
}

export function renderHtml(payload: Payload): string {
  const template = viewerTemplate();
  // Escape `<` so YAML content containing `</script>` can't break out.
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  const tag = `<script>window.__HEXARCH__=${json};</script>`;
  return template.includes("</head>")
    ? template.replace("</head>", `${tag}</head>`)
    : tag + template;
}
