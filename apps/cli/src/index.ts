#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import path from "path";
import fs from "fs";
import {
  ProjectMemory,
  detectStack,
  scanFileTree,
  fileTreeToString,
  countFiles,
  readGitInfo,
  buildContextSnapshot,
  importContext,
  diffSnapshots,
  saveExportBaseline,
  loadExportBaseline,
} from "@bringthecode/core";
import type { AnchorConfig, DecisionCategory } from "@bringthecode/core";
import { getExporter, listExporters, getExporterNames } from "@bringthecode/exporters";

const VERSION = "0.1.0";
const ANCHOR_DIR = ".anchor";
const CONFIG_FILE = "anchor.json";

const program = new Command();

function getAnchorDir(projectPath: string): string {
  return path.join(projectPath, ANCHOR_DIR);
}

function isInitialized(projectPath: string): boolean {
  return fs.existsSync(getAnchorDir(projectPath));
}

async function getMemory(projectPath: string): Promise<ProjectMemory> {
  const memory = new ProjectMemory(getAnchorDir(projectPath));
  await memory.ensureReady();
  return memory;
}

// ============================================================
// anchor init
// ============================================================
program
  .command("init")
  .description("Initialize Anchor in the current project")
  .option("-n, --name <name>", "Project name")
  .option("-d, --description <desc>", "Project description")
  .action(async (opts) => {
    const projectPath = process.cwd();

    if (isInitialized(projectPath)) {
      console.log(chalk.yellow("⚓ Anchor is already initialized in this project."));
      return;
    }

    const spinner = ora("Initializing Anchor...").start();

    try {
      // Create .anchor directory
      const anchorDir = getAnchorDir(projectPath);
      fs.mkdirSync(anchorDir, { recursive: true });

      // Detect stack
      const stack = await detectStack(projectPath);

      // Determine project name
      const name =
        opts.name ||
        (() => {
          try {
            const pkg = JSON.parse(
              fs.readFileSync(path.join(projectPath, "package.json"), "utf-8")
            );
            return pkg.name;
          } catch {
            return path.basename(projectPath);
          }
        })();

      // Create config
      const config: AnchorConfig = {
        version: VERSION,
        projectName: name,
        watchPaths: ["src", "lib", "app", "pages", "components"],
        ignorePaths: [
          "node_modules",
          "dist",
          "build",
          ".next",
          "coverage",
          ".git",
        ],
        autoSync: false,
      };

      fs.writeFileSync(
        path.join(anchorDir, CONFIG_FILE),
        JSON.stringify(config, null, 2)
      );

      // Initialize database and create project
      const memory = await getMemory(projectPath);
      memory.createProject({
        name,
        path: projectPath,
        description: opts.description,
        stack,
      });

      // Add .anchor to .gitignore if git project
      const gitignorePath = path.join(projectPath, ".gitignore");
      if (fs.existsSync(path.join(projectPath, ".git"))) {
        let gitignore = fs.existsSync(gitignorePath)
          ? fs.readFileSync(gitignorePath, "utf-8")
          : "";
        if (!gitignore.includes(".anchor")) {
          gitignore += "\n# Anchor project memory\n.anchor/\n";
          fs.writeFileSync(gitignorePath, gitignore);
        }
      }

      memory.close();
      spinner.succeed(chalk.green("⚓ Anchor initialized!"));

      console.log("");
      console.log(chalk.dim("  Project: ") + chalk.bold(name));
      if (stack.frameworks.length > 0) {
        console.log(
          chalk.dim("  Stack:   ") + stack.frameworks.join(", ")
        );
      }
      if (stack.languages.length > 0) {
        console.log(
          chalk.dim("  Lang:    ") + stack.languages.join(", ")
        );
      }
      console.log("");
      console.log(chalk.dim("  Next steps:"));
      console.log(
        chalk.dim("  → ") +
          chalk.cyan("anchor decide") +
          chalk.dim(" — Record an architectural decision")
      );
      console.log(
        chalk.dim("  → ") +
          chalk.cyan("anchor export cursor") +
          chalk.dim(" — Export context for Cursor")
      );
      console.log(
        chalk.dim("  → ") +
          chalk.cyan("anchor status") +
          chalk.dim(" — View project overview")
      );
    } catch (err: any) {
      spinner.fail(chalk.red("Failed to initialize: " + err.message));
      process.exit(1);
    }
  });

// ============================================================
// anchor status
// ============================================================
program
  .command("status")
  .description("Show project status and overview")
  .action(async () => {
    const projectPath = process.cwd();
    if (!isInitialized(projectPath)) {
      console.log(
        chalk.red("Not an Anchor project. Run ") +
          chalk.cyan("anchor init") +
          chalk.red(" first.")
      );
      process.exit(1);
    }

    const memory = await getMemory(projectPath);
    const project = memory.getProject(projectPath);

    if (!project) {
      console.log(chalk.red("Project not found in database."));
      memory.close();
      process.exit(1);
    }

    const stack = await detectStack(projectPath);
    const fileTree = scanFileTree(projectPath);
    const { files, dirs } = countFiles(fileTree);
    const decisions = memory.getDecisions(project.id);
    const notes = memory.getNotes(project.id);
    const gitInfo = readGitInfo(projectPath);

    console.log("");
    console.log(chalk.bold("⚓ " + project.name));
    console.log(chalk.dim("─".repeat(40)));

    if (project.description) {
      console.log(chalk.dim("  ") + project.description);
      console.log("");
    }

    // Stack
    if (stack.frameworks.length > 0)
      console.log(chalk.dim("  Frameworks:  ") + stack.frameworks.join(", "));
    if (stack.languages.length > 0)
      console.log(chalk.dim("  Languages:   ") + stack.languages.join(", "));
    if (stack.buildTools.length > 0)
      console.log(chalk.dim("  Build:       ") + stack.buildTools.join(", "));
    if (stack.databases.length > 0)
      console.log(chalk.dim("  Databases:   ") + stack.databases.join(", "));

    console.log(chalk.dim("  Files:       ") + `${files} files in ${dirs} directories`);

    // Git
    if (gitInfo) {
      console.log("");
      console.log(chalk.dim("  Branch:      ") + gitInfo.branch);
      console.log(chalk.dim("  Last commit: ") + gitInfo.lastCommitMessage);
      if (gitInfo.uncommittedChanges > 0) {
        console.log(
          chalk.dim("  Changes:     ") +
            chalk.yellow(`${gitInfo.uncommittedChanges} uncommitted`)
        );
      }
    }

    // Decisions
    const activeDecisions = decisions.filter((d) => d.status === "active");
    if (activeDecisions.length > 0) {
      console.log("");
      console.log(
        chalk.dim("  Decisions:   ") +
          `${activeDecisions.length} active`
      );
      for (const d of activeDecisions.slice(0, 5)) {
        console.log(
          chalk.dim("    → ") +
            chalk.cyan(`[${d.category}]`) +
            ` ${d.title}`
        );
      }
      if (activeDecisions.length > 5) {
        console.log(
          chalk.dim(`    ... and ${activeDecisions.length - 5} more`)
        );
      }
    }

    // Notes
    if (notes.length > 0) {
      console.log("");
      console.log(chalk.dim("  Notes:       ") + `${notes.length} notes`);
    }

    console.log("");
    memory.close();
  });

// ============================================================
// anchor decide
// ============================================================
program
  .command("decide")
  .description("Record an architectural decision")
  .requiredOption("-t, --title <title>", "Decision title")
  .requiredOption("-d, --description <desc>", "Decision description")
  .option("-r, --reasoning <reasoning>", "Why this decision was made")
  .option(
    "-c, --category <category>",
    "Category (architecture|technology|design|api|database|deployment|security|performance|refactor|other)",
    "other"
  )
  .option("--tags <tags>", "Comma-separated tags", "")
  .action(async (opts) => {
    const projectPath = process.cwd();
    if (!isInitialized(projectPath)) {
      console.log(chalk.red("Not an Anchor project. Run anchor init first."));
      process.exit(1);
    }

    const memory = await getMemory(projectPath);
    const project = memory.getProject(projectPath);
    if (!project) {
      console.log(chalk.red("Project not found."));
      memory.close();
      process.exit(1);
    }

    const decision = memory.addDecision(project.id, {
      title: opts.title,
      description: opts.description,
      reasoning: opts.reasoning,
      category: opts.category as DecisionCategory,
      tags: opts.tags ? opts.tags.split(",").map((t: string) => t.trim()) : [],
    });

    console.log("");
    console.log(chalk.green("✓ Decision recorded:"));
    console.log(chalk.dim("  Title:    ") + chalk.bold(decision.title));
    console.log(chalk.dim("  Category: ") + chalk.cyan(decision.category));
    console.log(chalk.dim("  ID:       ") + chalk.dim(decision.id));
    console.log("");

    memory.close();
  });

// ============================================================
// anchor note
// ============================================================
program
  .command("note <content>")
  .description("Add a quick note to the project")
  .action(async (content) => {
    const projectPath = process.cwd();
    if (!isInitialized(projectPath)) {
      console.log(chalk.red("Not an Anchor project. Run anchor init first."));
      process.exit(1);
    }

    const memory = await getMemory(projectPath);
    const project = memory.getProject(projectPath);
    if (!project) {
      memory.close();
      process.exit(1);
    }

    memory.addNote(project.id, content);
    console.log(chalk.green("✓ Note added: ") + chalk.dim(content));
    memory.close();
  });

// ============================================================
// anchor export
// ============================================================
program
  .command("export [target]")
  .description(
    `Export project context (targets: ${getExporterNames().join(", ")})`
  )
  .option("--all", "Export to all targets")
  .option("--dry-run", "Preview without writing files")
  .action(async (target, opts) => {
    const projectPath = process.cwd();
    if (!isInitialized(projectPath)) {
      console.log(chalk.red("Not an Anchor project. Run anchor init first."));
      process.exit(1);
    }

    const targets = opts.all ? getExporterNames() : [target || "markdown"];

    const memory = await getMemory(projectPath);
    const spinner = ora("Building context snapshot...").start();

    try {
      const snapshot = await buildContextSnapshot(projectPath, memory);
      spinner.succeed("Context snapshot built");

      for (const t of targets) {
        const exporter = getExporter(t);
        if (!exporter) {
          console.log(
            chalk.yellow(`  ⚠ Unknown target: ${t}. Available: ${getExporterNames().join(", ")}`)
          );
          continue;
        }

        const files = exporter.export(snapshot);

        console.log("");
        console.log(chalk.bold(`  📦 ${exporter.name}`) + chalk.dim(` — ${exporter.description}`));

        for (const file of files) {
          if (opts.dryRun) {
            console.log(chalk.dim(`  Would write: ${file.path}`));
            console.log(chalk.dim("  ---"));
            console.log(chalk.dim(file.content.slice(0, 200) + "..."));
            console.log(chalk.dim("  ---"));
          } else {
            const fullPath = path.join(projectPath, file.path);
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(fullPath, file.content);
            console.log(chalk.green(`  ✓ ${file.path}`));
          }
        }
      }

      console.log("");

      // Save baseline for future diffs
      if (!opts.dryRun) {
        saveExportBaseline(getAnchorDir(projectPath), snapshot);
      }
    } catch (err: any) {
      spinner.fail(chalk.red(err.message));
      process.exit(1);
    }

    memory.close();
  });

// ============================================================
// anchor decisions
// ============================================================
program
  .command("decisions")
  .description("List all decisions")
  .option("-c, --category <category>", "Filter by category")
  .action(async (opts) => {
    const projectPath = process.cwd();
    if (!isInitialized(projectPath)) {
      console.log(chalk.red("Not an Anchor project."));
      process.exit(1);
    }

    const memory = await getMemory(projectPath);
    const project = memory.getProject(projectPath);
    if (!project) {
      memory.close();
      process.exit(1);
    }

    const decisions = memory.getDecisions(project.id, opts.category);

    if (decisions.length === 0) {
      console.log(chalk.dim("No decisions recorded yet. Use ") + chalk.cyan("anchor decide") + chalk.dim(" to add one."));
      memory.close();
      return;
    }

    console.log("");
    console.log(chalk.bold(`⚓ Decisions for ${project.name}`));
    console.log(chalk.dim("─".repeat(50)));

    for (const d of decisions) {
      const statusIcon =
        d.status === "active" ? chalk.green("●") :
        d.status === "superseded" ? chalk.yellow("○") :
        chalk.red("✗");

      console.log("");
      console.log(
        `  ${statusIcon} ${chalk.bold(d.title)} ${chalk.dim(`[${d.category}]`)}`
      );
      console.log(chalk.dim(`    ${d.description}`));
      if (d.reasoning) {
        console.log(chalk.dim(`    Why: ${d.reasoning}`));
      }
      if (d.tags.length > 0) {
        console.log(chalk.dim(`    Tags: ${d.tags.join(", ")}`));
      }
      console.log(chalk.dim(`    ${d.timestamp} · ${d.id.slice(0, 8)}`));
    }

    console.log("");
    memory.close();
  });

// ============================================================
// anchor targets
// ============================================================
program
  .command("targets")
  .description("List available export targets")
  .action(() => {
    console.log("");
    console.log(chalk.bold("Available export targets:"));
    console.log("");
    for (const exp of listExporters()) {
      console.log(
        chalk.cyan(`  ${exp.name.padEnd(15)}`) +
          chalk.dim(exp.description) +
          chalk.dim(`  → ${exp.targetFiles.join(", ")}`)
      );
    }
    console.log("");
    console.log(
      chalk.dim("  Usage: ") +
        chalk.cyan("anchor export <target>") +
        chalk.dim("  or  ") +
        chalk.cyan("anchor export --all")
    );
    console.log("");
  });

// ============================================================
// anchor import
// ============================================================
program
  .command("import")
  .description("Import context from existing .cursorrules, CLAUDE.md, or .windsurfrules")
  .action(async () => {
    const projectPath = process.cwd();
    if (!isInitialized(projectPath)) {
      console.log(chalk.red("Not an Anchor project. Run anchor init first."));
      process.exit(1);
    }

    const memory = await getMemory(projectPath);
    const spinner = ora("Scanning for existing context files...").start();

    try {
      const results = await importContext(projectPath, memory);

      if (results.length === 0) {
        spinner.info("No context files found to import (.cursorrules, CLAUDE.md, .windsurfrules)");
        memory.close();
        return;
      }

      spinner.succeed("Import complete");
      console.log("");

      for (const result of results) {
        console.log(chalk.bold(`  📥 ${result.source}`));
        if (result.decisionsImported > 0) {
          console.log(chalk.green(`    ✓ ${result.decisionsImported} decisions imported`));
        }
        if (result.notesImported > 0) {
          console.log(chalk.green(`    ✓ ${result.notesImported} notes imported`));
        }
        if (result.decisionsImported === 0 && result.notesImported === 0) {
          console.log(chalk.dim("    No new content to import"));
        }
        for (const warning of result.warnings) {
          console.log(chalk.yellow(`    ⚠ ${warning}`));
        }
      }

      console.log("");
    } catch (err: any) {
      spinner.fail(chalk.red(err.message));
      process.exit(1);
    }

    memory.close();
  });

// ============================================================
// anchor diff
// ============================================================
program
  .command("diff")
  .description("Show what changed since last export")
  .action(async () => {
    const projectPath = process.cwd();
    if (!isInitialized(projectPath)) {
      console.log(chalk.red("Not an Anchor project."));
      process.exit(1);
    }

    const anchorDir = getAnchorDir(projectPath);
    const baseline = loadExportBaseline(anchorDir);

    if (!baseline) {
      console.log(
        chalk.yellow("No previous export found. Run ") +
          chalk.cyan("anchor export") +
          chalk.yellow(" first to establish a baseline.")
      );
      process.exit(0);
    }

    const memory = await getMemory(projectPath);
    const spinner = ora("Comparing...").start();

    try {
      const current = await buildContextSnapshot(projectPath, memory);
      const diff = diffSnapshots(baseline, current);

      if (!diff.hasChanges) {
        spinner.succeed("No changes since last export");
        memory.close();
        return;
      }

      spinner.succeed(`Changes detected: ${diff.summary}`);
      console.log("");

      // Stack changes
      if (diff.stackChanges.added.length > 0) {
        console.log(chalk.bold("  Stack additions:"));
        for (const change of diff.stackChanges.added) {
          console.log(chalk.green(`    + ${change.field}: ${change.values.join(", ")}`));
        }
      }
      if (diff.stackChanges.removed.length > 0) {
        console.log(chalk.bold("  Stack removals:"));
        for (const change of diff.stackChanges.removed) {
          console.log(chalk.red(`    - ${change.field}: ${change.values.join(", ")}`));
        }
      }

      // File changes
      if (diff.fileChanges.added.length > 0) {
        console.log(chalk.bold("  New files:"));
        for (const f of diff.fileChanges.added.slice(0, 15)) {
          console.log(chalk.green(`    + ${f}`));
        }
        if (diff.fileChanges.added.length > 15) {
          console.log(chalk.dim(`    ... and ${diff.fileChanges.added.length - 15} more`));
        }
      }
      if (diff.fileChanges.removed.length > 0) {
        console.log(chalk.bold("  Removed files:"));
        for (const f of diff.fileChanges.removed.slice(0, 15)) {
          console.log(chalk.red(`    - ${f}`));
        }
        if (diff.fileChanges.removed.length > 15) {
          console.log(chalk.dim(`    ... and ${diff.fileChanges.removed.length - 15} more`));
        }
      }

      // Decision changes
      if (diff.newDecisions.length > 0) {
        console.log(chalk.bold("  New decisions:"));
        for (const d of diff.newDecisions) {
          console.log(chalk.green(`    + ${d}`));
        }
      }
      if (diff.removedDecisions.length > 0) {
        console.log(chalk.bold("  Removed decisions:"));
        for (const d of diff.removedDecisions) {
          console.log(chalk.red(`    - ${d}`));
        }
      }

      // Notes
      if (diff.newNotes.length > 0) {
        console.log(chalk.bold("  New notes:"));
        for (const n of diff.newNotes) {
          console.log(chalk.green(`    + ${n}`));
        }
      }

      console.log("");
      console.log(
        chalk.dim("  Run ") +
          chalk.cyan("anchor export") +
          chalk.dim(" to update exported files.")
      );
      console.log("");
    } catch (err: any) {
      spinner.fail(chalk.red(err.message));
      process.exit(1);
    }

    memory.close();
  });

// ============================================================
// anchor watch
// ============================================================
program
  .command("watch")
  .description("Watch project for changes and auto-update context")
  .action(async () => {
    const projectPath = process.cwd();
    if (!isInitialized(projectPath)) {
      console.log(chalk.red("Not an Anchor project."));
      process.exit(1);
    }

    // Dynamic import to avoid loading chokidar unless needed
    const { ProjectWatcher } = await import("@bringthecode/watchers");

    const anchorDir = getAnchorDir(projectPath);

    console.log(chalk.bold("⚓ Watching for changes..."));
    console.log(chalk.dim("  Press Ctrl+C to stop\n"));

    const watcher = new ProjectWatcher({
      projectPath,
      anchorDir,
      onChange: (event) => {
        const icon =
          event.type === "add"
            ? chalk.green("+")
            : event.type === "unlink"
            ? chalk.red("-")
            : chalk.yellow("~");
        const timestamp = new Date().toLocaleTimeString();
        console.log(chalk.dim(`  [${timestamp}] `) + `${icon} ${event.path}`);
      },
    });

    watcher.start();

    // Graceful shutdown
    process.on("SIGINT", () => {
      console.log(chalk.dim("\n  Stopping watcher..."));
      watcher.stop();
      process.exit(0);
    });

    // Keep process alive
    await new Promise(() => {});
  });

// ============================================================
// anchor summary
// ============================================================
program
  .command("summary")
  .description("Generate an AI-powered project summary")
  .option("--api-key <key>", "Anthropic API key (or set ANTHROPIC_API_KEY env)")
  .action(async (opts) => {
    const projectPath = process.cwd();
    if (!isInitialized(projectPath)) {
      console.log(chalk.red("Not an Anchor project."));
      process.exit(1);
    }

    const apiKey = opts.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.log(chalk.yellow("No API key provided."));
      console.log(
        chalk.dim("  Set ") +
          chalk.cyan("ANTHROPIC_API_KEY") +
          chalk.dim(" env variable or use ") +
          chalk.cyan("--api-key <key>")
      );
      console.log("");
      console.log(chalk.dim("  Falling back to basic summary...\n"));
    }

    const memory = await getMemory(projectPath);
    const spinner = ora("Building context...").start();

    try {
      const snapshot = await buildContextSnapshot(projectPath, memory);

      if (apiKey) {
        spinner.text = "Generating AI summary...";

        const prompt = `You are analyzing a software project. Based on the following context, provide a concise but thorough project summary. Include: what the project does, key architectural decisions, tech stack highlights, and any notable patterns or concerns.

Project Context:
${JSON.stringify({
  summary: snapshot.summary,
  stack: snapshot.stack,
  decisions: snapshot.decisions.map(d => ({ title: d.title, description: d.description, reasoning: d.reasoning, category: d.category })),
  notes: snapshot.notes,
  gitInfo: snapshot.gitInfo,
  fileCount: snapshot.fileTree.length,
  dependencyCount: Object.keys(snapshot.dependencies).length,
}, null, 2)}

Provide a clear, actionable summary in markdown format. Keep it under 500 words.`;

        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1024,
            messages: [{ role: "user", content: prompt }],
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`API error (${response.status}): ${errText}`);
        }

        const data = await response.json() as any;
        const summaryText = data.content
          .filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join("\n");

        spinner.succeed("AI summary generated");
        console.log("");
        console.log(summaryText);
        console.log("");
      } else {
        // Basic summary without AI
        spinner.succeed("Basic summary");
        console.log("");
        console.log(chalk.bold(`⚓ ${snapshot.summary}`));
        console.log("");

        const s = snapshot.stack;
        if (s.frameworks.length > 0) {
          console.log(chalk.dim("  Stack: ") + [...s.frameworks, ...s.languages].join(", "));
        }

        if (snapshot.decisions.length > 0) {
          console.log("");
          console.log(chalk.bold("  Key decisions:"));
          for (const d of snapshot.decisions) {
            console.log(chalk.dim(`  → [${d.category}] `) + d.title);
            console.log(chalk.dim(`    ${d.description}`));
          }
        }

        if (snapshot.notes.length > 0) {
          console.log("");
          console.log(chalk.bold("  Notes:"));
          for (const note of snapshot.notes) {
            console.log(chalk.dim(`  • ${note}`));
          }
        }

        if (snapshot.gitInfo) {
          console.log("");
          console.log(chalk.dim(`  Branch: ${snapshot.gitInfo.branch} · Last: ${snapshot.gitInfo.lastCommitMessage}`));
        }

        console.log("");
        console.log(
          chalk.dim("  Tip: Set ") +
            chalk.cyan("ANTHROPIC_API_KEY") +
            chalk.dim(" for an AI-powered summary.")
        );
        console.log("");
      }
    } catch (err: any) {
      spinner.fail(chalk.red(err.message));
      process.exit(1);
    }

    memory.close();
  });

// ============================================================
// anchor reset
// ============================================================
program
  .command("reset")
  .description("Remove Anchor from this project (deletes .anchor directory)")
  .option("-y, --yes", "Skip confirmation")
  .action(async (opts) => {
    const projectPath = process.cwd();
    if (!isInitialized(projectPath)) {
      console.log(chalk.dim("No Anchor project found here."));
      return;
    }

    if (!opts.yes) {
      console.log(
        chalk.yellow("⚠ This will delete all Anchor data for this project.")
      );
      console.log(chalk.dim("  Run with --yes to confirm."));
      return;
    }

    const anchorDir = getAnchorDir(projectPath);
    fs.rmSync(anchorDir, { recursive: true, force: true });
    console.log(chalk.green("✓ Anchor data removed."));
  });

// ============================================================
// Main
// ============================================================
program
  .name("anchor")
  .version(VERSION)
  .description(
    "⚓ Anchor — Own your AI-coded projects. Platform-agnostic project memory and context portability."
  );

program.parse();
