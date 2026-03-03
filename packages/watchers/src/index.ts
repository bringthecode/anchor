import chokidar from "chokidar";
import path from "path";
import fs from "fs";
import { ProjectMemory, detectStack } from "@anchor/core";

export interface WatcherOptions {
  projectPath: string;
  anchorDir: string;
  watchPaths?: string[];
  ignorePaths?: string[];
  onChange?: (event: WatchEvent) => void;
}

export interface WatchEvent {
  type: "add" | "change" | "unlink";
  path: string;
  timestamp: string;
}

export class ProjectWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private options: WatcherOptions;
  private memory: ProjectMemory;
  private debounceTimer: NodeJS.Timeout | null = null;

  constructor(options: WatcherOptions) {
    this.options = options;
    this.memory = new ProjectMemory(options.anchorDir);
  }

  start(): void {
    const watchGlobs = (this.options.watchPaths || ["."]).map((p) =>
      path.join(this.options.projectPath, p, "**/*")
    );

    const ignored = [
      "**/node_modules/**",
      "**/.git/**",
      "**/.anchor/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/coverage/**",
      ...(this.options.ignorePaths || []).map((p) => `**/${p}/**`),
    ];

    this.watcher = chokidar.watch(watchGlobs, {
      ignored,
      persistent: true,
      ignoreInitial: true,
    });

    this.watcher
      .on("add", (filePath) => this.handleEvent("add", filePath))
      .on("change", (filePath) => this.handleEvent("change", filePath))
      .on("unlink", (filePath) => this.handleEvent("unlink", filePath));
  }

  private handleEvent(type: "add" | "change" | "unlink", filePath: string): void {
    const event: WatchEvent = {
      type,
      path: path.relative(this.options.projectPath, filePath),
      timestamp: new Date().toISOString(),
    };

    this.options.onChange?.(event);

    // Debounced stack re-detection on significant file changes
    const significantFiles = [
      "package.json",
      "requirements.txt",
      "Cargo.toml",
      "go.mod",
      "tsconfig.json",
    ];

    if (significantFiles.some((f) => filePath.endsWith(f))) {
      this.debouncedStackUpdate();
    }
  }

  private debouncedStackUpdate(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      try {
        const stack = await detectStack(this.options.projectPath);
        this.memory.updateProjectStack(this.options.projectPath, stack);
      } catch {
        // Ignore detection errors during watch
      }
    }, 2000);
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.memory.close();
  }
}
