import type { ContextSnapshot, ExportedFile } from "@anchor/core";
import { fileTreeToString } from "@anchor/core";
import type { Exporter } from "./base.js";

export class MarkdownExporter implements Exporter {
  readonly name = "markdown";
  readonly description = "Export project context as generic Markdown";
  readonly targetFiles = ["PROJECT-CONTEXT.md"];

  export(snapshot: ContextSnapshot): ExportedFile[] {
    return [
      {
        path: "PROJECT-CONTEXT.md",
        content: this.buildMarkdown(snapshot),
      },
    ];
  }

  private buildMarkdown(snapshot: ContextSnapshot): string {
    const lines: string[] = [];

    lines.push(`# Project Context`);
    lines.push(`> Exported by Anchor at ${snapshot.timestamp}`);
    lines.push("");

    lines.push(`## Summary`);
    lines.push(snapshot.summary);
    lines.push("");

    // Stack
    const s = snapshot.stack;
    lines.push(`## Technology Stack`);
    if (s.languages.length > 0) lines.push(`- **Languages:** ${s.languages.join(", ")}`);
    if (s.frameworks.length > 0) lines.push(`- **Frameworks:** ${s.frameworks.join(", ")}`);
    if (s.buildTools.length > 0) lines.push(`- **Build Tools:** ${s.buildTools.join(", ")}`);
    if (s.databases.length > 0) lines.push(`- **Databases:** ${s.databases.join(", ")}`);
    if (s.runtime) lines.push(`- **Runtime:** ${s.runtime}`);
    if (s.packageManager) lines.push(`- **Package Manager:** ${s.packageManager}`);
    lines.push("");

    // Structure
    lines.push(`## Project Structure`);
    lines.push("```");
    lines.push(fileTreeToString(snapshot.fileTree));
    lines.push("```");
    lines.push("");

    // Decisions
    if (snapshot.decisions.length > 0) {
      lines.push(`## Decisions`);
      for (const d of snapshot.decisions) {
        lines.push(`### ${d.title}`);
        lines.push(`- **Category:** ${d.category}`);
        lines.push(`- **Date:** ${d.timestamp}`);
        lines.push(`- **Description:** ${d.description}`);
        if (d.reasoning) lines.push(`- **Reasoning:** ${d.reasoning}`);
        if (d.tags.length > 0) lines.push(`- **Tags:** ${d.tags.join(", ")}`);
        lines.push("");
      }
    }

    // Dependencies
    const deps = Object.entries(snapshot.dependencies);
    if (deps.length > 0) {
      lines.push(`## Dependencies`);
      lines.push(`| Package | Version |`);
      lines.push(`|---------|---------|`);
      for (const [name, version] of deps) {
        lines.push(`| ${name} | ${version} |`);
      }
      lines.push("");
    }

    // Git
    if (snapshot.gitInfo) {
      lines.push(`## Git Info`);
      lines.push(`- **Branch:** ${snapshot.gitInfo.branch}`);
      lines.push(`- **Last Commit:** ${snapshot.gitInfo.lastCommitMessage} (\`${snapshot.gitInfo.lastCommit}\`)`);
      if (snapshot.gitInfo.remoteUrl) lines.push(`- **Remote:** ${snapshot.gitInfo.remoteUrl}`);
      lines.push("");
    }

    // Notes
    if (snapshot.notes.length > 0) {
      lines.push(`## Notes`);
      for (const note of snapshot.notes) {
        lines.push(`- ${note}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }
}
