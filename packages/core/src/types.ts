// === Anchor Core Types ===

export interface AnchorProject {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  updatedAt: string;
  stack: TechStack;
  description?: string;
}

export interface TechStack {
  languages: string[];
  frameworks: string[];
  buildTools: string[];
  databases: string[];
  runtime?: string;
  packageManager?: string;
}

export interface Decision {
  id: string;
  projectId: string;
  timestamp: string;
  title: string;
  description: string;
  reasoning?: string;
  category: DecisionCategory;
  tags: string[];
  status: "active" | "superseded" | "reverted";
  supersededBy?: string;
}

export type DecisionCategory =
  | "architecture"
  | "technology"
  | "design"
  | "api"
  | "database"
  | "deployment"
  | "security"
  | "performance"
  | "refactor"
  | "other";

export interface ContextSnapshot {
  projectId: string;
  timestamp: string;
  summary: string;
  fileTree: FileNode[];
  decisions: Decision[];
  stack: TechStack;
  dependencies: Record<string, string>;
  gitInfo?: GitInfo;
  notes: string[];
}

export interface FileNode {
  path: string;
  type: "file" | "directory";
  size?: number;
  children?: FileNode[];
}

export interface GitInfo {
  branch: string;
  lastCommit: string;
  lastCommitMessage: string;
  remoteUrl?: string;
  uncommittedChanges: number;
}

export interface ExportTarget {
  name: string;
  format: "cursor" | "claude-code" | "windsurf" | "markdown" | "json";
}

export interface ExportResult {
  target: ExportTarget;
  files: ExportedFile[];
  timestamp: string;
}

export interface ExportedFile {
  path: string;
  content: string;
}

export interface AnchorConfig {
  version: string;
  projectName: string;
  watchPaths: string[];
  ignorePaths: string[];
  autoSync: boolean;
  defaultExportTarget?: string;
}
