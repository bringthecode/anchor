import { ipcMain } from "electron";
import fs from "fs";
import path from "path";

const IGNORE_DIRS = new Set([
  "node_modules", ".git", ".anchor", "dist", "build",
  ".next", ".nuxt", ".svelte-kit", ".output",
  "coverage", "__pycache__", ".venv", "venv",
  "target", ".cache", ".DS_Store",
]);

interface FileNode {
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

function scanDir(dirPath: string, basePath: string, depth = 0, maxDepth = 5): FileNode[] {
  if (depth > maxDepth) return [];

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const nodes: FileNode[] = [];

    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;

      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(basePath, fullPath);

      if (entry.isDirectory()) {
        nodes.push({
          path: relativePath,
          type: "directory",
          children: scanDir(fullPath, basePath, depth + 1, maxDepth),
        });
      } else if (entry.isFile()) {
        // Only show code/text files
        const ext = path.extname(entry.name).toLowerCase();
        const codeExts = new Set([
          ".ts", ".tsx", ".js", ".jsx", ".json", ".css", ".scss",
          ".html", ".md", ".txt", ".yaml", ".yml", ".toml",
          ".py", ".rs", ".go", ".env", ".sql", ".sh",
          ".svelte", ".vue", ".astro",
        ]);
        if (codeExts.has(ext) || entry.name === "Dockerfile" || entry.name === "Makefile") {
          nodes.push({ path: relativePath, type: "file" });
        }
      }
    }

    return nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.path.localeCompare(b.path);
    });
  } catch {
    return [];
  }
}

export function registerFileHandlers() {
  ipcMain.handle("get-file-tree", async (_e, projectPath: string) => {
    return scanDir(projectPath, projectPath);
  });

  ipcMain.handle("read-file", async (_e, projectPath: string, filePath: string) => {
    try {
      const fullPath = path.join(projectPath, filePath);
      // Security: ensure file is within project
      if (!fullPath.startsWith(projectPath)) return null;
      return fs.readFileSync(fullPath, "utf-8");
    } catch {
      return null;
    }
  });

  ipcMain.handle("write-file", async (_e, projectPath: string, filePath: string, content: string) => {
    try {
      const fullPath = path.join(projectPath, filePath);
      // Security: ensure file is within project
      if (!fullPath.startsWith(projectPath)) return false;
      fs.writeFileSync(fullPath, content);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle("create-new-file", async (_e, projectPath: string, filePath: string) => {
    try {
      const fullPath = path.join(projectPath, filePath);
      if (!fullPath.startsWith(projectPath)) return false;
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fullPath, "");
      return true;
    } catch {
      return false;
    }
  });
}
