import fs from "fs";
import path from "path";
import { BrowserWindow } from "electron";
import { GitWatcher } from "./git-watcher";
import { SnapshotManager } from "./snapshot-manager";
import { randomUUID } from "crypto";

// We'll use the core modules directly via require since this is commonjs
const initSqlJs = require("sql.js");

interface ManagedProject {
  path: string;
  name: string;
  gitWatcher: GitWatcher;
  snapshotManager: SnapshotManager;
  db: any; // sql.js database
}

interface ProjectInfo {
  path: string;
  name: string;
  stack: any;
  lastActivity: string;
  decisionCount: number;
  phaseCount: number;
  gitBranch: string;
}

const PROJECTS_FILE = path.join(
  process.env.HOME || process.env.USERPROFILE || ".",
  ".anchor-projects.json"
);

export class ProjectManager {
  private projects: Map<string, ManagedProject> = new Map();
  private SQL: any = null;

  private async ensureSQL() {
    if (!this.SQL) {
      this.SQL = await initSqlJs();
    }
    return this.SQL;
  }

  private async getDb(projectPath: string): Promise<any> {
    const existing = this.projects.get(projectPath);
    if (existing?.db) return existing.db;

    const SQL = await this.ensureSQL();
    const anchorDir = path.join(projectPath, ".anchor");
    const dbPath = path.join(anchorDir, "memory.db");
    fs.mkdirSync(anchorDir, { recursive: true });

    let db;
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }

    // Ensure schema exists
    db.run(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL UNIQUE,
        description TEXT, stack_json TEXT DEFAULT '{}',
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL, timestamp TEXT NOT NULL,
        title TEXT NOT NULL, description TEXT NOT NULL, reasoning TEXT,
        category TEXT DEFAULT 'other', tags_json TEXT DEFAULT '[]',
        status TEXT DEFAULT 'active', superseded_by TEXT
      );
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL,
        timestamp TEXT NOT NULL, content TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS activity_log (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL,
        timestamp TEXT NOT NULL, type TEXT NOT NULL,
        summary TEXT NOT NULL, details_json TEXT DEFAULT '{}'
      );
    `);

    this.saveDb(db, dbPath);
    return db;
  }

  private saveDb(db: any, dbPath: string) {
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
  }

  private saveDbs(projectPath: string) {
    const project = this.projects.get(projectPath);
    if (project?.db) {
      const dbPath = path.join(projectPath, ".anchor", "memory.db");
      this.saveDb(project.db, dbPath);
    }
  }

  // === Project lifecycle ===

  async openProject(projectPath: string): Promise<ProjectInfo> {
    // 1. Validate path exists
    if (!fs.existsSync(projectPath)) {
      throw new Error(`Project folder not found: ${projectPath}`);
    }

    // Detect stack
    const stack = this.detectStack(projectPath);
    const name = this.detectProjectName(projectPath);

    // Initialize anchor dir
    const anchorDir = path.join(projectPath, ".anchor");
    fs.mkdirSync(anchorDir, { recursive: true });

    // 3. Auto-add .anchor/ to .gitignore
    const gitignorePath = path.join(projectPath, ".gitignore");
    try {
      let gitignore = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, "utf-8") : "";
      if (!gitignore.includes(".anchor/") && !gitignore.includes(".anchor")) {
        gitignore = gitignore.trimEnd() + "\n\n# Anchor local data\n.anchor/\n";
        fs.writeFileSync(gitignorePath, gitignore, "utf-8");
      }
    } catch { /* ignore if .gitignore isn't writable */ }

    // Setup database
    const db = await this.getDb(projectPath);

    // Ensure project exists in DB
    const existing = db.exec("SELECT id FROM projects WHERE path = ?", [projectPath]);
    if (existing.length === 0 || existing[0].values.length === 0) {
      const id = randomUUID();
      const now = new Date().toISOString();
      db.run(
        "INSERT INTO projects (id, name, path, stack_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        [id, name, projectPath, JSON.stringify(stack), now, now]
      );
      this.saveDb(db, path.join(anchorDir, "memory.db"));
    }

    // Start git watcher
    const gitWatcher = new GitWatcher(projectPath);
    await gitWatcher.start();

    // Listen for events and forward to renderer
    gitWatcher.on("file-change", (event) => {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send("file-changed", { projectPath, ...event });
      });
    });

    gitWatcher.on("new-commit", (commit) => {
      // Auto-log commit as activity
      this.logActivity(projectPath, "commit", commit.message, commit);
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send("new-commit", { projectPath, ...commit });
      });
    });

    gitWatcher.on("pulled", (info) => {
      // New commits arrived via auto-pull — refresh AGENTS.md and notify UI
      this.updateAgentsFile(projectPath).catch(() => {});
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send("project-pulled", { projectPath, ...info });
      });
    });

    // Setup snapshot manager and parse plan if exists
    const snapshotManager = new SnapshotManager(projectPath);
    snapshotManager.parsePlanFile();

    this.projects.set(projectPath, { path: projectPath, name, gitWatcher, snapshotManager, db });

    // Save to projects list
    this.saveProjectsList(projectPath);

    // Generate/update AGENTS.md immediately
    this.updateAgentsFile(projectPath).catch(() => {});

    const gitStatus = await gitWatcher.getStatus();

    return {
      path: projectPath,
      name,
      stack,
      lastActivity: new Date().toISOString(),
      decisionCount: this.countRows(db, "decisions", projectPath),
      phaseCount: snapshotManager.getPhases().length,
      gitBranch: gitStatus.branch,
    };
  }

  getProjects(): ProjectInfo[] {
    const saved = this.loadProjectsList();
    return saved.map((p) => ({
      path: p.path,
      name: p.displayName || p.name,
      displayName: p.displayName || p.name,
      stack: {},
      lastActivity: p.lastOpened,
      decisionCount: 0,
      phaseCount: 0,
      gitBranch: "—",
    }));
  }

  async getProjectState(projectPath: string): Promise<any> {
    const db = await this.getDb(projectPath);
    const project = this.projects.get(projectPath);

    const stack = this.detectStack(projectPath);
    const gitWatcher = project?.gitWatcher || new GitWatcher(projectPath);
    const gitStatus = await gitWatcher.getStatus();
    const snapshotManager = project?.snapshotManager || new SnapshotManager(projectPath);

    const [decisions, notes] = await Promise.all([
      this.getDecisions(projectPath),
      this.getNotes(projectPath),
    ]);

    return {
      stack: JSON.parse(JSON.stringify(stack)),
      git: JSON.parse(JSON.stringify(gitStatus)),
      decisions: JSON.parse(JSON.stringify(decisions)),
      notes: JSON.parse(JSON.stringify(notes)),
      phases: JSON.parse(JSON.stringify(snapshotManager.getPhases())),
      snapshots: JSON.parse(JSON.stringify(snapshotManager.getSnapshots())),
      activity: JSON.parse(JSON.stringify(this.getRecentActivity(db, projectPath))),
    };
  }

  removeProject(projectPath: string): void {
    const project = this.projects.get(projectPath);
    if (project) {
      project.gitWatcher.stop();
      this.projects.delete(projectPath);
    }
    this.removeFromProjectsList(projectPath);
  }

  // === Decisions ===

  async addDecision(projectPath: string, decision: any): Promise<any> {
    const db = await this.getDb(projectPath);
    const projectId = this.getProjectId(db, projectPath);
    if (!projectId) return null;

    const id = randomUUID();
    const now = new Date().toISOString();

    db.run(
      `INSERT INTO decisions (id, project_id, timestamp, title, description, reasoning, category, tags_json, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [id, projectId, now, decision.title, decision.description, decision.reasoning || null, decision.category || "other", JSON.stringify(decision.tags || [])]
    );

    this.logActivity(projectPath, "decision", `Decision: ${decision.title}`, decision);
    this.saveDbs(projectPath);
    this.updateAgentsFile(projectPath).catch(() => {});

    return { id, ...decision, timestamp: now, status: "active" };
  }

  async getDecisions(projectPath: string): Promise<any[]> {
    const db = await this.getDb(projectPath);
    const projectId = this.getProjectId(db, projectPath);
    if (!projectId) return [];

    const result = db.exec(
      "SELECT * FROM decisions WHERE project_id = ? ORDER BY timestamp DESC",
      [projectId]
    );

    if (result.length === 0) return [];
    return result[0].values.map((row: any[]) => ({
      id: row[0],
      projectId: row[1],
      timestamp: row[2],
      title: row[3],
      description: row[4],
      reasoning: row[5],
      category: row[6],
      tags: JSON.parse(row[7] || "[]"),
      status: row[8],
    }));
  }

  // === Notes ===

  async addNote(projectPath: string, content: string): Promise<string> {
    const db = await this.getDb(projectPath);
    const projectId = this.getProjectId(db, projectPath);
    if (!projectId) return "";

    const id = randomUUID();
    const now = new Date().toISOString();

    db.run(
      "INSERT INTO notes (id, project_id, timestamp, content) VALUES (?, ?, ?, ?)",
      [id, projectId, now, content]
    );

    this.saveDbs(projectPath);
    this.updateAgentsFile(projectPath).catch(() => {});
    return id;
  }

  async getNotes(projectPath: string): Promise<any[]> {
    const db = await this.getDb(projectPath);
    const projectId = this.getProjectId(db, projectPath);
    if (!projectId) return [];

    const result = db.exec(
      "SELECT * FROM notes WHERE project_id = ? ORDER BY timestamp DESC",
      [projectId]
    );

    if (result.length === 0) return [];
    return result[0].values.map((row: any[]) => ({
      id: row[0],
      timestamp: row[2],
      content: row[3],
    }));
  }

  // === Phases & Snapshots ===

  async getPhases(projectPath: string): Promise<any[]> {
    const project = this.projects.get(projectPath);
    const sm = project?.snapshotManager || new SnapshotManager(projectPath);
    const phases = sm.getPhases();
    return phases.length > 0 ? phases : sm.parsePlanFile();
  }

  async completePhase(projectPath: string, phaseId: string): Promise<any> {
    const project = this.projects.get(projectPath);
    const sm = project?.snapshotManager || new SnapshotManager(projectPath);
    const phase = await sm.completePhase(phaseId);
    if (phase) {
      this.logActivity(projectPath, "phase-complete", `Completed: ${phase.title}`, phase);
      this.updateAgentsFile(projectPath).catch(() => {});
    }
    return phase;
  }

  async rollbackToPhase(projectPath: string, phaseId: string): Promise<boolean> {
    const project = this.projects.get(projectPath);
    const sm = project?.snapshotManager || new SnapshotManager(projectPath);
    return sm.rollbackToPhase(phaseId);
  }

  async createSnapshot(projectPath: string, label: string): Promise<any> {
    const project = this.projects.get(projectPath);
    const sm = project?.snapshotManager || new SnapshotManager(projectPath);
    return sm.createSnapshot(label);
  }

  async getSnapshots(projectPath: string): Promise<any[]> {
    const project = this.projects.get(projectPath);
    const sm = project?.snapshotManager || new SnapshotManager(projectPath);
    return sm.getSnapshots();
  }

  async restoreSnapshot(projectPath: string, snapshotId: string): Promise<boolean> {
    const project = this.projects.get(projectPath);
    const sm = project?.snapshotManager || new SnapshotManager(projectPath);
    return sm.restoreSnapshot(snapshotId);
  }

  // === Export ===

  async exportContext(projectPath: string, target: string): Promise<{ files: string[] }> {
    const state = await this.getProjectState(projectPath);
    const name = path.basename(projectPath);
    const now = new Date().toLocaleString("sv-SE");
    const decisions: any[] = state.decisions || [];
    const phases: any[] = state.phases || [];
    const notes: any[] = state.notes || [];
    const stack = state.stack || {};
    const git = state.git || {};

    const stackSummary = [
      stack.framework && `Framework: ${stack.framework}`,
      stack.language && `Language: ${stack.language}`,
      stack.packageManager && `Package manager: ${stack.packageManager}`,
      stack.hasTypescript && `TypeScript: yes`,
      stack.database && `Database: ${stack.database}`,
      stack.css && `CSS: ${stack.css}`,
    ].filter(Boolean).join("\n");

    const decisionsBlock = decisions.length > 0
      ? decisions.map((d: any) =>
          `### ${d.title}\n${d.description}${d.reasoning ? `\n**Why:** ${d.reasoning}` : ""}`
        ).join("\n\n")
      : "No decisions logged yet.";

    const phasesBlock = phases.length > 0
      ? phases.map((p: any) =>
          `- [${p.completedAt ? "x" : " "}] ${p.title}${p.description ? ` — ${p.description}` : ""}`
        ).join("\n")
      : "No phases defined yet.";

    const notesBlock = notes.length > 0
      ? notes.slice(0, 10).map((n: any) => `- ${n.content}`).join("\n")
      : "";

    const gitBlock = git.current
      ? `Branch: ${git.current} (${git.ahead || 0} ahead, ${git.behind || 0} behind)`
      : "";

    let content = "";
    let filename = "";

    if (target === "claude-code") {
      filename = "CLAUDE.md";
      content = `# ${name} — Project Context for Claude

> Generated by Anchor on ${now}

## What this project is
${name} — a vibecoded project. Use this file as your primary context source.

## Tech Stack
${stackSummary || "Auto-detected stack info not available."}

## Current Git State
${gitBlock || "Not a git repo or no git info available."}

## Build Phases
${phasesBlock}

## Key Technical Decisions
${decisionsBlock}

${notesBlock ? `## Notes\n${notesBlock}` : ""}

## Working with this project
- Always read this file first before making changes
- Respect the decisions above — don't swap out libraries without good reason
- Keep the phase list updated as you complete work
- This file is auto-maintained by Anchor — do not delete it
`;
    } else if (target === "cursor") {
      filename = ".cursorrules";
      content = `# Cursor Rules — ${name}
# Generated by Anchor on ${now}

## Project
${name}

## Stack
${stackSummary || "See package.json"}

## Key Decisions (respect these)
${decisions.map((d: any) => `- ${d.title}: ${d.description}`).join("\n") || "None logged yet."}

## Phases
${phasesBlock}

## Rules
- Follow the tech stack above — do not introduce new frameworks
- Preserve existing patterns and conventions
- When fixing bugs, explain the root cause in comments
- Keep changes minimal and focused
${notesBlock ? `\n## Notes\n${notesBlock}` : ""}
`;
    } else if (target === "windsurf") {
      filename = ".windsurfrules";
      content = `# Windsurf Rules — ${name}
# Generated by Anchor on ${now}

## Project: ${name}
## Stack: ${stackSummary || "See package.json"}

## Decisions
${decisions.map((d: any) => `- ${d.title}: ${d.description}`).join("\n") || "None logged yet."}

## Current Phase
${phases.find((p: any) => !p.completedAt)?.title || "See phase list"}

## Rules
- Respect all decisions listed above
- Keep changes scoped — no large rewrites without asking
- Use existing patterns in the codebase
`;
    } else if (target === "lovable") {
      filename = "ANCHOR_CONTEXT.md";
      content = `# Project Context — ${name}
> Paste this into Lovable's chat to give it full project context.
> Generated by Anchor on ${now}

## Project
${name}

## Tech Stack
${stackSummary || "See package.json"}

## What's been built (phases)
${phasesBlock}

## Important technical decisions
${decisionsBlock}

## Current git state
${gitBlock || "n/a"}

${notesBlock ? `## Notes & known issues\n${notesBlock}` : ""}

---
Please read the above context carefully before making any changes.
Respect all decisions that have been made, and continue from the current phase state.
`;
    } else {
      // Generic markdown
      filename = "PROJECT-CONTEXT.md";
      content = `# ${name} — Project Context
Generated by Anchor on ${now}

## Stack
${stackSummary || "See package.json"}

## Phases
${phasesBlock}

## Decisions
${decisionsBlock}

${gitBlock ? `## Git\n${gitBlock}` : ""}
${notesBlock ? `\n## Notes\n${notesBlock}` : ""}
`;
    }

    const fullPath = path.join(projectPath, filename);
    fs.writeFileSync(fullPath, content);
    this.logActivity(projectPath, "export", `Exported to ${target}`, { target, files: [filename] });
    return { files: [filename] };
  }

  async exportAll(projectPath: string): Promise<{ files: string[] }> {
    const targets = ["claude-code", "cursor", "windsurf", "lovable", "markdown"];
    const allFiles: string[] = [];
    for (const target of targets) {
      const result = await this.exportContext(projectPath, target);
      allFiles.push(...result.files);
    }
    return { files: allFiles };
  }

  // === Git ===

  async getGitLog(projectPath: string): Promise<any[]> {
    const project = this.projects.get(projectPath);
    const gw = project?.gitWatcher || new GitWatcher(projectPath);
    return gw.getLog();
  }

  async getGitStatus(projectPath: string): Promise<any> {
    const project = this.projects.get(projectPath);
    const gw = project?.gitWatcher || new GitWatcher(projectPath);
    return gw.getStatus();
  }

  // === Portability Report ===

  async getPortabilityReport(projectPath: string): Promise<any> {
    const stack = this.detectStack(projectPath);
    const pkgPath = path.join(projectPath, "package.json");

    let deps: Record<string, string> = {};
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        deps = { ...pkg.dependencies, ...pkg.devDependencies };
      } catch {}
    }

    // Analyze vendor lock-in
    const vendorLockIn: { dependency: string; vendor: string; risk: "high" | "medium" | "low"; alternative: string }[] = [];

    const lockInMap: Record<string, { vendor: string; risk: "high" | "medium" | "low"; alternative: string }> = {
      "@vercel/analytics": { vendor: "Vercel", risk: "medium", alternative: "Plausible, PostHog" },
      "@vercel/kv": { vendor: "Vercel", risk: "high", alternative: "Upstash, Redis Cloud" },
      "@vercel/blob": { vendor: "Vercel", risk: "high", alternative: "AWS S3, Cloudflare R2" },
      "@vercel/edge": { vendor: "Vercel", risk: "medium", alternative: "Cloudflare Workers" },
      "@supabase/supabase-js": { vendor: "Supabase", risk: "medium", alternative: "Self-hosted Supabase, Firebase" },
      "firebase": { vendor: "Google", risk: "high", alternative: "Supabase, Appwrite" },
      "@aws-sdk/client-s3": { vendor: "AWS", risk: "low", alternative: "S3-compatible: Cloudflare R2, MinIO" },
      "@clerk/nextjs": { vendor: "Clerk", risk: "medium", alternative: "Auth.js, Lucia" },
      "@auth0/nextjs-auth0": { vendor: "Auth0", risk: "medium", alternative: "Auth.js, Clerk" },
      "@planetscale/database": { vendor: "PlanetScale", risk: "high", alternative: "Neon, Turso, self-hosted MySQL" },
      "convex": { vendor: "Convex", risk: "high", alternative: "Supabase, Firebase" },
    };

    for (const [dep, info] of Object.entries(lockInMap)) {
      if (deps[dep]) {
        vendorLockIn.push({ dependency: dep, ...info });
      }
    }

    // Calculate portability score (100 = fully portable, 0 = completely locked in)
    const totalDeps = Object.keys(deps).length || 1;
    const highRisk = vendorLockIn.filter((v) => v.risk === "high").length;
    const mediumRisk = vendorLockIn.filter((v) => v.risk === "medium").length;
    const lockInScore = (highRisk * 15 + mediumRisk * 5);
    const portabilityScore = Math.max(0, Math.min(100, 100 - lockInScore));

    return {
      score: portabilityScore,
      totalDependencies: totalDeps,
      vendorLockIn,
      summary: portabilityScore >= 80
        ? "Your project is highly portable. Low vendor lock-in risk."
        : portabilityScore >= 50
        ? "Moderate vendor dependencies detected. Consider alternatives for high-risk items."
        : "Significant vendor lock-in detected. Several dependencies tie you to specific platforms.",
      recommendations: vendorLockIn
        .filter((v) => v.risk === "high")
        .map((v) => `Consider replacing ${v.dependency} (${v.vendor}) with ${v.alternative}`),
    };
  }

  // === Cleanup ===

  cleanup(): void {
    for (const project of this.projects.values()) {
      project.gitWatcher.stop();
    }
    this.projects.clear();
  }

  // === Private helpers ===

  async writeVisionSection(projectPath: string, visionSection: string): Promise<void> {
    const agentsPath = path.join(projectPath, "AGENTS.md");
    let content = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, "utf-8") : "";

    // Replace existing vision section if present, otherwise insert after first H1
    if (content.includes("## Product Vision") || content.includes("## What this project is")) {
      content = content.replace(/## (Product Vision|What this project is)[\s\S]*?(?=\n## |\n---|\n_Generated|$)/, visionSection);
    } else {
      // Insert after first H1 block
      const firstSectionIdx = content.indexOf("\n## ");
      if (firstSectionIdx !== -1) {
        content = content.slice(0, firstSectionIdx) + "\n" + visionSection + content.slice(firstSectionIdx);
      } else {
        content = visionSection + content;
      }
    }

    fs.writeFileSync(agentsPath, content);
    this.logActivity(projectPath, "vision", "Product vision written to AGENTS.md", {});
  }

  async updateAgentsFile(projectPath: string): Promise<void> {
    const state = await this.getProjectState(projectPath);
    // Use displayName if set, otherwise fall back to folder name
    const savedProjects = this.loadProjectsList();
    const saved = savedProjects.find((p) => p.path === projectPath);
    const name = saved?.displayName || saved?.name || this.detectProjectName(projectPath);
    const now = new Date().toLocaleString("sv-SE");
    const decisions: any[] = state.decisions || [];
    const phases: any[] = state.phases || [];
    const notes: any[] = state.notes || [];
    const stack = state.stack || {};
    const git = state.git || {};

    const stackLines = [
      ...(stack.frameworks || []).map((f: string) => `- Framework: ${f}`),
      ...(stack.languages || []).map((l: string) => `- Language: ${l}`),
      ...(stack.buildTools || []).map((b: string) => `- Build: ${b}`),
      ...(stack.databases || []).map((d: string) => `- Database: ${d}`),
    ].join("\n") || "- Auto-detection in progress";

    const completedPhases = phases.filter((p: any) => p.completedAt);
    const activePhase = phases.find((p: any) => !p.completedAt);
    const pendingPhases = phases.filter((p: any) => !p.completedAt);

    const phasesBlock = phases.length > 0
      ? phases.map((p: any) =>
          `- [${p.completedAt ? "x" : " "}] **${p.title}**${p.description ? ` — ${p.description}` : ""}${p.completedAt ? ` _(done ${new Date(p.completedAt).toLocaleDateString("sv-SE")})_` : ""}`
        ).join("\n")
      : "- No phases defined yet — add them in Anchor";

    const decisionsBlock = decisions.length > 0
      ? decisions.map((d: any) =>
          `### ${d.title}\n${d.description}${d.reasoning ? `\n> **Why:** ${d.reasoning}` : ""}${d.category !== "other" ? `\n> _Category: ${d.category}_` : ""}`
        ).join("\n\n")
      : "_No decisions logged yet. Log them in Anchor as you make them._";

    const notesBlock = notes.length > 0
      ? notes.slice(0, 15).map((n: any) => `- ${n.content}`).join("\n")
      : "";

    const gitLine = git.current
      ? `**Branch:** \`${git.current}\` · ${git.ahead || 0} ahead · ${git.behind || 0} behind`
      : "";

    const currentStateBlock = [
      activePhase ? `**Currently working on:** ${activePhase.title}` : "**All phases complete** ✓",
      `**Completed phases:** ${completedPhases.length}/${phases.length}`,
      `**Decisions logged:** ${decisions.length}`,
      gitLine,
    ].filter(Boolean).join("\n");

    const content = `# AGENTS.md — ${name}

> This file is maintained automatically by [Anchor](https://bringthecode.dev).
> It is the single source of truth for this project's context.
> Last updated: ${now}
>
> **For all AI tools:** Read this file before making any changes.
> Respect all decisions below. Continue from the current phase state.

---

## What this project is

${name}

⚠️ **Vision not set.** Run the Vision Interview in Anchor to give AI tools proper context about what this product is, who it's for, and what it should feel like. Without this, AI tools are working blind.

---

## Current State

${currentStateBlock}

---

## Tech Stack

${stackLines}

---

## Build Phases

${phasesBlock}

---

## Key Technical Decisions

${decisionsBlock}

---

## Tool-Specific Instructions

### Lovable
- Read the decisions above before generating code
- Continue from the current phase: **${activePhase?.title || "all phases complete"}**
- Do not switch out libraries or patterns without flagging it
- Keep changes minimal and scoped to the current phase

### Claude Code / Anchor Editor
- Full project context is loaded — no need to re-explain the stack
- Prefer surgical fixes over rewrites
- Always update AGENTS.md via Anchor after significant changes

### Cursor / Windsurf
- Use \`.cursorrules\` / \`.windsurfrules\` if present, but treat AGENTS.md as the primary source
- Follow the decisions above strictly
- Ask before introducing new dependencies

### Bolt / v0 / other tools
- This project uses ${(stack.frameworks || ["the stack above"])[0]}
- Paste relevant sections of this file into the tool's context window
- Do not change the tech stack without updating the decisions section

---

## Known Issues & Notes

${notesBlock || "_No notes yet. Add them in Anchor._"}

---

## Git History Summary

_Auto-populated by Anchor on next sync._

---

_Generated by Anchor · [bringthecode.dev](https://bringthecode.dev)_
`;

    const agentsPath = path.join(projectPath, "AGENTS.md");
    fs.writeFileSync(agentsPath, content);
  }

  private detectStack(projectPath: string): any {
    const stack: any = { languages: [], frameworks: [], buildTools: [], databases: [] };
    const pkgPath = path.join(projectPath, "package.json");

    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

        const fwMap: Record<string, string> = {
          react: "React", next: "Next.js", vue: "Vue", nuxt: "Nuxt",
          svelte: "Svelte", express: "Express", fastify: "Fastify",
          hono: "Hono", astro: "Astro", remix: "Remix",
          "react-native": "React Native", angular: "Angular",
        };
        const buildMap: Record<string, string> = {
          vite: "Vite", webpack: "Webpack", esbuild: "esbuild",
          turbo: "Turborepo", tsup: "tsup",
        };
        const dbMap: Record<string, string> = {
          prisma: "Prisma", "drizzle-orm": "Drizzle", mongoose: "MongoDB",
          pg: "PostgreSQL", "better-sqlite3": "SQLite", "sql.js": "SQLite",
        };

        for (const [dep, name] of Object.entries(fwMap)) {
          if (allDeps[dep]) stack.frameworks.push(name);
        }
        for (const [dep, name] of Object.entries(buildMap)) {
          if (allDeps[dep]) stack.buildTools.push(name);
        }
        for (const [dep, name] of Object.entries(dbMap)) {
          if (allDeps[dep] && !stack.databases.includes(name)) stack.databases.push(name);
        }

        if (allDeps.typescript) stack.languages.push("TypeScript");
        stack.languages.push("JavaScript");
      } catch {}
    }

    if (fs.existsSync(path.join(projectPath, "requirements.txt"))) {
      stack.languages.push("Python");
    }

    return stack;
  }

  private detectProjectName(projectPath: string): string {
    const pkgPath = path.join(projectPath, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        return JSON.parse(fs.readFileSync(pkgPath, "utf-8")).name || path.basename(projectPath);
      } catch {}
    }
    return path.basename(projectPath);
  }

  private getProjectId(db: any, projectPath: string): string | null {
    const result = db.exec("SELECT id FROM projects WHERE path = ?", [projectPath]);
    if (result.length === 0 || result[0].values.length === 0) return null;
    return result[0].values[0][0] as string;
  }

  private countRows(db: any, table: string, projectPath: string): number {
    const projectId = this.getProjectId(db, projectPath);
    if (!projectId) return 0;
    const result = db.exec(`SELECT COUNT(*) FROM ${table} WHERE project_id = ?`, [projectId]);
    return result.length > 0 ? (result[0].values[0][0] as number) : 0;
  }

  private async logActivity(projectPath: string, type: string, summary: string, details: any = {}): Promise<void> {
    try {
      const db = await this.getDb(projectPath);
      const projectId = this.getProjectId(db, projectPath);
      if (!projectId) return;
      const id = randomUUID();
      const now = new Date().toISOString();
      db.run(
        "INSERT INTO activity_log (id, project_id, timestamp, type, summary, details_json) VALUES (?, ?, ?, ?, ?, ?)",
        [id, projectId, now, type, summary, JSON.stringify(details)]
      );
      this.saveDbs(projectPath);
    } catch {}
  }

  private getRecentActivity(db: any, projectPath: string): any[] {
    const projectId = this.getProjectId(db, projectPath);
    if (!projectId) return [];
    const result = db.exec(
      "SELECT * FROM activity_log WHERE project_id = ? ORDER BY timestamp DESC LIMIT 50",
      [projectId]
    );
    if (result.length === 0) return [];
    return result[0].values.map((row: any[]) => ({
      id: row[0],
      timestamp: row[2],
      type: row[3],
      summary: row[4],
      details: JSON.parse(row[5] || "{}"),
    }));
  }


  private loadProjectsList(): Array<{ path: string; name: string; displayName?: string; lastOpened: string }> {
    if (!fs.existsSync(PROJECTS_FILE)) return [];
    try {
      return JSON.parse(fs.readFileSync(PROJECTS_FILE, "utf-8"));
    } catch {
      return [];
    }
  }

  private saveProjectsList(projectPath: string, displayName?: string): void {
    const list = this.loadProjectsList();
    const existing = list.find((p) => p.path === projectPath);
    if (existing) {
      existing.lastOpened = new Date().toISOString();
      if (displayName) existing.displayName = displayName;
    } else {
      list.push({
        path: projectPath,
        name: this.detectProjectName(projectPath),
        displayName: displayName,
        lastOpened: new Date().toISOString(),
      });
    }
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(list, null, 2));
  }

  private removeFromProjectsList(projectPath: string): void {
    const list = this.loadProjectsList().filter((p) => p.path !== projectPath);
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(list, null, 2));
  }

  renameProject(projectPath: string, newName: string): { path: string; name: string } {
    const list = this.loadProjectsList();
    const existing = list.find((p) => p.path === projectPath);
    if (existing) {
      existing.displayName = newName;
      fs.writeFileSync(PROJECTS_FILE, JSON.stringify(list, null, 2));
    }
    const project = this.projects.get(projectPath);
    if (project) project.name = newName;
    // Regenerate AGENTS.md with new name
    this.updateAgentsFile(projectPath).catch(() => {});
    return { path: projectPath, name: newName };
  }
}
