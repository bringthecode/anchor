import { useState } from "react";
import { Sidebar } from "./components/Sidebar.tsx";
import { ProjectList } from "./components/ProjectList.tsx";
import { ProjectDetail } from "./components/ProjectDetail.tsx";

export interface Project {
  id: string;
  name: string;
  path: string;
  stack: {
    frameworks: string[];
    languages: string[];
    buildTools: string[];
    databases: string[];
  };
  updatedAt: string;
  decisionCount: number;
}

export default function App() {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [view, setView] = useState<"projects" | "settings">("projects");

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--bg-primary)" }}>
      <Sidebar
        currentView={view}
        onViewChange={setView}
        projectName={selectedProject?.name}
        onBack={() => setSelectedProject(null)}
      />

      <main style={{ flex: 1, overflow: "auto", padding: "24px 32px" }}>
        {view === "projects" && !selectedProject && (
          <ProjectList onSelect={setSelectedProject} />
        )}
        {view === "projects" && selectedProject && (
          <ProjectDetail
            project={selectedProject}
            onBack={() => setSelectedProject(null)}
          />
        )}
        {view === "settings" && <SettingsView />}
      </main>
    </div>
  );
}

function SettingsView() {
  return (
    <div>
      <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "24px" }}>Settings</h1>
      <div style={{
        background: "var(--bg-card)",
        borderRadius: "12px",
        padding: "24px",
        border: "1px solid var(--border)",
      }}>
        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "block", color: "var(--text-secondary)", marginBottom: "8px", fontSize: "14px" }}>
            Default Export Target
          </label>
          <select style={{
            background: "var(--bg-secondary)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "8px 12px",
            width: "100%",
            maxWidth: "300px",
          }}>
            <option value="cursor">Cursor</option>
            <option value="claude-code">Claude Code</option>
            <option value="windsurf">Windsurf</option>
            <option value="markdown">Markdown</option>
            <option value="json">JSON</option>
          </select>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "block", color: "var(--text-secondary)", marginBottom: "8px", fontSize: "14px" }}>
            Anthropic API Key
          </label>
          <input
            type="password"
            placeholder="sk-ant-..."
            style={{
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              padding: "8px 12px",
              width: "100%",
              maxWidth: "400px",
            }}
          />
          <p style={{ color: "var(--text-secondary)", fontSize: "12px", marginTop: "4px" }}>
            Required for AI-powered summaries
          </p>
        </div>

        <div>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-primary)", cursor: "pointer" }}>
            <input type="checkbox" defaultChecked />
            <span>Auto-watch projects for changes</span>
          </label>
        </div>
      </div>
    </div>
  );
}
