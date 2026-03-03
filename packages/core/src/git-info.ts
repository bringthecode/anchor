import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import type { GitInfo } from "./types.js";

export function readGitInfo(projectPath: string): GitInfo | undefined {
  const gitDir = path.join(projectPath, ".git");
  if (!fs.existsSync(gitDir)) return undefined;

  try {
    const exec = (cmd: string) =>
      execSync(cmd, { cwd: projectPath, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();

    const branch = exec("git rev-parse --abbrev-ref HEAD");
    const lastCommit = exec("git rev-parse --short HEAD");
    const lastCommitMessage = exec("git log -1 --pretty=%s");
    const uncommittedChanges = parseInt(
      exec("git status --porcelain | wc -l"),
      10
    );

    let remoteUrl: string | undefined;
    try {
      remoteUrl = exec("git remote get-url origin");
    } catch {
      // No remote configured
    }

    return {
      branch,
      lastCommit,
      lastCommitMessage,
      remoteUrl,
      uncommittedChanges,
    };
  } catch {
    return undefined;
  }
}
