import fs from "fs";
import path from "path";
import { BrowserWindow } from "electron";
import { GitWatcher } from "./git-watcher";
import { SnapshotManager } from "./snapshot-manager";

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
    // Detect stack
    const stack = this.detectStack(projectPath);
    const name = this.detectProjectName(projectPath);

    // Initialize anchor dir
    const anchorDir = path.join(projectPath, ".anchor");
    fs.mkdirSync(anchorDir, { recursive: true });

    // Setup database
    const db = await this.getDb(projectPath);

    // Ensure project exists in DB
    const existing = db.exec("SELECT id FROM projects WHERE path = ?", [projectPath]);
    if (existing.length === 0 || existing[0].values.length === 0) {
      const id = crypto.randomUUID();
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

    // Setup snapshot manager and parse plan if exists
    const snapshotManager = new SnapshotManager(projectPath);
    snapshotManager.parsePlanFile();

    this.projects.set(projectPath, { path: projectPath, name, gitWatcher, snapshotManager, db });

    // Save to projects list
    this.saveProjectsList(projectPath);

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
      name: p.name,
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

    return {
      stack,
      git: gitStatus,
      decisions: this.getDecisions(projectPath),
      notes: this.getNotes(projectPath),
      phases: snapshotManager.getPhases(),
      snapshots: snapshotManager.getSnapshots(),
      activity: this.getRecentActivity(db, projectPath),
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

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.run(
      `INSERT INTO decisions (id, project_id, timestamp, title, description, reasoning, category, tags_json, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [id, projectId, now, decision.title, decision.description, decision.reasoning || null, decision.category || "other", JSON.stringify(decision.tags || [])]
    );

    this.logActivity(projectPath, "decision", `Decision: ${decision.title}`, decision);
    this.saveDbs(projectPath);

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

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.run(
      "INSERT INTO notes (id, project_id, timestamp, content) VALUES (?, ?, ?, ?)",
      [id, projectId, now, content]
    );

    this.saveDbs(projectPath);
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
    // Build context snapshot
    const state = await this.getProjectState(projectPath);
    const snapshot = this.buildExportSnapshot(projectPath, state);

    // Use exporters
    const { getExporter } = require("@bringthecode/exporters");
    const exporter = getExporter(target);
    if (!exporter) return { files: [] };

    const files = exporter.export(snapshot);
    const written: string[] = [];

    for (const file of files) {
      const fullPath = path.join(projectPath, file.path);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fullPath, file.content);
      written.push(file.path);
    }

    this.logActivity(projectPath, "export", `Exported to ${target}`, { target, files: written });
    return { files: written };
  }

  async exportAll(projectPath: string): Promise<{ files: string[] }> {
    const { getExporterNames } = require("@bringthecode/exporters");
    const allFiles: string[] = [];
    for (const target of getExporterNames()) {
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
      const id = crypto.randomUUID();
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

  private buildExportSnapshot(projectPath: string, state: any): any {
    return {
      projectId: "local",
      timestamp: new Date().toISOString(),
      summary: `Project at ${path.basename(projectPath)}`,
      fileTree: [],
      decisions: state.decisions || [],
      stack: state.stack || {},
      dependencies: {},
      gitInfo: state.git || undefined,
      notes: (state.notes || []).map((n: any) => n.content),
    };
  }

  private loadProjectsList(): Array<{ path: string; name: string; lastOpened: string }> {
    if (!fs.existsSync(PROJECTS_FILE)) return [];
    try {
      return JSON.parse(fs.readFileSync(PROJECTS_FILE, "utf-8"));
    } catch {
      return [];
    }
  }

  private saveProjectsList(projectPath: string): void {
    const list = this.loadProjectsList();
    const existing = list.find((p) => p.path === projectPath);
    if (existing) {
      existing.lastOpened = new Date().toISOString();
    } else {
      list.push({
        path: projectPath,
        name: this.detectProjectName(projectPath),
        lastOpened: new Date().toISOString(),
      });
    }
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(list, null, 2));
  }

  private removeFromProjectsList(projectPath: string): void {
    const list = this.loadProjectsList().filter((p) => p.path !== projectPath);
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(list, null, 2));
  }
}
