import simpleGit, { SimpleGit } from "simple-git";
import chokidar from "chokidar";
import path from "path";
import { EventEmitter } from "events";

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
  private commitPollInterval: NodeJS.Timeout | null = null;
  private autoPullInterval: NodeJS.Timeout | null = null;

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

    // Watch for local file changes
    this.watcher = chokidar.watch(this.projectPath, {
      ignored: [
        "**/node_modules/**", "**/.git/**", "**/.anchor/**",
        "**/dist/**", "**/build/**", "**/.next/**", "**/coverage/**",
      ],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    });

    this.watcher
      .on("add", (fp) => this.onFileChange("add", fp))
      .on("change", (fp) => this.onFileChange("change", fp))
      .on("unlink", (fp) => this.onFileChange("unlink", fp));

    // Poll for new local commits every 5 seconds
    this.commitPollInterval = setInterval(() => this.checkForNewCommits(), 5000);

    // Auto-pull from remote every 2 minutes
    this.autoPullInterval = setInterval(() => this.autoPull(), 120000);

    // Do an initial pull on start
    this.autoPull();
  }

  private async autoPull(): Promise<void> {
    try {
      const remotes = await this.git.getRemotes();
      if (remotes.length === 0) return; // No remote configured

      const status = await this.git.status();

      // Only pull if there are no uncommitted changes (avoid merge conflicts)
      if (status.modified.length > 0 || status.staged.length > 0) {
        this.emit("pull-skipped", { reason: "uncommitted-changes" });
        return;
      }

      const pullResult = await this.git.pull();

      if (pullResult.summary.changes > 0 || pullResult.summary.insertions > 0 || pullResult.summary.deletions > 0) {
        this.emit("pulled", {
          changes: pullResult.summary.changes,
          insertions: pullResult.summary.insertions,
          deletions: pullResult.summary.deletions,
          files: pullResult.files,
        });
      }
    } catch {
      // Remote unreachable, auth issues, etc — silently ignore
    }
  }

  private onFileChange(type: string, filePath: string): void {
    const relativePath = path.relative(this.projectPath, filePath);
    this.emit("file-change", {
      type,
      path: relativePath,
      timestamp: new Date().toISOString(),
    });
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
      // Ignore
    }
  }

  async getLog(count: number = 50): Promise<GitLogEntry[]> {
    try {
      const log = await this.git.log({ maxCount: count });
      const entries: GitLogEntry[] = [];

      for (const commit of log.all) {
        let files: string[] = [];
        try {
          const diff = await this.git.diffSummary([`${commit.hash}~1`, commit.hash]);
          files = diff.files.map((f) => f.file);
        } catch {}

        entries.push({
          hash: commit.hash,
          date: commit.date,
          message: commit.message,
          author: commit.author_name,
          files,
        });
      }
      return entries;
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
      return { branch: "unknown", modified: [], staged: [], untracked: [], ahead: 0, behind: 0 };
    }
  }

  async forcePull(): Promise<any> {
    try {
      const result = await this.git.pull();
      return result;
    } catch (err: any) {
      return { error: err.message };
    }
  }

  stop(): void {
    if (this.watcher) { this.watcher.close(); this.watcher = null; }
    if (this.commitPollInterval) { clearInterval(this.commitPollInterval); this.commitPollInterval = null; }
    if (this.autoPullInterval) { clearInterval(this.autoPullInterval); this.autoPullInterval = null; }
  }
}
