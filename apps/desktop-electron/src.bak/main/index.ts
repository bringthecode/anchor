import { app, BrowserWindow, Tray, Menu, ipcMain, dialog, nativeImage } from "electron";
import path from "path";
import fs from "fs";
import { ProjectManager } from "./project-manager";
import { GitWatcher } from "./git-watcher";
import { SnapshotManager } from "./snapshot-manager";
import { registerFileHandlers } from "./file-handlers";
import { registerGitOperationHandlers } from "./git-operations";

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
    backgroundColor: "#0d1517",
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

ipcMain.handle("reopen-project", async (_e, projectPath: string) => {
  const project = await projectManager.openProject(projectPath);
  return project;
});

ipcMain.handle("rename-project", async (_e, projectPath: string, newName: string) => {
  return projectManager.renameProject(projectPath, newName);
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

ipcMain.handle("write-vision-section", async (_e, projectPath: string, visionSection: string) => {
  return projectManager.writeVisionSection(projectPath, visionSection);
});

// ============================================================
// App lifecycle
// ============================================================

app.whenReady().then(() => {
  registerFileHandlers();
  registerGitOperationHandlers();
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

// ============================================================
// Secure settings (API keys etc) — stored in userData, not localStorage
// ============================================================

const SETTINGS_FILE = path.join(app.getPath("userData"), "anchor-settings.json");

function readSettings(): Record<string, string> {
  try {
    if (fs.existsSync(SETTINGS_FILE)) return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
  } catch {}
  return {};
}

function writeSettings(data: Record<string, string>) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
}

ipcMain.handle("get-setting", (_e, key: string) => {
  return readSettings()[key] ?? null;
});

ipcMain.handle("set-setting", (_e, key: string, value: string) => {
  const settings = readSettings();
  settings[key] = value;
  writeSettings(settings);
});

ipcMain.handle("delete-setting", (_e, key: string) => {
  const settings = readSettings();
  delete settings[key];
  writeSettings(settings);
});

// ============================================================
// Install app — dock/desktop shortcut + login item
// ============================================================
ipcMain.handle("install-app", async () => {
  const exePath = process.execPath;
  const platform = process.platform;

  try {
    if (platform === "darwin") {
      // Mac: enable login item (auto-start) and open /Applications hint
      app.setLoginItemSettings({ openAtLogin: true, openAsHidden: false });

      // Show a dialog with instructions since we can't drag to dock programmatically
      const { shell } = await import("electron");
      const result = await dialog.showMessageBox({
        type: "info",
        title: "Add Anchor to your Mac",
        message: "To keep Anchor in your Dock:",
        detail: "1. Anchor is now set to open automatically when you log in.\n\n2. To pin it to your Dock: Right-click the Anchor icon in your Dock while it's running → Options → Keep in Dock.",
        buttons: ["Got it", "Open Applications Folder"],
        defaultId: 0,
      });
      if (result.response === 1) {
        shell.openPath("/Applications");
      }
      return { success: true, platform: "mac" };

    } else if (platform === "win32") {
      // Windows: create desktop shortcut via PowerShell
      const { execSync } = await import("child_process");
      const desktopPath = app.getPath("desktop");
      const shortcutPath = `${desktopPath}\\Anchor.lnk`;
      const ps = `
        $WshShell = New-Object -comObject WScript.Shell
        $Shortcut = $WshShell.CreateShortcut("${shortcutPath.replace(/\\/g, "\\\\")}")
        $Shortcut.TargetPath = "${exePath.replace(/\\/g, "\\\\")}"
        $Shortcut.WorkingDirectory = "${path.dirname(exePath).replace(/\\/g, "\\\\")}"
        $Shortcut.Description = "Anchor — Own your code"
        $Shortcut.Save()
      `;
      execSync(`powershell -command "${ps.replace(/\n\s*/g, " ")}"`);
      app.setLoginItemSettings({ openAtLogin: true });
      return { success: true, platform: "win32" };

    } else {
      // Linux: create .desktop file
      const { execSync } = await import("child_process");
      const desktopEntry = `[Desktop Entry]
Name=Anchor
Exec=${exePath}
Icon=anchor
Type=Application
Categories=Development;
Comment=Own your code
`;
      const desktopDir = path.join(process.env.HOME || "~", ".local/share/applications");
      fs.mkdirSync(desktopDir, { recursive: true });
      fs.writeFileSync(path.join(desktopDir, "anchor.desktop"), desktopEntry);
      execSync(`chmod +x ${path.join(desktopDir, "anchor.desktop")}`);
      return { success: true, platform: "linux" };
    }
  } catch (e: any) {
    return { success: false, error: e.message };
  }
});

// ============================================================
// Claude API proxy — routes Anthropic calls through main process
// to avoid CSP/CORS restrictions in renderer
// ============================================================
ipcMain.handle("claude-chat", async (_e, { apiKey, system, messages, maxTokens, model }) => {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: model || "claude-sonnet-4-20250514",
        max_tokens: maxTokens || 1000,
        system,
        messages,
      }),
    });
    const data = await response.json();
    return data;
  } catch (e: any) {
    return { error: e.message };
  }
});

// Validate API key
ipcMain.handle("validate-api-key", async (_e, apiKey: string) => {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 10,
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    const data = await response.json();
    return { valid: !data.error, error: data.error?.message };
  } catch (e: any) {
    return { valid: false, error: e.message };
  }
});

