import fs from "fs";
import path from "path";
import type { FileNode } from "./types.js";

const DEFAULT_IGNORE = [
  "node_modules",
  ".git",
  ".anchor",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".output",
  "coverage",
  ".cache",
  "__pycache__",
  ".venv",
  "venv",
  "target",
  ".DS_Store",
  "thumbs.db",
];

export function scanFileTree(
  dir: string,
  options: {
    maxDepth?: number;
    ignore?: string[];
  } = {}
): FileNode[] {
  const { maxDepth = 5, ignore = DEFAULT_IGNORE } = options;

  function scan(currentPath: string, depth: number): FileNode[] {
    if (depth > maxDepth) return [];

    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    const nodes: FileNode[] = [];

    for (const entry of entries) {
      if (ignore.includes(entry.name) || entry.name.startsWith(".")) continue;

      const fullPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(dir, fullPath);

      if (entry.isDirectory()) {
        nodes.push({
          path: relativePath,
          type: "directory",
          children: scan(fullPath, depth + 1),
        });
      } else if (entry.isFile()) {
        const stat = fs.statSync(fullPath);
        nodes.push({
          path: relativePath,
          type: "file",
          size: stat.size,
        });
      }
    }

    return nodes.sort((a, b) => {
      // Directories first, then files
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.path.localeCompare(b.path);
    });
  }

  return scan(dir, 0);
}

export function fileTreeToString(nodes: FileNode[], indent = ""): string {
  let result = "";
  for (const node of nodes) {
    const icon = node.type === "directory" ? "📁" : "📄";
    result += `${indent}${icon} ${path.basename(node.path)}\n`;
    if (node.children) {
      result += fileTreeToString(node.children, indent + "  ");
    }
  }
  return result;
}

export function countFiles(nodes: FileNode[]): { files: number; dirs: number } {
  let files = 0;
  let dirs = 0;
  for (const node of nodes) {
    if (node.type === "file") files++;
    else dirs++;
    if (node.children) {
      const sub = countFiles(node.children);
      files += sub.files;
      dirs += sub.dirs;
    }
  }
  return { files, dirs };
}
