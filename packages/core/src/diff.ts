import fs from "fs";
import path from "path";
import type { ContextSnapshot, TechStack } from "./types.js";

export interface DiffResult {
  hasChanges: boolean;
  stackChanges: StackDiff;
  fileChanges: FileDiff;
  newDecisions: string[];
  removedDecisions: string[];
  newNotes: string[];
  summary: string;
}

export interface StackDiff {
  added: { field: string; values: string[] }[];
  removed: { field: string; values: string[] }[];
}

export interface FileDiff {
  added: string[];
  removed: string[];
  total: { before: number; after: number };
}

const LAST_EXPORT_FILE = "last-export.json";

/**
 * Save a snapshot as the baseline for future diffs.
 */
export function saveExportBaseline(anchorDir: string, snapshot: ContextSnapshot): void {
  const baselinePath = path.join(anchorDir, LAST_EXPORT_FILE);
  fs.writeFileSync(baselinePath, JSON.stringify(snapshot, null, 2));
}

/**
 * Load the last saved baseline.
 */
export function loadExportBaseline(anchorDir: string): ContextSnapshot | null {
  const baselinePath = path.join(anchorDir, LAST_EXPORT_FILE);
  if (!fs.existsSync(baselinePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(baselinePath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Compare current snapshot against the last exported baseline.
 */
export function diffSnapshots(
  baseline: ContextSnapshot,
  current: ContextSnapshot
): DiffResult {
  const stackChanges = diffStack(baseline.stack, current.stack);
  const fileChanges = diffFiles(baseline, current);

  const baselineDecisionIds = new Set(baseline.decisions.map((d) => d.id));
  const currentDecisionIds = new Set(current.decisions.map((d) => d.id));

  const newDecisions = current.decisions
    .filter((d) => !baselineDecisionIds.has(d.id))
    .map((d) => d.title);
  const removedDecisions = baseline.decisions
    .filter((d) => !currentDecisionIds.has(d.id))
    .map((d) => d.title);

  const baselineNotes = new Set(baseline.notes);
  const newNotes = current.notes.filter((n) => !baselineNotes.has(n));

  const hasChanges =
    stackChanges.added.length > 0 ||
    stackChanges.removed.length > 0 ||
    fileChanges.added.length > 0 ||
    fileChanges.removed.length > 0 ||
    newDecisions.length > 0 ||
    removedDecisions.length > 0 ||
    newNotes.length > 0;

  const summaryParts: string[] = [];
  if (!hasChanges) {
    summaryParts.push("No changes since last export.");
  } else {
    if (fileChanges.added.length > 0)
      summaryParts.push(`${fileChanges.added.length} files added`);
    if (fileChanges.removed.length > 0)
      summaryParts.push(`${fileChanges.removed.length} files removed`);
    if (newDecisions.length > 0)
      summaryParts.push(`${newDecisions.length} new decisions`);
    if (removedDecisions.length > 0)
      summaryParts.push(`${removedDecisions.length} decisions removed`);
    if (newNotes.length > 0)
      summaryParts.push(`${newNotes.length} new notes`);
    if (stackChanges.added.length > 0 || stackChanges.removed.length > 0)
      summaryParts.push("stack changes detected");
  }

  return {
    hasChanges,
    stackChanges,
    fileChanges,
    newDecisions,
    removedDecisions,
    newNotes,
    summary: summaryParts.join(", "),
  };
}

function diffStack(baseline: TechStack, current: TechStack): StackDiff {
  const fields: (keyof TechStack)[] = ["languages", "frameworks", "buildTools", "databases"];
  const added: StackDiff["added"] = [];
  const removed: StackDiff["removed"] = [];

  for (const field of fields) {
    const baseArr = (baseline[field] as string[]) || [];
    const currArr = (current[field] as string[]) || [];
    const baseSet = new Set(baseArr);
    const currSet = new Set(currArr);

    const addedValues = currArr.filter((v) => !baseSet.has(v));
    const removedValues = baseArr.filter((v) => !currSet.has(v));

    if (addedValues.length > 0) added.push({ field, values: addedValues });
    if (removedValues.length > 0) removed.push({ field, values: removedValues });
  }

  return { added, removed };
}

function diffFiles(baseline: ContextSnapshot, current: ContextSnapshot): FileDiff {
  const flattenPaths = (nodes: any[]): string[] => {
    const paths: string[] = [];
    for (const node of nodes) {
      if (node.type === "file") paths.push(node.path);
      if (node.children) paths.push(...flattenPaths(node.children));
    }
    return paths;
  };

  const baselinePaths = new Set(flattenPaths(baseline.fileTree));
  const currentPaths = new Set(flattenPaths(current.fileTree));

  const added = [...currentPaths].filter((p) => !baselinePaths.has(p));
  const removed = [...baselinePaths].filter((p) => !currentPaths.has(p));

  return {
    added,
    removed,
    total: { before: baselinePaths.size, after: currentPaths.size },
  };
}
