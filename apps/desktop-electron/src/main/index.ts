import { app, BrowserWindow, Tray, Menu, ipcMain, dialog, nativeImage } from "electron";
import path from "path";
import { ProjectManager } from "./project-manager";
import { GitWatcher } from "./git-watcher";
import { SnapshotManager } from "./snapshot-manager";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
const projectManager = new ProjectManager();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0a0a0f",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Dev or production
  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("close", (e) => {
    // Minimize to tray instead of closing
    if (process.platform === "darwin") {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray() {
  // Simple tray icon — in production use a proper icon file
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open Anchor",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      },
    },
    { type: "separator" },
    {
      label: "Quick Export → Cursor",
      click: () => sendToRenderer("quick-export", "cursor"),
    },
    {
      label: "Quick Export → Claude Code",
      click: () => sendToRenderer("quick-export", "claude-code"),
    },
    {
      label: "Quick Export → Windsurf",
      click: () => sendToRenderer("quick-export", "windsurf"),
    },
    { type: "separator" },
    {
      label: "Quit Anchor",
      click: () => {
        projectManager.cleanup();
        app.quit();
      },
    },
  ]);

  tray.setToolTip("Anchor — Own your code");
  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
}

function sendToRenderer(channel: string, ...args: any[]) {
  mainWindow?.webContents.send(channel, ...args);
}

// ============================================================
// IPC Handlers — bridge between renderer and Node.js
// ============================================================

// Project management
ipcMain.handle("open-project", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
    title: "Select Project Folder",
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const projectPath = result.filePaths[0];
  const project = await projectManager.openProject(projectPath);
  return project;
});

ipcMain.handle("get-projects", async () => {
  return projectManager.getProjects();
});

ipcMain.handle("get-project-state", async (_e, projectPath: string) => {
  return projectManager.getProjectState(projectPath);
});

ipcMain.handle("remove-project", async (_e, projectPath: string) => {
  return projectManager.removeProject(projectPath);
});

// Decisions
ipcMain.handle("add-decision", async (_e, projectPath: string, decision: any) => {
  return projectManager.addDecision(projectPath, decision);
});

ipcMain.handle("get-decisions", async (_e, projectPath: string) => {
  return projectManager.getDecisions(projectPath);
});

// Notes
ipcMain.handle("add-note", async (_e, projectPath: string, content: string) => {
  return projectManager.addNote(projectPath, content);
});

ipcMain.handle("get-notes", async (_e, projectPath: string) => {
  return projectManager.getNotes(projectPath);
});

// Phases
ipcMain.handle("get-phases", async (_e, projectPath: string) => {
  return projectManager.getPhases(projectPath);
});

ipcMain.handle("complete-phase", async (_e, projectPath: string, phaseId: string) => {
  return projectManager.completePhase(projectPath, phaseId);
});

ipcMain.handle("rollback-to-phase", async (_e, projectPath: string, phaseId: string) => {
  return projectManager.rollbackToPhase(projectPath, phaseId);
});

// Export
ipcMain.handle("export-context", async (_e, projectPath: string, target: string) => {
  return projectManager.exportContext(projectPath, target);
});

ipcMain.handle("export-all", async (_e, projectPath: string) => {
  return projectManager.exportAll(projectPath);
});

// Git
ipcMain.handle("get-git-log", async (_e, projectPath: string) => {
  return projectManager.getGitLog(projectPath);
});

ipcMain.handle("get-git-status", async (_e, projectPath: string) => {
  return projectManager.getGitStatus(projectPath);
});

// Snapshots
ipcMain.handle("create-snapshot", async (_e, projectPath: string, label: string) => {
  return projectManager.createSnapshot(projectPath, label);
});

ipcMain.handle("get-snapshots", async (_e, projectPath: string) => {
  return projectManager.getSnapshots(projectPath);
});

ipcMain.handle("restore-snapshot", async (_e, projectPath: string, snapshotId: string) => {
  return projectManager.restoreSnapshot(projectPath, snapshotId);
});

// Portability report
ipcMain.handle("get-portability-report", async (_e, projectPath: string) => {
  return projectManager.getPortabilityReport(projectPath);
});

// ============================================================
// App lifecycle
// ============================================================

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  projectManager.cleanup();
});
