import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("anchor", {
  // Project
  openProject: () => ipcRenderer.invoke("open-project"),
  getProjects: () => ipcRenderer.invoke("get-projects"),
  getProjectState: (path: string) => ipcRenderer.invoke("get-project-state", path),
  removeProject: (path: string) => ipcRenderer.invoke("remove-project", path),

  // Decisions
  addDecision: (path: string, decision: any) => ipcRenderer.invoke("add-decision", path, decision),
  getDecisions: (path: string) => ipcRenderer.invoke("get-decisions", path),

  // Notes
  addNote: (path: string, content: string) => ipcRenderer.invoke("add-note", path, content),
  getNotes: (path: string) => ipcRenderer.invoke("get-notes", path),

  // Phases
  getPhases: (path: string) => ipcRenderer.invoke("get-phases", path),
  completePhase: (path: string, phaseId: string) => ipcRenderer.invoke("complete-phase", path, phaseId),
  rollbackToPhase: (path: string, phaseId: string) => ipcRenderer.invoke("rollback-to-phase", path, phaseId),

  // Export
  exportContext: (path: string, target: string) => ipcRenderer.invoke("export-context", path, target),
  exportAll: (path: string) => ipcRenderer.invoke("export-all", path),

  // Git
  getGitLog: (path: string) => ipcRenderer.invoke("get-git-log", path),
  getGitStatus: (path: string) => ipcRenderer.invoke("get-git-status", path),

  // Snapshots
  createSnapshot: (path: string, label: string) => ipcRenderer.invoke("create-snapshot", path, label),
  getSnapshots: (path: string) => ipcRenderer.invoke("get-snapshots", path),
  restoreSnapshot: (path: string, snapshotId: string) => ipcRenderer.invoke("restore-snapshot", path, snapshotId),

  // Portability
  getPortabilityReport: (path: string) => ipcRenderer.invoke("get-portability-report", path),

  // Events from main
  onQuickExport: (callback: (target: string) => void) => {
    ipcRenderer.on("quick-export", (_e, target) => callback(target));
  },
  onFileChanged: (callback: (event: any) => void) => {
    ipcRenderer.on("file-changed", (_e, event) => callback(event));
  },
  onPhaseDetected: (callback: (phase: any) => void) => {
    ipcRenderer.on("phase-detected", (_e, phase) => callback(phase));
  },
});
