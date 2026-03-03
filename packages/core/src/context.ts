import fs from "fs";
import path from "path";
import type { ContextSnapshot } from "./types.js";
import { ProjectMemory } from "./memory.js";
import { detectStack } from "./stack-detector.js";
import { scanFileTree } from "./file-tree.js";
import { readGitInfo } from "./git-info.js";

export async function buildContextSnapshot(
  projectPath: string,
  memory: ProjectMemory
): Promise<ContextSnapshot> {
  const project = memory.getProject(projectPath);
  if (!project) {
    throw new Error(`Project not initialized at ${projectPath}. Run 'anchor init' first.`);
  }

  const stack = await detectStack(projectPath);
  const fileTree = scanFileTree(projectPath);
  const decisions = memory.getDecisions(project.id);
  const notes = memory.getNotes(project.id);
  const gitInfo = readGitInfo(projectPath);

  // Read dependencies from package.json if present
  let dependencies: Record<string, string> = {};
  const pkgPath = path.join(projectPath, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
    } catch {
      // Skip if can't parse
    }
  }

  // Also check requirements.txt for Python projects
  const reqPath = path.join(projectPath, "requirements.txt");
  if (fs.existsSync(reqPath)) {
    try {
      const lines = fs.readFileSync(reqPath, "utf-8").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const [name, version] = trimmed.split(/[>=<~!]+/);
          dependencies[name.trim()] = version?.trim() || "*";
        }
      }
    } catch {
      // Skip
    }
  }

  // Update stack in memory
  memory.updateProjectStack(projectPath, stack);

  return {
    projectId: project.id,
    timestamp: new Date().toISOString(),
    summary: generateSummary(project.name, stack, decisions.length, gitInfo),
    fileTree,
    decisions: decisions.filter((d) => d.status === "active"),
    stack,
    dependencies,
    gitInfo,
    notes: notes.map((n) => n.content),
  };
}

function generateSummary(
  name: string,
  stack: any,
  decisionCount: number,
  gitInfo: any
): string {
  const parts = [`Project: ${name}`];

  if (stack.frameworks.length > 0) {
    parts.push(`Built with ${stack.frameworks.join(", ")}`);
  } else if (stack.languages.length > 0) {
    parts.push(`Written in ${stack.languages.join(", ")}`);
  }

  if (decisionCount > 0) {
    parts.push(`${decisionCount} active architectural decisions recorded`);
  }

  if (gitInfo) {
    parts.push(`On branch '${gitInfo.branch}'`);
    if (gitInfo.uncommittedChanges > 0) {
      parts.push(`${gitInfo.uncommittedChanges} uncommitted changes`);
    }
  }

  return parts.join(". ") + ".";
}
