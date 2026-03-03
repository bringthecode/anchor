import type { ContextSnapshot, ExportedFile } from "@bringthecode/core";

export interface Exporter {
  readonly name: string;
  readonly description: string;
  readonly targetFiles: string[];
  export(snapshot: ContextSnapshot): ExportedFile[];
}
