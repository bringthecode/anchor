import { ipcMain } from "electron";
import simpleGit from "simple-git";

export function registerGitOperationHandlers() {
  ipcMain.handle("git-diff", async (_e, projectPath: string) => {
    try {
      const git = simpleGit(projectPath);
      const status = await git.status();
      const diffs: Array<{ file: string; status: string; diff: string }> = [];
      for (const file of status.modified) {
        try { const diff = await git.diff([file]); diffs.push({ file, status: "modified", diff }); }
        catch { diffs.push({ file, status: "modified", diff: "(binary)" }); }
      }
      for (const file of status.staged) {
        if (!status.modified.includes(file)) {
          try { const diff = await git.diff(["--cached", file]); diffs.push({ file, status: "staged", diff }); }
          catch { diffs.push({ file, status: "staged", diff: "(binary)" }); }
        }
      }
      for (const file of status.not_added) { diffs.push({ file, status: "untracked", diff: "(new file)" }); }
      for (const file of status.deleted) { diffs.push({ file, status: "deleted", diff: "(deleted)" }); }
      return { branch: status.current, ahead: status.ahead, behind: status.behind, files: diffs, totalChanges: diffs.length };
    } catch (err: any) { return { error: err.message, files: [], totalChanges: 0 }; }
  });

  ipcMain.handle("git-commit-and-push", async (_e, projectPath: string, message: string, filesToStage?: string[]) => {
    try {
      const git = simpleGit(projectPath);
      if (filesToStage && filesToStage.length > 0) { await git.add(filesToStage); }
      else { await git.add("-A"); }
      const commitResult = await git.commit(message);
      try {
        const remotes = await git.getRemotes(true);
        if (remotes.length > 0) {
          const status = await git.status();
          await git.push("origin", status.current || "master");
        }
      } catch (pushErr: any) {
        return { success: true, committed: true, pushed: false, pushError: pushErr.message, commit: commitResult.commit };
      }
      return { success: true, committed: true, pushed: true, commit: commitResult.commit };
    } catch (err: any) { return { success: false, error: err.message }; }
  });

  ipcMain.handle("git-pull", async (_e, projectPath: string) => {
    try {
      const git = simpleGit(projectPath);
      const result = await git.pull();
      return { success: true, changes: result.summary.changes };
    } catch (err: any) { return { success: false, error: err.message }; }
  });
}
