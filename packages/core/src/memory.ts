import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import type { Decision, AnchorProject, DecisionCategory } from "./types.js";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    description TEXT,
    stack_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS decisions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    reasoning TEXT,
    category TEXT NOT NULL DEFAULT 'other',
    tags_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'active',
    superseded_by TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id)
  );

  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    content TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id)
  );

  CREATE INDEX IF NOT EXISTS idx_decisions_project ON decisions(project_id);
  CREATE INDEX IF NOT EXISTS idx_decisions_category ON decisions(category);
  CREATE INDEX IF NOT EXISTS idx_notes_project ON notes(project_id);
`;

export class ProjectMemory {
  private db!: SqlJsDatabase;
  private dbPath: string;
  private initPromise: Promise<void>;

  constructor(anchorDir: string) {
    this.dbPath = path.join(anchorDir, "memory.db");
    fs.mkdirSync(anchorDir, { recursive: true });
    this.initPromise = this.init();
  }

  private async init(): Promise<void> {
    const SQL = await initSqlJs();
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }
    this.db.run("PRAGMA foreign_keys = ON;");
    this.db.run(SCHEMA);
    this.save();
  }

  async ensureReady(): Promise<void> {
    await this.initPromise;
  }

  private save(): void {
    const data = this.db.export();
    fs.writeFileSync(this.dbPath, Buffer.from(data));
  }

  private rowToProject(row: any): AnchorProject {
    return {
      id: String(row.id),
      name: String(row.name),
      path: String(row.path),
      description: row.description ? String(row.description) : undefined,
      stack: JSON.parse(String(row.stack_json)),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  createProject(project: Omit<AnchorProject, "id" | "createdAt" | "updatedAt">): AnchorProject {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const full: AnchorProject = { ...project, id, createdAt: now, updatedAt: now };
    this.db.run(
      `INSERT INTO projects (id, name, path, description, stack_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, full.name, full.path, full.description ?? null, JSON.stringify(full.stack), now, now]
    );
    this.save();
    return full;
  }

  getProject(projectPath: string): AnchorProject | undefined {
    const stmt = this.db.prepare("SELECT * FROM projects WHERE path = ?");
    stmt.bind([projectPath]);
    if (!stmt.step()) { stmt.free(); return undefined; }
    const row = stmt.getAsObject();
    stmt.free();
    return this.rowToProject(row);
  }

  getProjectById(id: string): AnchorProject | undefined {
    const stmt = this.db.prepare("SELECT * FROM projects WHERE id = ?");
    stmt.bind([id]);
    if (!stmt.step()) { stmt.free(); return undefined; }
    const row = stmt.getAsObject();
    stmt.free();
    return this.rowToProject(row);
  }

  listProjects(): AnchorProject[] {
    const results: AnchorProject[] = [];
    const stmt = this.db.prepare("SELECT * FROM projects ORDER BY updated_at DESC");
    while (stmt.step()) {
      results.push(this.rowToProject(stmt.getAsObject()));
    }
    stmt.free();
    return results;
  }

  updateProjectStack(projectPath: string, stack: any): void {
    const now = new Date().toISOString();
    this.db.run("UPDATE projects SET stack_json = ?, updated_at = ? WHERE path = ?", [JSON.stringify(stack), now, projectPath]);
    this.save();
  }

  addDecision(projectId: string, decision: Omit<Decision, "id" | "projectId" | "timestamp" | "status">): Decision {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const full: Decision = { ...decision, id, projectId, timestamp: now, status: "active" };
    this.db.run(
      `INSERT INTO decisions (id, project_id, timestamp, title, description, reasoning, category, tags_json, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, projectId, now, full.title, full.description, full.reasoning ?? null, full.category, JSON.stringify(full.tags), full.status]
    );
    this.db.run("UPDATE projects SET updated_at = ? WHERE id = ?", [now, projectId]);
    this.save();
    return full;
  }

  getDecisions(projectId: string, category?: DecisionCategory): Decision[] {
    let query = "SELECT * FROM decisions WHERE project_id = ?";
    const params: any[] = [projectId];
    if (category) { query += " AND category = ?"; params.push(category); }
    query += " ORDER BY timestamp DESC";
    const results: Decision[] = [];
    const stmt = this.db.prepare(query);
    stmt.bind(params);
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push({
        id: String(row.id),
        projectId: String(row.project_id),
        timestamp: String(row.timestamp),
        title: String(row.title),
        description: String(row.description),
        reasoning: row.reasoning ? String(row.reasoning) : undefined,
        category: String(row.category) as DecisionCategory,
        tags: JSON.parse(String(row.tags_json)),
        status: String(row.status) as any,
        supersededBy: row.superseded_by ? String(row.superseded_by) : undefined,
      });
    }
    stmt.free();
    return results;
  }

  supersedeDecision(decisionId: string, newDecisionId: string): void {
    this.db.run("UPDATE decisions SET status = 'superseded', superseded_by = ? WHERE id = ?", [newDecisionId, decisionId]);
    this.save();
  }

  addNote(projectId: string, content: string): string {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.db.run("INSERT INTO notes (id, project_id, timestamp, content) VALUES (?, ?, ?, ?)", [id, projectId, now, content]);
    this.db.run("UPDATE projects SET updated_at = ? WHERE id = ?", [now, projectId]);
    this.save();
    return id;
  }

  getNotes(projectId: string): Array<{ id: string; timestamp: string; content: string }> {
    const results: any[] = [];
    const stmt = this.db.prepare("SELECT * FROM notes WHERE project_id = ? ORDER BY timestamp DESC");
    stmt.bind([projectId]);
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push({ id: String(row.id), timestamp: String(row.timestamp), content: String(row.content) });
    }
    stmt.free();
    return results;
  }

  close(): void {
    this.save();
    this.db.close();
  }
}
