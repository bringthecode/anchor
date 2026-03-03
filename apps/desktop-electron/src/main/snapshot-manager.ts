import simpleGit, { SimpleGit } from "simple-git";
import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface Snapshot {
  id: string;
  label: string;
  timestamp: string;
  commitHash: string;
  branch: string;
  phaseId?: string;
  projectState: {
    fileCount: number;
    decisionCount: number;
    noteCount: number;
    stack: any;
  };
}

export interface Phase {
  id: string;
  title: string;
  description: string;
  order: number;
  status: "pending" | "active" | "completed";
  completedAt?: string;
  snapshotId?: string;
}

const SNAPSHOTS_FILE = "snapshots.json";
const PHASES_FILE = "phases.json";

export class SnapshotManager {
  private git: SimpleGit;
  private projectPath: string;
  private anchorDir: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.anchorDir = path.join(projectPath, ".anchor");
    this.git = simpleGit(projectPath);
  }

  // === Snapshots ===

  async createSnapshot(label: string, phaseId?: string): Promise<Snapshot> {
    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    // Get current git state
    let commitHash = "no-git";
    let branch = "none";
    try {
      const log = await this.git.log({ maxCount: 1 });
      commitHash = log.latest?.hash || "no-commits";
      const branchInfo = await this.git.branch();
      branch = branchInfo.current;
    } catch {
      // Not a git repo
    }

    // Create a git tag for easy rollback
    const tagName = `anchor-snapshot-${id.slice(0, 8)}`;
    try {
      // Stage and commit any uncommitted changes first
      const status = await this.git.status();
      if (status.modified.length > 0 || status.not_added.length > 0) {
        await this.git.add("-A");
        await this.git.commit(`[Anchor] Snapshot: ${label}`);
        const newLog = await this.git.log({ maxCount: 1 });
        commitHash = newLog.latest?.hash || commitHash;
      }
      await this.git.tag([tagName, "-m", `Anchor snapshot: ${label}`]);
    } catch {
      // Git operations failed, continue without tag
    }

    const snapshot: Snapshot = {
      id,
      label,
      timestamp,
      commitHash,
      branch,
      phaseId,
      projectState: await this.captureProjectState(),
    };

    // Save to snapshots file
    const snapshots = this.loadSnapshots();
    snapshots.push(snapshot);
    this.saveSnapshots(snapshots);

    return snapshot;
  }

  getSnapshots(): Snapshot[] {
    return this.loadSnapshots();
  }

  async restoreSnapshot(snapshotId: string): Promise<boolean> {
    const snapshots = this.loadSnapshots();
    const snapshot = snapshots.find((s) => s.id === snapshotId);
    if (!snapshot) return false;

    try {
      // Create a safety snapshot first
      await this.createSnapshot(`Pre-rollback safety snapshot`);

      // Restore to the snapshot's commit
      const tagName = `anchor-snapshot-${snapshot.id.slice(0, 8)}`;
      try {
        await this.git.checkout(tagName);
        // Create a new branch from this point
        const rollbackBranch = `anchor-rollback-${Date.now()}`;
        await this.git.checkoutLocalBranch(rollbackBranch);
      } catch {
        // Try direct commit hash
        await this.git.checkout(snapshot.commitHash);
        const rollbackBranch = `anchor-rollback-${Date.now()}`;
        await this.git.checkoutLocalBranch(rollbackBranch);
      }

      return true;
    } catch {
      return false;
    }
  }

  // === Phases ===

  getPhases(): Phase[] {
    return this.loadPhases();
  }

  parsePlanFile(): Phase[] {
    // Look for plan.md, PLAN.md, plan.txt, or similar
    const planFiles = ["plan.md", "PLAN.md", "plan.txt", "PROJECT-PLAN.md", "roadmap.md"];
    let planContent = "";

    for (const file of planFiles) {
      const filePath = path.join(this.projectPath, file);
      if (fs.existsSync(filePath)) {
        planContent = fs.readFileSync(filePath, "utf-8");
        break;
      }
    }

    if (!planContent) return [];

    // Parse phases from markdown headers and lists
    const phases: Phase[] = [];
    const lines = planContent.split("\n");
    let currentPhase: Partial<Phase> | null = null;
    let order = 0;

    for (const line of lines) {
      const trimmed = line.trim();

      // Match headers like "## Phase 1: Setup" or "## 1. Foundation" or "### MVP"
      const phaseMatch = trimmed.match(
        /^#{1,3}\s+(?:(?:Phase|Fas|Step|Steg)\s*\d*[:.]\s*)?(.+)/i
      );

      if (phaseMatch && !trimmed.toLowerCase().includes("table of contents")) {
        if (currentPhase?.title) {
          phases.push(this.finalizePhase(currentPhase, order++));
        }
        currentPhase = {
          title: phaseMatch[1].trim(),
          description: "",
        };
        continue;
      }

      // Collect description lines
      if (currentPhase && trimmed && !trimmed.startsWith("#")) {
        const cleanLine = trimmed.replace(/^[-*]\s+/, "");
        currentPhase.description = currentPhase.description
          ? `${currentPhase.description}\n${cleanLine}`
          : cleanLine;
      }
    }

    // Don't forget last phase
    if (currentPhase?.title) {
      phases.push(this.finalizePhase(currentPhase, order));
    }

    // Save parsed phases
    if (phases.length > 0) {
      const existing = this.loadPhases();
      if (existing.length === 0) {
        // First time — mark first phase as active
        phases[0].status = "active";
        this.savePhases(phases);
      }
    }

    return phases.length > 0 ? phases : this.loadPhases();
  }

  async completePhase(phaseId: string): Promise<Phase | null> {
    const phases = this.loadPhases();
    const phase = phases.find((p) => p.id === phaseId);
    if (!phase) return null;

    // Create snapshot for this phase
    const snapshot = await this.createSnapshot(
      `Phase complete: ${phase.title}`,
      phaseId
    );

    phase.status = "completed";
    phase.completedAt = new Date().toISOString();
    phase.snapshotId = snapshot.id;

    // Activate next phase
    const nextPhase = phases.find(
      (p) => p.order === phase.order + 1 && p.status === "pending"
    );
    if (nextPhase) {
      nextPhase.status = "active";
    }

    this.savePhases(phases);
    return phase;
  }

  async rollbackToPhase(phaseId: string): Promise<boolean> {
    const phases = this.loadPhases();
    const phase = phases.find((p) => p.id === phaseId);
    if (!phase?.snapshotId) return false;

    const success = await this.restoreSnapshot(phase.snapshotId);
    if (!success) return false;

    // Reset all phases after this one
    for (const p of phases) {
      if (p.order > phase.order) {
        p.status = "pending";
        p.completedAt = undefined;
        p.snapshotId = undefined;
      }
    }

    // Re-activate the phase after the rolled-back one
    const nextPhase = phases.find((p) => p.order === phase.order + 1);
    if (nextPhase) {
      nextPhase.status = "active";
    }

    this.savePhases(phases);
    return true;
  }

  // === Private helpers ===

  private async captureProjectState(): Promise<Snapshot["projectState"]> {
    let fileCount = 0;
    try {
      const countFiles = (dir: string, depth = 0): number => {
        if (depth > 5) return 0;
        let count = 0;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (
            ["node_modules", ".git", ".anchor", "dist", "build", ".next"].includes(
              entry.name
            )
          )
            continue;
          if (entry.isFile()) count++;
          else if (entry.isDirectory())
            count += countFiles(path.join(dir, entry.name), depth + 1);
        }
        return count;
      };
      fileCount = countFiles(this.projectPath);
    } catch {
      // Ignore
    }

    return {
      fileCount,
      decisionCount: 0, // Will be filled by ProjectManager
      noteCount: 0,
      stack: {},
    };
  }

  private finalizePhase(partial: Partial<Phase>, order: number): Phase {
    return {
      id: crypto.randomUUID(),
      title: partial.title || `Phase ${order + 1}`,
      description: (partial.description || "").trim(),
      order,
      status: "pending",
    };
  }

  private loadSnapshots(): Snapshot[] {
    const filePath = path.join(this.anchorDir, SNAPSHOTS_FILE);
    if (!fs.existsSync(filePath)) return [];
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      return [];
    }
  }

  private saveSnapshots(snapshots: Snapshot[]): void {
    fs.mkdirSync(this.anchorDir, { recursive: true });
    fs.writeFileSync(
      path.join(this.anchorDir, SNAPSHOTS_FILE),
      JSON.stringify(snapshots, null, 2)
    );
  }

  private loadPhases(): Phase[] {
    const filePath = path.join(this.anchorDir, PHASES_FILE);
    if (!fs.existsSync(filePath)) return [];
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      return [];
    }
  }

  private savePhases(phases: Phase[]): void {
    fs.mkdirSync(this.anchorDir, { recursive: true });
    fs.writeFileSync(
      path.join(this.anchorDir, PHASES_FILE),
      JSON.stringify(phases, null, 2)
    );
  }
}
