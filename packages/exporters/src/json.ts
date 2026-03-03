import type { ContextSnapshot, ExportedFile } from "@bringthecode/core";
import type { Exporter } from "./base.js";

export class JsonExporter implements Exporter {
  readonly name = "json";
  readonly description = "Export project context as structured JSON";
  readonly targetFiles = ["anchor-context.json"];

  export(snapshot: ContextSnapshot): ExportedFile[] {
    const output = {
      $schema: "https://bringthecode.dev/schema/v1/context.json",
      version: "1.0",
      exportedAt: snapshot.timestamp,
      project: {
        summary: snapshot.summary,
        stack: snapshot.stack,
      },
      decisions: snapshot.decisions.map((d) => ({
        id: d.id,
        title: d.title,
        description: d.description,
        reasoning: d.reasoning,
        category: d.category,
        tags: d.tags,
        date: d.timestamp,
      })),
      fileTree: snapshot.fileTree,
      dependencies: snapshot.dependencies,
      git: snapshot.gitInfo || null,
      notes: snapshot.notes,
    };

    return [
      {
        path: "anchor-context.json",
        content: JSON.stringify(output, null, 2),
      },
    ];
  }
}
