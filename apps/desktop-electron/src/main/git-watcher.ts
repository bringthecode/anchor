import simpleGit, { SimpleGit, LogResult } from "simple-git";
import chokidar from "chokidar";
import path from "path";
import { EventEmitter } from "events";

export interface GitEvent {
  type: "commit" | "file-change" | "branch-switch" | "pull";
  timestamp: string;
  details: any;
}

export interface GitLogEntry {
  hash: string;
  date: string;
  message: string;
  author: string;
  files: string[];
}

export class GitWatcher extends EventEmitter {
  private git: SimpleGit;
  private watcher: chokidar.FSWatcher | null = null;
  private projectPath: string;
  private lastCommitHash: string = "";
  private pollInterval: NodeJS.Timeout | null = null;

  constructor(projectPath: string) {
    super();
    this.projectPath = projectPath;
    this.git = simpleGit(projectPath);
  }

  async start(): Promise<void> {
    // Get initial state
    try {
      const log = await this.git.log({ maxCount: 1 });
      if (log.latest) {
        this.lastCommitHash = log.latest.hash;
      }
    } catch {
      // Not a git repo or no commits yet
    }

    // Watch for file changes
    this.watcher = chokidar.watch(this.projectPath, {
      ignored: [
        "**/node_modules/**",
        "**/.git/**",
        "**/.anchor/**",
        "**/dist/**",
        "**/build/**",
        "**/.next/**",
        "**/coverage/**",
      ],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    this.watcher
      .on("add", (filePath) => this.onFileChange("add", filePath))
      .on("change", (filePath) => this.onFileChange("change", filePath))
      .on("unlink", (filePath) => this.onFileChange("unlink", filePath));

    // Poll every 30s AND run immediately on start
    this.pollInterval = setInterval(() => this.pullAndCheck(), 30000);
  }

  private onFileChange(type: string, filePath: string): void {
    const relativePath = path.relative(this.projectPath, filePath);
    this.emit("file-change", {
      type,
      path: relativePath,
      timestamp: new Date().toISOString(),
    });
  }

  private async pullAndCheck(): Promise<void> {
    try {
      const remotes = await this.git.getRemotes(true);
      if (remotes.length === 0) return;

      // Skip fetch for HTTPS remotes entirely — triggers macOS keychain prompt
      const origin = remotes.find((r: any) => r.name === "origin");
      const remoteUrl = origin?.refs?.fetch || "";
      if (remoteUrl.startsWith("https://")) return;

      const beforeLog = await this.git.log({ maxCount: 1 }).catch(() => null);
      const beforeHash = beforeLog?.latest?.hash || "";

      // fetch + reset is more reliable than pull (handles diverged branches, credential caching etc)
      const branch = await this.git.revparse(["--abbrev-ref", "HEAD"]).catch(() => "main");
      const cleanBranch = branch.trim();
      await this.git.fetch("origin").catch(() => null);
      await this.git.reset(["--hard", `origin/${cleanBranch}`]).catch(() => null);

      const afterLog = await this.git.log({ maxCount: 1 }).catch(() => null);
      const afterHash = afterLog?.latest?.hash || "";

      if (afterHash && afterHash !== beforeHash) {
        this.lastCommitHash = afterHash;

        const newCommits = beforeHash
          ? await this.git.log({ from: beforeHash, to: afterHash }).catch(() => null)
          : null;

        const commits = newCommits?.all || (afterLog?.latest ? [afterLog.latest] : []);

        for (const commit of commits) {
          this.emit("new-commit", {
            hash: commit.hash,
            date: commit.date,
            message: commit.message,
            author: commit.author_name,
            fromPull: true,
          });
        }

        this.emit("pulled", {
          newCommits: commits.length,
          latestMessage: commits[0]?.message || "",
        });
      }
    } catch {
      // Ignore — no network, no remote, etc.
    }
  }

  private async checkForNewCommits(): Promise<void> {
    try {
      const log = await this.git.log({ maxCount: 1 });
      if (log.latest && log.latest.hash !== this.lastCommitHash) {
        const oldHash = this.lastCommitHash;
        this.lastCommitHash = log.latest.hash;

        if (oldHash) {
          const newCommits = await this.git.log({ from: oldHash, to: log.latest.hash });
          for (const commit of newCommits.all) {
            this.emit("new-commit", {
              hash: commit.hash,
              date: commit.date,
              message: commit.message,
              author: commit.author_name,
            });
          }
        }
      }
    } catch {
      // Ignore git errors
    }
  }

  async getLog(count: number = 100): Promise<GitLogEntry[]> {
    try {
      const log = await this.git.log({ maxCount: count });
      return log.all.map((commit) => ({
        hash: commit.hash,
        date: commit.date,
        message: commit.message,
        author: commit.author_name,
        files: [],
      }));
    } catch {
      return [];
    }
  }

  async getStatus(): Promise<{
    branch: string;
    modified: string[];
    staged: string[];
    untracked: string[];
    ahead: number;
    behind: number;
  }> {
    try {
      const status = await this.git.status();
      return {
        branch: status.current || "unknown",
        modified: status.modified,
        staged: status.staged,
        untracked: status.not_added,
        ahead: status.ahead,
        behind: status.behind,
      };
    } catch {
      return {
        branch: "unknown",
        modified: [],
        staged: [],
        untracked: [],
        ahead: 0,
        behind: 0,
      };
    }
  }

  async getBranch(): Promise<string> {
    try {
      const branch = await this.git.branch();
      return branch.current;
    } catch {
      return "unknown";
    }
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
}
