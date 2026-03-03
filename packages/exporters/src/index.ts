import type { Exporter } from "./base.js";
import { CursorExporter } from "./cursor.js";
import { ClaudeCodeExporter } from "./claude-code.js";
import { WindsurfExporter } from "./windsurf.js";
import { MarkdownExporter } from "./markdown.js";
import { JsonExporter } from "./json.js";

export type { Exporter } from "./base.js";
export { CursorExporter } from "./cursor.js";
export { ClaudeCodeExporter } from "./claude-code.js";
export { WindsurfExporter } from "./windsurf.js";
export { MarkdownExporter } from "./markdown.js";
export { JsonExporter } from "./json.js";

const exporters: Record<string, Exporter> = {
  cursor: new CursorExporter(),
  "claude-code": new ClaudeCodeExporter(),
  windsurf: new WindsurfExporter(),
  markdown: new MarkdownExporter(),
  json: new JsonExporter(),
};

export function getExporter(name: string): Exporter | undefined {
  return exporters[name];
}

export function listExporters(): Exporter[] {
  return Object.values(exporters);
}

export function getExporterNames(): string[] {
  return Object.keys(exporters);
}
