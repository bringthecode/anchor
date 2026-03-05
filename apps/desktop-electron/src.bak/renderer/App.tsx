import React, { useState, useEffect, useRef } from "react";
import { EditorView } from "./components/EditorView.tsx";
import { PushView } from "./components/PushView.tsx";

type View = "welcome" | "projects" | "dashboard" | "decisions" | "phases" | "export" | "editor" | "push" | "timeline" | "portability" | "vision";

interface Project {
  path: string;
  name: string;
  displayName?: string;
  stack: any;
  lastActivity: string;
  decisionCount: number;
  phaseCount: number;
  gitBranch: string;
}

export default function App() {
  const [view, setView] = useState<View>("projects");
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [projectState, setProjectState] = useState<any>(null);
  const [hasSeenWelcome, setHasSeenWelcome] = useState(false);
  const [namePrompt, setNamePrompt] = useState<{ path: string; defaultName: string } | null>(null);

  const [pullNotice, setPullNotice] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  const showError = (msg: string) => {
    setErrorToast(msg);
    setTimeout(() => setErrorToast(null), 6000);
  };

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (projects.length === 0 && !hasSeenWelcome) {
      setView("welcome");
    }
  }, [projects]);

  useEffect(() => {
    if (activeProject) loadProjectState(activeProject.path);
  }, [activeProject]);

  useEffect(() => {
    if (!window.anchor?.onProjectPulled) return;
    window.anchor.onProjectPulled((info: any) => {
      if (activeProject && info.projectPath === activeProject.path) {
        // Small delay to let SQLite writes finish before re-fetching state
        setTimeout(() => loadProjectState(activeProject.path), 800);
        const msg = info.newCommits === 1
          ? `Pulled 1 new commit: "${info.latestMessage}"`
          : `Pulled ${info.newCommits} new commits`;
        setPullNotice(msg);
        setTimeout(() => setPullNotice(null), 5000);
      }
    });
  }, [activeProject]);

  const loadProjects = async () => {
    if (!window.anchor) return;
    const list = await window.anchor.getProjects();
    setProjects(list);
  };

  const loadProjectState = async (projectPath: string) => {
    if (!window.anchor) return;
    const state = await window.anchor.getProjectState(projectPath);
    setProjectState(state);
  };

  const openProject = async () => {
    if (!window.anchor) return;
    const project = await window.anchor.openProject();
    if (project) {
      await loadProjects();
      setActiveProject(project);
      setView("dashboard");
      setHasSeenWelcome(true);
      // Prompt for a friendly name — folder name is rarely what you want
      setNamePrompt({ path: project.path, defaultName: project.name });
    }
  };

  const selectProject = async (project: Project) => {
    if (!window.anchor) return;
    try {
      const info = await window.anchor.reopenProject(project.path);
      const full = await window.anchor.getProjectState(project.path);
      setActiveProject({ ...project, ...info });
      setProjectState(full);
      setView("dashboard");
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg.includes("not found")) {
        showError(`Folder not found: "${project.path}". Was it moved or deleted?`);
      } else {
        showError(`Could not open project: ${msg}`);
      }
    }
  };

  const removeProject = async (projectPath: string) => {
    if (!window.anchor) return;
    await window.anchor.removeProject(projectPath);
    if (activeProject?.path === projectPath) {
      setActiveProject(null);
      setProjectState(null);
    }
    loadProjects();
  };

  const renameProject = async (projectPath: string, newName: string) => {
    await window.anchor?.renameProject(projectPath, newName);
    setProjects((prev) =>
      prev.map((p) => (p.path === projectPath ? { ...p, displayName: newName, name: newName } : p))
    );
    if (activeProject?.path === projectPath) {
      setActiveProject((prev) => prev ? { ...prev, displayName: newName, name: newName } : null);
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* Sidebar */}
      <aside style={{
        width: 220, background: "var(--bg-1)", borderRight: "1px solid var(--border)",
        display: "flex", flexDirection: "column", flexShrink: 0,
      }}>
        <div className="titlebar-drag" style={{ padding: "40px 16px 0", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="2"/><path d="M12 7v14M5 14H2l10 7 10-7h-3"/><path d="M5 14a7 7 0 0014 0"/></svg>
            <span style={{ fontSize: 16, fontWeight: 700 }}>Anchor</span>
          </div>
        </div>

        <nav className="titlebar-no-drag" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, padding: "0 8px" }}>
          <NavItem icon="projects" label="Projects" active={view === "projects" || view === "welcome"} onClick={() => setView(projects.length === 0 ? "welcome" : "projects")} />
          <NavItem icon="welcome" label="How it works" active={false} onClick={() => setView("welcome")} />

          {activeProject && (
            <>
              <div style={{ height: 1, background: "var(--border)", margin: "8px 8px" }} />
              <div style={{ padding: "4px 12px", fontSize: 11, color: "var(--text-2)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {activeProject.displayName || activeProject.name}
              </div>
              <NavItem icon="vision" label="Vision" active={view === "vision"} onClick={() => setView("vision")} />
              <NavItem icon="dashboard" label="Dashboard" active={view === "dashboard"} onClick={() => setView("dashboard")} />
              <NavItem icon="decisions" label="Decisions" active={view === "decisions"} onClick={() => setView("decisions")} />
              <NavItem icon="phases" label="Phases" active={view === "phases"} onClick={() => setView("phases")} />
              <NavItem icon="export" label="Switch Tools" active={view === "export"} onClick={() => setView("export")} />
              <NavItem icon="editor" label="Editor" active={view === "editor"} onClick={() => setView("editor")} />
              <NavItem icon="push" label="Push" active={view === "push"} onClick={() => setView("push")} />
              <NavItem icon="timeline" label="Timeline" active={view === "timeline"} onClick={() => setView("timeline")} />
              <NavItem icon="notes" label="AGENTS.md" active={view === "agents"} onClick={() => setView("agents")} />
              <NavItem icon="portability" label="Portability" active={view === "portability"} onClick={() => setView("portability")} />
            </>
          )}
        </nav>

        <div className="titlebar-no-drag" style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--text-2)" }}>
          <InstallButton />
          <div style={{ marginTop: 8 }}>v0.1.0 · bringthecode.dev</div>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: "auto", padding: "32px 40px" }}>
        {namePrompt && (
          <NamePromptModal
            defaultName={namePrompt.defaultName}
            onConfirm={async (name) => {
              if (name !== namePrompt.defaultName) {
                await renameProject(namePrompt.path, name);
              }
              setNamePrompt(null);
            }}
          />
        )}
        {pullNotice && (
          <div style={{
            position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)",
            background: "var(--bg-2)", border: "1px solid var(--accent)",
            borderRadius: 8, padding: "8px 16px", fontSize: 12, color: "var(--accent)",
            zIndex: 100, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}>
            <span>↓</span> {pullNotice}
          </div>
        )}
        {errorToast && (
          <div style={{
            position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)",
            background: "var(--bg-2)", border: "1px solid #e05252",
            borderRadius: 8, padding: "8px 16px", fontSize: 12, color: "#e05252",
            zIndex: 100, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            maxWidth: 480, textAlign: "center",
          }}>
            ⚠ {errorToast}
          </div>
        )}
        {view === "welcome" && <WelcomeView onOpen={openProject} onSkip={() => setView("projects")} />}
        {view === "projects" && <ProjectsView projects={projects} onOpen={openProject} onSelect={selectProject} onRemove={removeProject} onRename={renameProject} />}
        {view === "vision" && activeProject && <VisionView project={activeProject} />}
        {view === "dashboard" && activeProject && projectState && <DashboardView project={activeProject} state={projectState} onRefresh={() => loadProjectState(activeProject.path)} onGoVision={() => setView("vision")} />}
        {view === "decisions" && activeProject && projectState && <DecisionsView project={activeProject} decisions={projectState.decisions || []} onRefresh={() => loadProjectState(activeProject.path)} />}
        {view === "phases" && activeProject && projectState && <PhasesView project={activeProject} phases={projectState.phases || []} onRefresh={() => loadProjectState(activeProject.path)} />}
        {view === "export" && activeProject && <ExportView project={activeProject} />}
        {view === "editor" && activeProject && <EditorView project={activeProject} projectState={projectState} />}
        {view === "push" && activeProject && <PushView project={activeProject} />}
        {view === "timeline" && activeProject && <TimelineView project={activeProject} />}
        {view === "agents" && activeProject && <AgentsView project={activeProject} />}
        {view === "portability" && activeProject && <PortabilityView project={activeProject} />}
      </main>
    </div>
  );
}

// === Nav Item ===
function NamePromptModal({ defaultName, onConfirm }: { defaultName: string; onConfirm: (name: string) => void }) {
  const [name, setName] = useState(defaultName);
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div className="card" style={{ width: 400, padding: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Name this project</h2>
        <p style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 20 }}>
          Give it a friendly name — this is what Anchor and AGENTS.md will use.
        </p>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && name.trim() && onConfirm(name.trim())}
          style={{
            width: "100%", padding: "9px 12px", borderRadius: 6,
            border: "1px solid var(--border)", background: "var(--bg-0)",
            color: "var(--text-0)", fontSize: 14, marginBottom: 16,
            boxSizing: "border-box" as const,
          }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn" onClick={() => onConfirm(defaultName)}>Skip</button>
          <button className="btn btn-primary" onClick={() => name.trim() && onConfirm(name.trim())}>
            Save name →
          </button>
        </div>
      </div>
    </div>
  );
}

function InstallButton() {
  const [state, setState] = useState<"idle" | "done" | "error">("idle");

  const install = async () => {
    const result = await window.anchor?.installApp?.();
    if (result?.success) {
      setState("done");
      setTimeout(() => setState("idle"), 4000);
    } else {
      setState("error");
      setTimeout(() => setState("idle"), 4000);
    }
  };

  return (
    <button
      onClick={install}
      title="Add Anchor to your Dock / Desktop"
      style={{
        width: "100%", background: "none", border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)", padding: "6px 10px", cursor: "pointer",
        fontSize: 11, color: state === "done" ? "var(--accent)" : state === "error" ? "var(--red)" : "var(--text-2)",
        display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s",
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--border-hover)")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M8 2v8M5 7l3 3 3-3"/><path d="M2 13h12"/>
      </svg>
      {state === "done" ? "Added to Dock ✓" : state === "error" ? "Try manually" : "Add to Dock / Desktop"}
    </button>
  );
}

const NAV_ICONS: Record<string, string> = {
  projects:    `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M1 3.5A1.5 1.5 0 012.5 2h3.764c.958 0 1.76.56 2.311 1.184C9.175 3.768 9.75 4 10.5 4H13.5A1.5 1.5 0 0115 5.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z"/></svg>`,
  welcome:     `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 11v-1M8 7a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" strokeLinecap="round"/></svg>`,
  vision:      `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 3C4 3 1 8 1 8s3 5 7 5 7-5 7-5-3-5-7-5z"/><circle cx="8" cy="8" r="2" fill="currentColor" stroke="none"/></svg>`,
  dashboard:   `<svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>`,
  decisions:   `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4h12M2 8h8M2 12h5"/></svg>`,
  brain:       `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4h12M2 8h8M2 12h5"/></svg>`,
  phases:      `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 5v3.5l2 2" strokeLinecap="round"/></svg>`,
  phase:       `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 5v3.5l2 2" strokeLinecap="round"/></svg>`,
  snapshots:   `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="12" height="9" rx="1"/><path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1"/><circle cx="8" cy="8.5" r="2"/></svg>`,
  export:      `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 8h10M9 4l4 4-4 4"/></svg>`,
  editor:      `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 2l3 3-8 8H3v-3L11 2z"/></svg>`,
  push:        `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 11V3M5 6l3-3 3 3"/><path d="M3 13h10"/></svg>`,
  timeline:    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="4" cy="4" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="8" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/><path d="M7 4h6M7 8h4M7 12h5"/></svg>`,
  portability: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="5" width="12" height="8" rx="1"/><path d="M5 5V4a3 3 0 016 0v1"/></svg>`,
  stack:       `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 5l6-3 6 3-6 3-6-3zM2 8l6 3 6-3M2 11l6 3 6-3"/></svg>`,
  notes:       `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="2" width="10" height="12" rx="1"/><path d="M6 6h4M6 9h4M6 12h2"/></svg>`,
  tools:       `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 13l3-3m0 0a4 4 0 105.66-5.66A4 4 0 006 10z" strokeLinecap="round"/></svg>`,
  lovable:     `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 13s-6-4-6-7.5a3.5 3.5 0 017 0 3.5 3.5 0 017 0C16 9 10 13 8 13z"/></svg>`,
  claude:      `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6"/><path d="M6 9.5S6.8 11 8 11s2-1.5 2-1.5M6.5 6.5h.01M9.5 6.5h.01" strokeLinecap="round"/></svg>`,
  cursor:      `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l9 6-5 1-2 5z"/></svg>`,
  windsurf:    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 13c3-6 8-10 12-9-2 4-8 7-12 9z"/></svg>`,
  bolt:        `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M9 2L4 9h4l-1 5 5-7H8z"/></svg>`,
};

function NavIcon({ id }: { id: string }) {
  const svg = NAV_ICONS[id] || NAV_ICONS.dashboard;
  return (
    <span
      style={{ width: 16, height: 16, display: "inline-flex", flexShrink: 0, opacity: 0.85 }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function NavItem({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 10, width: "100%",
      padding: "7px 12px", border: "none", borderRadius: "var(--radius-sm)",
      background: active ? "var(--accent-bg)" : "transparent",
      color: active ? "var(--accent)" : "var(--text-2)",
      cursor: "pointer", fontSize: 13, fontWeight: active ? 600 : 400, textAlign: "left",
    }}>
      <NavIcon id={icon} />
      <span>{label}</span>
    </button>
  );
}

// === Welcome / Onboarding ===
function WelcomeView({ onOpen, onSkip }: { onOpen: () => void; onSkip: () => void }) {
  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{ fontSize: 56, marginBottom: 12, color: "var(--accent)" }}><svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="5" r="2"/><path d="M12 7v14M5 14H2l10 7 10-7h-3"/><path d="M5 14a7 7 0 0014 0"/></svg></div>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Welcome to Anchor</h1>
        <p style={{ fontSize: 15, color: "var(--text-2)", lineHeight: 1.6 }}>
          Your projects belong to you — not your platform.<br/>
          Anchor keeps your context, decisions, and momentum no matter what AI coding tool you use.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 16 }}>Before you start — one-time setup</h2>

        <Step number={1} title="Connect your project to GitHub">
          <p>Anchor works with any project that has a GitHub repo. If you're using <strong>Lovable</strong>, <strong>Bolt</strong>, or <strong>Replit</strong>, go to your project settings and connect it to GitHub. Most platforms have a one-click GitHub integration.</p>
          <Platforms />
        </Step>

        <Step number={2} title="Clone the repo to your computer">
          <p>Open Terminal (you only need to do this once per project) and run:</p>
          <CodeBlock>git clone https://github.com/YOUR-USERNAME/YOUR-PROJECT.git</CodeBlock>
          <p style={{ fontSize: 12, color: "var(--text-2)", marginTop: 6 }}>
            Replace YOUR-USERNAME and YOUR-PROJECT with your GitHub username and repo name. Run this in Terminal from whatever folder you want — Documents, Desktop, anywhere.
          </p>
        </Step>

        <Step number={3} title="Open the folder in Anchor">
          <p>Click the button below and navigate to the folder you just cloned. That's it — Anchor will automatically detect your tech stack, read your git history, and start watching for changes.</p>
        </Step>

        <Step number={4} title="Keep building — Anchor stays in sync">
          <p>Anchor automatically pulls from GitHub every 2 minutes. So when you make changes in Lovable or any other tool, Anchor sees them automatically. No manual syncing needed.</p>
        </Step>
      </div>

      <div className="card" style={{ padding: 24, background: "var(--accent-bg)", borderColor: "var(--accent)", marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, marginBottom: 8 }}>How it works with each platform</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13, color: "var(--text-1)" }}>
          <div><strong>Lovable / Bolt / Replit:</strong> Connect to GitHub in their settings → clone locally → open in Anchor</div>
          <div><strong>Cursor / VS Code:</strong> Your project is already local — just open the folder in Anchor</div>
          <div><strong>Claude Code:</strong> Works in your terminal on local files — just open the same folder in Anchor</div>
          <div><strong>Windsurf:</strong> Same as Cursor — open your local project folder</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 24 }}>
        <button className="btn btn-primary" style={{ padding: "12px 32px", fontSize: 15 }} onClick={onOpen}>
          Open a Project Folder
        </button>
        <button className="btn" onClick={onSkip}>I'll do this later</button>
      </div>
    </div>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 14, marginBottom: 20 }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%", background: "var(--accent)",
        color: "white", display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 14, fontWeight: 700, flexShrink: 0, marginTop: 2,
      }}>{number}</div>
      <div style={{ flex: 1 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{title}</h3>
        <div style={{ fontSize: 13, color: "var(--text-1)", lineHeight: 1.6 }}>{children}</div>
      </div>
    </div>
  );
}

function Platforms() {
  const platforms = [
    { name: "Lovable", emoji: "" },
    { name: "Bolt", emoji: "" },
    { name: "Replit", emoji: "" },
    { name: "Cursor", emoji: "" },
    { name: "Claude Code", emoji: "" },
    { name: "Windsurf", emoji: "" },
    { name: "VS Code", emoji: "" },
  ];
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
      {platforms.map((p) => (
        <span key={p.name} className="badge badge-accent" style={{ fontSize: 12, padding: "4px 10px" }}>
          {p.name}
        </span>
      ))}
    </div>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    const extractText = (node: React.ReactNode): string => {
      if (typeof node === "string") return node;
      if (typeof node === "number") return String(node);
      if (Array.isArray(node)) return node.map(extractText).join("");
      if (React.isValidElement(node)) return extractText((node.props as any).children);
      return "";
    };
    const text = extractText(children);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{ position: "relative", margin: "8px 0" }}>
      <pre style={{
        background: "var(--bg-0)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)", padding: "10px 14px", paddingRight: 40,
        fontSize: 13, fontFamily: "'SF Mono', 'Fira Code', monospace",
        color: "var(--accent)", overflowX: "auto", margin: 0,
      }}>{children}</pre>
      <button
        onClick={copy}
        title="Copy"
        style={{
          position: "absolute", top: 6, right: 6,
          background: "none", border: "none", cursor: "pointer",
          color: copied ? "var(--accent)" : "var(--text-2)",
          padding: 4, borderRadius: 4, display: "flex", alignItems: "center",
          transition: "color 0.15s",
        }}
      >
        {copied
          ? <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 8l4 4 8-8" strokeLinecap="round"/></svg>
          : <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="5" width="9" height="9" rx="1"/><path d="M11 5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v7a1 1 0 001 1h2"/></svg>
        }
      </button>
    </div>
  );
}

// === Projects View (with rename/delete) ===
function ProjectsView({ projects, onOpen, onSelect, onRemove, onRename }: {
  projects: any[]; onOpen: () => void; onSelect: (p: any) => void;
  onRemove: (path: string) => void; onRename: (path: string, name: string) => void;
}) {
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const startRename = (p: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingPath(p.path);
    setEditName(p.displayName || p.name);
  };

  const saveRename = (path: string) => {
    if (editName.trim()) onRename(path, editName.trim());
    setEditingPath(null);
  };

  const handleDelete = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDelete === path) {
      onRemove(path);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(path);
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Projects</h1>
        <button className="btn btn-primary" onClick={onOpen}>+ Open Project</button>
      </div>

      {projects.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 60 }}>
          <div style={{ marginBottom: 16, opacity: 0.3 }}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="5" r="2"/><path d="M12 7v14M5 14H2l10 7 10-7h-3"/><path d="M5 14a7 7 0 0014 0"/></svg></div>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>No projects yet</h2>
          <p style={{ color: "var(--text-2)", marginBottom: 20 }}>Open a project folder to get started</p>
          <button className="btn btn-primary" onClick={onOpen}>Open Project</button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {projects.map((p) => (
            <div key={p.path} className="card" style={{ cursor: "pointer", padding: 16 }} onClick={() => onSelect(p)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  {editingPath === p.path ? (
                    <div style={{ display: "flex", gap: 8 }} onClick={(e) => e.stopPropagation()}>
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveRename(p.path)}
                        autoFocus
                        style={{ flex: 1, padding: "4px 8px", fontSize: 14 }}
                      />
                      <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => saveRename(p.path)}>Save</button>
                      <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setEditingPath(null)}>Cancel</button>
                    </div>
                  ) : (
                    <>
                      <strong style={{ fontSize: 15 }}>{p.displayName || p.name}</strong>
                      <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>{p.path}</div>
                    </>
                  )}
                </div>

                {editingPath !== p.path && (
                  <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                    <button className="btn" style={{ padding: "4px 10px", fontSize: 11 }} onClick={(e) => startRename(p, e)}>
                      Rename
                    </button>
                    <button
                      className="btn"
                      style={{
                        padding: "4px 10px", fontSize: 11,
                        borderColor: confirmDelete === p.path ? "var(--red)" : undefined,
                        color: confirmDelete === p.path ? "var(--red)" : undefined,
                      }}
                      onClick={(e) => handleDelete(p.path, e)}
                    >
                      {confirmDelete === p.path ? "Click to confirm" : "Remove"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// === Dashboard View ===
function DashboardView({ project, state, onRefresh, onGoVision }: { project: any; state: any; onRefresh: () => void; onGoVision: () => void }) {
  const [recentCommits, setRecentCommits] = useState<any[]>([]);
  const [hasVision, setHasVision] = useState<boolean | null>(null);

  const loadCommits = async () => {
    try {
      const log = await window.anchor.getGitLog(project.path);
      setRecentCommits((log || []).slice(0, 5));
    } catch {}
  };

  useEffect(() => {
    loadCommits();
    // Check if vision has been set
    window.anchor.readFile(project.path, "AGENTS.md").then((text: string | null) => {
      if (text) {
        const hasReal = text.includes("## What this project is") &&
          !text.includes("⚠️ **Vision not set.**") &&
          !text.includes("Vision not set");
        setHasVision(hasReal);
      } else {
        setHasVision(false);
      }
    }).catch(() => setHasVision(false));

    if (!window.anchor?.onProjectPulled) return;
    window.anchor.onProjectPulled((info: any) => {
      if (info.projectPath === project.path) loadCommits();
    });
  }, [project.path]);

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>{project.displayName || project.name}</h1>

      {hasVision === false && (
        <div style={{
          background: "rgba(74,159,173,0.08)", border: "1px solid var(--accent)",
          borderRadius: "var(--radius)", padding: "14px 18px", marginBottom: 20,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)", marginBottom: 3 }}>
              Vision interview not done
            </div>
            <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5 }}>
              AI tools are missing context about what this product is and who it's for. The Vision Interview takes 2 minutes and makes a big difference.
            </div>
          </div>
          <button className="btn btn-primary" style={{ fontSize: 12, padding: "6px 14px", flexShrink: 0 }} onClick={onGoVision}>
            Start interview →
          </button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
        <StatCard label="Decisions" value={state.decisions?.length || 0} icon="decisions" />
        <StatCard label="Phases" value={state.phases?.length || 0} icon="phases" />
        <StatCard label="Snapshots" value={state.snapshots?.length || 0} icon="snapshots" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="card">
          <h3 style={{ fontSize: 14, color: "var(--text-2)", marginBottom: 12 }}>Tech Stack</h3>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[...(state.stack?.frameworks || []), ...(state.stack?.languages || [])].map((t: string) => (
              <span key={t} className="badge badge-accent">{t}</span>
            ))}
            {(state.stack?.databases || []).map((t: string) => (
              <span key={t} className="badge badge-green">{t}</span>
            ))}
          </div>
        </div>
        <div className="card">
          <h3 style={{ fontSize: 14, color: "var(--text-2)", marginBottom: 12 }}>Git</h3>
          <p style={{ fontSize: 13 }}>Branch: <strong>{state.git?.branch || "—"}</strong></p>
          <p style={{ fontSize: 13, color: "var(--text-2)" }}>
            {state.git?.modified?.length || 0} modified · {state.git?.untracked?.length || 0} untracked
          </p>
          <p style={{ fontSize: 11, color: "var(--text-2)", marginTop: 8 }}>Auto-syncing from GitHub every 30s</p>
        </div>
      </div>
      {recentCommits.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3 style={{ fontSize: 14, color: "var(--text-2)", marginBottom: 12 }}>Recent Activity</h3>
          {recentCommits.map((c: any) => (
            <div key={c.hash} style={{ padding: "6px 0", fontSize: 13, borderBottom: "1px solid var(--border)", display: "flex", gap: 8 }}>
              <span style={{ color: "var(--text-2)", flexShrink: 0 }}>{new Date(c.date).toLocaleTimeString()}</span>
              <span>{c.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ opacity: 0.5 }}><NavIcon id={icon} /></span>
      <div>
        <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
        <div style={{ fontSize: 12, color: "var(--text-2)" }}>{label}</div>
      </div>
    </div>
  );
}

// === Decisions View ===
function DecisionsView({ project, decisions, onRefresh }: { project: any; decisions: any[]; onRefresh: () => void }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [category, setCategory] = useState("other");

  const addDecision = async () => {
    if (!title || !desc) return;
    await window.anchor.addDecision(project.path, { title, description: desc, reasoning, category, tags: [] });
    setTitle(""); setDesc(""); setReasoning(""); setCategory("other");
    onRefresh();
  };

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Decisions</h1>
      <p style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 24 }}>
        Record the important choices you make while building. These get included when you switch tools so the AI knows what you decided and why.
      </p>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Record a Decision</h3>
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <label className="label">What did you decide?</label>
            <input placeholder='e.g. "Use Supabase for auth"' value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: "100%" }} />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea placeholder="What exactly was decided? What does it affect?" value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} style={{ width: "100%", resize: "vertical" }} />
          </div>
          <div>
            <label className="label">Why? (helps the AI understand your reasoning)</label>
            <input placeholder='e.g. "Needed row-level security and Stripe already had a Supabase integration"' value={reasoning} onChange={(e) => setReasoning(e.target.value)} style={{ width: "100%" }} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label className="label">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: "100%" }}>
                {["architecture", "technology", "design", "api", "database", "deployment", "security", "performance", "other"].map((c) => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button className="btn btn-primary" onClick={addDecision}>Add Decision</button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {decisions.map((d: any) => (
          <div key={d.id} className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <strong style={{ fontSize: 14 }}>{d.title}</strong>
              <span className="badge badge-accent">{d.category}</span>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-1)", marginBottom: 4 }}>{d.description}</p>
            {d.reasoning && <p style={{ fontSize: 12, color: "var(--text-2)" }}>{d.reasoning}</p>}
          </div>
        ))}
        {decisions.length === 0 && (
          <div style={{ textAlign: "center", padding: 32, color: "var(--text-2)" }}>
            <p>No decisions recorded yet.</p>
            <p style={{ fontSize: 12, marginTop: 4 }}>Every choice you record here gets included when you export context to a new tool.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// === Phases View ===
function PhasesView({ project, phases, onRefresh }: { project: any; phases: any[]; onRefresh: () => void }) {
  const completePhase = async (phaseId: string) => {
    await window.anchor.completePhase(project.path, phaseId);
    onRefresh();
  };

  const rollback = async (phaseId: string) => {
    if (confirm("Roll back to this phase? A safety snapshot will be created first.")) {
      await window.anchor.rollbackToPhase(project.path, phaseId);
      onRefresh();
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Phases</h1>
      <p style={{ color: "var(--text-2)", fontSize: 13, marginBottom: 24 }}>
        Based on your <strong>plan.md</strong> file. Complete phases to create snapshots you can roll back to if something goes wrong.
      </p>

      {phases.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          
          <h3 style={{ fontSize: 16, marginBottom: 8 }}>No phases found</h3>
          <p style={{ color: "var(--text-2)", fontSize: 13, maxWidth: 400, margin: "0 auto", lineHeight: 1.6 }}>
            Create a <strong>plan.md</strong> file in your project root with headers for each phase. Anchor will automatically detect them.
          </p>
          <CodeBlock>{"# Phase 1: Setup\n- Initialize project\n- Set up database\n\n# Phase 2: Core Features\n- Build user auth\n- Add dashboard\n\n# Phase 3: Polish\n- Responsive design\n- Error handling"}</CodeBlock>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {phases.map((p: any) => (
            <div key={p.id} className="card" style={{ padding: 16, borderLeft: `3px solid ${p.status === "completed" ? "var(--green)" : p.status === "active" ? "var(--accent)" : "var(--border)"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>
                    {p.status === "completed" ? "✓" : p.status === "active" ? "●" : "○"}
                  </span>
                  <div>
                    <strong style={{ fontSize: 14 }}>{p.title}</strong>
                    {p.description && <p style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>{p.description.slice(0, 120)}</p>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {p.status === "active" && <button className="btn btn-primary" onClick={() => completePhase(p.id)}>✓ Complete</button>}
                  {p.status === "completed" && <button className="btn" onClick={() => rollback(p.id)}>↩ Rollback</button>}
                </div>
              </div>
              {p.completedAt && <p style={{ fontSize: 11, color: "var(--text-2)", marginTop: 6, marginLeft: 28 }}>Completed {new Date(p.completedAt).toLocaleString()}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// === Export View ===
// === Vision View ===
const CLAUDE_MODELS = [
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", desc: "Fast & cheap — good for Vision interview" },
  { id: "claude-sonnet-4-20250514",  label: "Sonnet 4",  desc: "Balanced — recommended for most tasks" },
  { id: "claude-opus-4-20250514",    label: "Opus 4",    desc: "Most capable — best for complex code edits" },
];

// Shared hook for model preference
function useModelPreference(): [string, (m: string) => void] {
  const [model, setModelState] = useState("claude-sonnet-4-20250514");
  useEffect(() => {
    window.anchor?.getSetting?.("claude-model").then((m: string | null) => {
      if (m) setModelState(m);
    });
  }, []);
  const setModel = (m: string) => {
    setModelState(m);
    window.anchor?.setSetting?.("claude-model", m);
  };
  return [model, setModel];
}

function ModelPicker({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
      {CLAUDE_MODELS.map(m => (
        <button
          key={m.id}
          onClick={() => onChange(m.id)}
          title={m.desc}
          style={{
            padding: "5px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer",
            border: `1px solid ${value === m.id ? "var(--accent)" : "var(--border)"}`,
            background: value === m.id ? "var(--accent-bg)" : "var(--bg-2)",
            color: value === m.id ? "var(--accent)" : "var(--text-2)",
            transition: "all 0.15s",
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}


function ChatMarkdown({ text }: { text: string }) {
  // Split into blocks: numbered lists, bullet lists, paragraphs
  const blocks = text.split(/\n{2,}/);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {blocks.map((block, i) => {
        // Numbered list
        if (/^\d+\.\s/.test(block.trim())) {
          const items = block.trim().split(/\n(?=\d+\.\s)/);
          return (
            <ol key={i} style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
              {items.map((item, j) => (
                <li key={j}><InlineMarkdown text={item.replace(/^\d+\.\s/, "")} /></li>
              ))}
            </ol>
          );
        }
        // Bullet list
        if (/^[-*]\s/.test(block.trim())) {
          const items = block.trim().split(/\n(?=[-*]\s)/);
          return (
            <ul key={i} style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 4 }}>
              {items.map((item, j) => (
                <li key={j} style={{ listStyle: "disc" }}><InlineMarkdown text={item.replace(/^[-*]\s/, "")} /></li>
              ))}
            </ul>
          );
        }
        // Lines with embedded bullets (- item on same block)
        if (block.includes("\n- ") || block.includes("\n* ")) {
          const lines = block.split("\n");
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {lines.map((line, j) => {
                if (/^[-*]\s/.test(line.trim())) {
                  return <div key={j} style={{ paddingLeft: 12 }}>· <InlineMarkdown text={line.replace(/^[-*]\s/, "")} /></div>;
                }
                return line.trim() ? <div key={j}><InlineMarkdown text={line} /></div> : null;
              })}
            </div>
          );
        }
        // Normal paragraph
        return block.trim() ? (
          <div key={i}><InlineMarkdown text={block.trim()} /></div>
        ) : null;
      })}
    </div>
  );
}

function InlineMarkdown({ text }: { text: string }) {
  // Handle **bold** inline
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**")
          ? <strong key={i}>{part.slice(2, -2)}</strong>
          : <span key={i}>{part}</span>
      )}
    </>
  );
}

function VisionDoneScreen({ project, visionText }: { project: any; visionText: string }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(visionText);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const full = await window.anchor.readFile(project.path, "AGENTS.md");
      const updated = full.replace(/## What this project is[\s\S]*?(?=\n## |\n---|$)/, text.trimEnd());
      await window.anchor.writeFile(project.path, "AGENTS.md", updated);
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 3000);
    } catch {}
    setSaving(false);
  };

  const parse = (t: string) => {
    const get = (header: string) => {
      const m = t.match(new RegExp("### " + header + "\\n([\\s\\S]*?)(?=\\n###|$)"));
      return m ? m[1].trim() : "";
    };
    const titleMatch = t.match(/\*\*(.+?)\*\*/);
    return {
      title: titleMatch ? titleMatch[1] : "",
      what: get("What it is"),
      who: get("Who it\'s for"),
      feel: get("How it should feel"),
      notThis: get("What it is NOT"),
      current: get("Where we are now"),
      success: get("What success looks like"),
    };
  };

  const v = parse(text);

  const Field = ({ label, value }: { label: string; value: string }) => (
    <div style={{ paddingBottom: 16, borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--accent)", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: "var(--text-1)", lineHeight: 1.6 }}>{value || <span style={{ color: "var(--text-2)", fontStyle: "italic" }}>Not set</span>}</div>
    </div>
  );

  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      <div style={{ background: "var(--accent-bg)", border: "1px solid var(--accent)", borderRadius: "var(--radius)", padding: "12px 16px", marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color: "var(--accent)", fontWeight: 600, fontSize: 13 }}>Vision saved to AGENTS.md</span>
        {saved && <span style={{ color: "var(--accent)", fontSize: 12 }}>Changes saved ✓</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>{v.title || "Your Vision"}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          {editing ? (
            <>
              <button className="btn" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => { setText(visionText); setEditing(false); }}>Cancel</button>
              <button className="btn btn-primary" style={{ fontSize: 12, padding: "4px 10px" }} onClick={save} disabled={saving}>{saving ? "Saving..." : "Save changes"}</button>
            </>
          ) : (
            <button className="btn" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => setEditing(true)}>Edit</button>
          )}
        </div>
      </div>
      {editing ? (
        <textarea value={text} onChange={e => setText(e.target.value)} style={{ width: "100%", minHeight: "60vh", padding: 16, background: "var(--bg-2)", border: "1px solid var(--accent)", borderRadius: "var(--radius)", color: "var(--text-0)", fontSize: 12, fontFamily: "monospace", lineHeight: 1.6, resize: "vertical", boxSizing: "border-box" as const }} />
      ) : (
        <div className="card" style={{ padding: 20 }}>
          <Field label="What it is" value={v.what} />
          <Field label="Who it's for" value={v.who} />
          <Field label="How it should feel" value={v.feel} />
          <Field label="What it is NOT" value={v.notThis} />
          <Field label="Where we are now" value={v.current} />
          <Field label="What success looks like" value={v.success} />
        </div>
      )}
    </div>
  );
}


function VisionView({ project }: { project: any }) {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [done, setDone] = useState(false);
  const [savedVisionText, setSavedVisionText] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [keyStatus, setKeyStatus] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [started, setStarted] = useState(false);
  const [, setModel] = useModelPreference(); // keep setter so Vision uses saved model in Editor
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.anchor?.getSetting?.("anthropic-api-key").then((k: string | null) => {
      if (k) { setApiKey(k); setKeyInput(k); setKeyStatus("valid"); }
    });
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  const SYSTEM = `You are Anchor's Vision Assistant helping interview a user to write a product vision into AGENTS.md. Ask 1-2 questions at a time, conversationally. Cover: what it does, who it's for, how it should feel, what it's NOT, current build state, definition of success. After 5-8 exchanges offer to write it. When confirmed respond ONLY with this JSON block:
\`\`\`vision-json
{"title":"","what":"","who":"","feel":"","notThis":"","currentState":"","success":""}
\`\`\``;

  const validateKey = async () => {
    if (!keyInput.trim()) return;
    setKeyStatus("checking");
    const result = await window.anchor?.validateApiKey?.(keyInput.trim());
    if (result?.valid) {
      setApiKey(keyInput.trim());
      await window.anchor?.setSetting?.("anthropic-api-key", keyInput.trim());
      setKeyStatus("valid");
    } else {
      setKeyStatus("invalid");
    }
  };

  const startConversation = async () => {
    setStarted(true);
    setThinking(true);
    try {
      const data = await window.anchor.claudeChat({
        apiKey,
        system: SYSTEM,
        messages: [{ role: "user", content: `My project is called "${project.name}". Let's define its vision.` }],
        maxTokens: 1000,
        model: "claude-haiku-4-5-20251001",
      });
      if (data.error) throw new Error(data.error.message || "API error");
      setMessages([{ role: "assistant", content: data.content?.[0]?.text || "" }]);
    } catch (e: any) {
      setMessages([{ role: "assistant", content: `Error: ${e.message}` }]);
    }
    setThinking(false);
  };

  const send = async () => {
    if (!input.trim() || thinking) return;
    const userMsg = input.trim();
    setInput("");
    const newMessages = [...messages, { role: "user" as const, content: userMsg }];
    setMessages(newMessages);
    setThinking(true);
    try {
      const data = await window.anchor.claudeChat({ apiKey, model: "claude-haiku-4-5-20251001", system: SYSTEM, messages: newMessages, maxTokens: 1000 });
      if (data.error) throw new Error(data.error.message || "API error");
      const text = data.content?.[0]?.text || "";
      const visionMatch = text.match(/```vision-json\s*([\s\S]*?)```/);
      if (visionMatch) {
        try {
          const vision = JSON.parse(visionMatch[1].trim());
          const visionSection = await writeVisionToAgents(vision);
          setSavedVisionText(visionSection);
          setDone(true);
          setMessages(prev => [...prev, { role: "assistant", content: text }]);
        } catch { setMessages(prev => [...prev, { role: "assistant", content: text }]); }
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: text }]);
      }
    } catch (e: any) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${e.message}` }]);
    }
    setThinking(false);
  };

  const writeVisionToAgents = async (vision: any): Promise<string> => {
    const visionSection = `## What this project is

**${vision.title}**

### What it is
${vision.what}

### Who it's for
${vision.who}

### How it should feel
${vision.feel}

### What it is NOT
${vision.notThis}

### Where we are now
${vision.currentState}

### What success looks like
${vision.success}

`;
    if (window.anchor?.writeVisionSection) {
      await window.anchor.writeVisionSection(project.path, visionSection);
    }
    return visionSection;
  };

  // --- Key setup screen ---
  if (!apiKey || keyStatus !== "valid") {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto", paddingTop: 60 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Product Vision</h1>
        <p style={{ color: "var(--text-2)", fontSize: 13, marginBottom: 24 }}>
          Anchor interviews you about your product and writes context into AGENTS.md — so every AI tool knows what you're building and why.
        </p>
        <div className="card" style={{ padding: 20 }}>
          <p style={{ fontSize: 13, marginBottom: 8 }}>Anthropic API key:</p>
          <input
            type="password"
            placeholder="sk-ant-..."
            value={keyInput}
            onChange={e => { setKeyInput(e.target.value); setKeyStatus("idle"); }}
            onKeyDown={e => e.key === "Enter" && validateKey()}
            style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: `1px solid ${keyStatus === "invalid" ? "var(--red)" : "var(--border)"}`, background: "var(--bg-2)", color: "var(--text-1)", fontSize: 13, marginBottom: 8, boxSizing: "border-box" as const }}
          />
          {keyStatus === "invalid" && <p style={{ color: "var(--red)", fontSize: 12, marginBottom: 8 }}>Invalid key — check and try again</p>}
          {keyStatus === "checking" && <p style={{ color: "var(--text-2)", fontSize: 12, marginBottom: 8 }}>Checking key...</p>}
          <button
            className="btn btn-primary"
            style={{ width: "100%", opacity: keyStatus === "checking" ? 0.6 : 1 }}
            disabled={keyStatus === "checking"}
            onClick={validateKey}
          >
            {keyStatus === "checking" ? "Checking..." : "Verify & Continue →"}
          </button>
        </div>
      </div>
    );
  }

  // --- Not started yet ---
  if (!started) {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto", paddingTop: 60 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Product Vision</h1>
        <p style={{ color: "var(--text-2)", fontSize: 13, marginBottom: 24 }}>
          Anchor will interview you about your product and write the vision into AGENTS.md — takes about 2 minutes.
        </p>
        <button className="btn btn-primary" style={{ fontSize: 14, padding: "10px 24px" }} onClick={startConversation}>
          Start Vision Interview →
        </button>
      </div>
    );
  }

  // --- Done ---
  if (done) {
    return <VisionDoneScreen project={project} visionText={savedVisionText} />;
  }

  // --- Chat ---
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 64px)", maxWidth: 680, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Product Vision</h1>
        <p style={{ color: "var(--text-2)", fontSize: 12 }}>Anchor is interviewing you about your product. Be specific — the more detail, the better the context.</p>
      </div>
      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 12, paddingBottom: 16 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "78%", padding: "10px 14px", borderRadius: 12, fontSize: 13, lineHeight: 1.6,
              background: m.role === "user" ? "var(--accent)" : "var(--bg-2)",
              color: m.role === "user" ? "#fff" : "var(--text-0)",
            }}>
              {m.role === "user" ? m.content : <ChatMarkdown text={m.content} />}
            </div>
          </div>
        ))}
        {thinking && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ padding: "10px 14px", borderRadius: 12, fontSize: 13, background: "var(--bg-2)", color: "var(--text-2)" }}>...</div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {messages.length > 0 && !thinking && (() => {
        const last = messages[messages.length - 1];
        const isReady = last.role === "assistant" &&
          /ready.*write|write.*agents|save.*agents|write.*vision|shall i write|should i write|ready to save/i.test(last.content);
        return isReady ? (
          <div style={{ display: "flex", gap: 8, padding: "8px 0 4px", borderTop: "1px solid var(--border)" }}>
            <button className="btn btn-primary" style={{ fontSize: 13, padding: "8px 20px" }}
              onClick={async () => {
                const msg = "Yes, write it to AGENTS.md now";
                const newMessages = [...messages, { role: "user" as const, content: msg }];
                setMessages(newMessages);
                setThinking(true);
                try {
                  const data = await window.anchor.claudeChat({ apiKey, model: "claude-haiku-4-5-20251001", system: SYSTEM, messages: newMessages, maxTokens: 1000 });
                  if (data.error) throw new Error(data.error.message);
                  const text = data.content?.[0]?.text || "";
                  const visionMatch = text.match(/```vision-json\s*([\s\S]*?)```/);
                  if (visionMatch) {
                    const vision = JSON.parse(visionMatch[1].trim());
                    const section = await writeVisionToAgents(vision);
                    setSavedVisionText(section);
                    setDone(true);
                  } else {
                    setMessages(prev => [...prev, { role: "assistant", content: text }]);
                  }
                } catch (e: any) {
                  setMessages(prev => [...prev, { role: "assistant", content: `Error: ${e.message}` }]);
                }
                setThinking(false);
              }}>
              Yes, write it now →
            </button>
            <button className="btn" style={{ fontSize: 13, padding: "8px 20px" }}
              onClick={async () => {
                const msg = "I want to add something first";
                const newMessages = [...messages, { role: "user" as const, content: msg }];
                setMessages(newMessages);
                setThinking(true);
                try {
                  const data = await window.anchor.claudeChat({ apiKey, model: "claude-haiku-4-5-20251001", system: SYSTEM, messages: newMessages, maxTokens: 1000 });
                  if (data.error) throw new Error(data.error.message);
                  setMessages(prev => [...prev, { role: "assistant", content: data.content?.[0]?.text || "" }]);
                } catch (e: any) {
                  setMessages(prev => [...prev, { role: "assistant", content: `Error: ${e.message}` }]);
                }
                setThinking(false);
              }}>
              I want to add something
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
            <input
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
              placeholder="Type your answer..."
              style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-2)", color: "var(--text-1)", fontSize: 13 }}
            />
            <button className="btn btn-primary" onClick={send} disabled={thinking}>Send</button>
          </div>
        );
      })()}
    </div>
  );
}


function ExportView({ project }: { project: any }) {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshed, setRefreshed] = useState(false);

  const forceRefresh = async () => {
    setRefreshing(true);
    await window.anchor.exportContext(project.path, "agents");
    setRefreshing(false);
    setRefreshed(true);
    setTimeout(() => setRefreshed(false), 3000);
  };

  const tools = [
    { icon: "lovable", name: "Lovable", how: "Open the repo — AGENTS.md is read automatically" },
    { icon: "claude", name: "Claude Code", how: "AGENTS.md is picked up as project context" },
    { icon: "cursor", name: "Cursor", how: "Add AGENTS.md to context or reference in .cursorrules" },
    { icon: "windsurf", name: "Windsurf", how: "AGENTS.md is read on project open" },
    { icon: "bolt", name: "Bolt / v0", how: "Paste contents of AGENTS.md into first message" },
  ];

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Context is always live</h1>
      <p style={{ color: "var(--text-2)", fontSize: 13, marginBottom: 24 }}>
        Anchor maintains <code style={{ color: "var(--accent)" }}>AGENTS.md</code> in your repo root automatically.
        Every decision, phase, and note you log is reflected instantly. Switch tools freely — context travels with the repo.
      </p>

      {/* Live status card */}
      <div className="card" style={{ padding: 20, marginBottom: 20, borderLeft: "3px solid var(--accent)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>AGENTS.md</div>
            <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 12 }}>
              Lives at <code>{project.path}/AGENTS.md</code>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
              <span className="badge badge-green">● Auto-updating</span>
              <span className="badge">Committed with your next push</span>
            </div>
          </div>
          <button className="btn" onClick={forceRefresh} disabled={refreshing}>
            {refreshing ? "Refreshing..." : refreshed ? "✓ Refreshed" : "Force refresh"}
          </button>
        </div>
      </div>

      {/* What gets written */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "var(--text-2)", textTransform: "uppercase" as const, letterSpacing: 1 }}>What's in AGENTS.md</div>
        <div style={{ display: "grid", gap: 8 }}>
          {[
            ["stack", "Tech stack", "Auto-detected from package.json"],
            ["phase", "Current phase", "What's done, what's next"],
            ["brain", "All decisions", "With reasoning — so any tool knows why"],
            ["notes", "Notes", "Bugs, quirks, things to avoid"],
            ["tools", "Per-tool instructions", "Lovable, Claude Code, Cursor, Bolt…"],
          ].map(([icon, title, desc]) => (
            <div key={title as string} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 24, opacity: 0.6 }}><NavIcon id={icon as string} /></span>
              <div>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{title}</span>
                <span style={{ fontSize: 12, color: "var(--text-2)", marginLeft: 8 }}>{desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tool guide */}
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "var(--text-2)", textTransform: "uppercase" as const, letterSpacing: 1 }}>Switching to another tool</div>
      <div style={{ display: "grid", gap: 8 }}>
        {tools.map((t) => (
          <div key={t.name} className="card" style={{ padding: 12, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 28, opacity: 0.7 }}><NavIcon id={t.icon} /></span>
            <div>
              <strong style={{ fontSize: 13 }}>{t.name}</strong>
              <div style={{ fontSize: 12, color: "var(--text-2)" }}>{t.how}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// === Timeline View ===
function TimelineView({ project }: { project: any }) {
  const [commits, setCommits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const log = await window.anchor.getGitLog(project.path);
      setCommits(log || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    load();
    // Refresh when a pull brings new commits
    if (!window.anchor?.onProjectPulled) return;
    window.anchor.onProjectPulled((info: any) => {
      if (info.projectPath === project.path) load();
    });
  }, [project.path]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Timeline</h1>
        <button className="btn" style={{ fontSize: 12, padding: "4px 12px" }} onClick={load}>Refresh</button>
      </div>
      <p style={{ color: "var(--text-2)", fontSize: 13, marginBottom: 24 }}>
        Git history — every commit from every tool, in order.
      </p>
      {loading ? (
        <div style={{ color: "var(--text-2)", fontSize: 13 }}>Loading...</div>
      ) : commits.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-2)" }}>
          <p>No commits yet.</p>
        </div>
      ) : (
        <div style={{ position: "relative", paddingLeft: 28 }}>
          <div style={{ position: "absolute", left: 9, top: 4, bottom: 4, width: 2, background: "var(--border)" }} />
          {commits.map((c) => (
            <div key={c.hash} style={{ position: "relative", paddingBottom: 16, paddingLeft: 20 }}>
              <div style={{
                position: "absolute", left: -24, top: 2, width: 20, height: 20,
                borderRadius: "50%", background: "var(--bg-2)", border: "2px solid var(--border)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10,
                color: "var(--accent)",
              }}>·</div>
              <div style={{ fontSize: 11, color: "var(--text-2)" }}>
                {new Date(c.date).toLocaleString()} · <span style={{ fontFamily: "monospace" }}>{c.hash?.slice(0, 7)}</span>
              </div>
              <div style={{ fontSize: 13, marginTop: 1 }}>{c.message}</div>
              {c.author && <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 1 }}>{c.author}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// === AGENTS.md View ===
function AgentsViewWithEdit({ project }: { project: any }) {
  return <AgentsView project={project} initialEdit={false} showSuccessBanner />;
}

function AgentsView({ project, initialEdit = false, showSuccessBanner = false }: { project: any; initialEdit?: boolean; showSuccessBanner?: boolean }) {
  const [content, setContent] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(initialEdit);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const text = await window.anchor.readFile(project.path, "AGENTS.md");
      if (text !== null) {
        setContent(text);
        setUpdatedAt(new Date());
      }
    } catch {}
  };

  useEffect(() => {
    load();
    // Refresh on pull
    if (!window.anchor?.onProjectPulled) return;
    window.anchor.onProjectPulled((info: any) => {
      if (info.projectPath === project.path) setTimeout(load, 1000);
    });
  }, [project.path]);

  const copy = () => {
    if (!content) return;
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await window.anchor.writeFile(project.path, "AGENTS.md", editText);
      setContent(editText);
      setUpdatedAt(new Date());
      setEditing(false);
    } catch {}
    setSaving(false);
  };

  const startEdit = () => {
    setEditText(content || "");
    setEditing(true);
  };

  return (
    <div>
      {showSuccessBanner && (
        <div style={{ background: "var(--accent-bg)", border: "1px solid var(--accent)", borderRadius: "var(--radius)", padding: "12px 16px", marginBottom: 20, fontSize: 13 }}>
          <strong style={{ color: "var(--accent)" }}>Vision saved.</strong>
          <span style={{ color: "var(--text-2)", marginLeft: 8 }}>AGENTS.md is now written — every AI tool that opens this repo has full context. Edit below if anything needs adjusting.</span>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>AGENTS.md</h1>
          {updatedAt && (
            <p style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>
              Last updated {updatedAt.toLocaleTimeString()} · Auto-updates on every change
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {editing ? (
            <>
              <button className="btn" style={{ fontSize: 12, padding: "4px 12px" }} onClick={() => setEditing(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ fontSize: 12, padding: "4px 12px" }} onClick={save} disabled={saving}>
                {saving ? "Saving..." : "Save changes"}
              </button>
            </>
          ) : (
            <>
              <button className="btn" style={{ fontSize: 12, padding: "4px 12px" }} onClick={load}>Refresh</button>
              <button className="btn" style={{ fontSize: 12, padding: "4px 12px", color: copied ? "var(--accent)" : undefined }} onClick={copy}>
                {copied ? "Copied ✓" : "Copy all"}
              </button>
              <button className="btn" style={{ fontSize: 12, padding: "4px 12px" }} onClick={startEdit}>Edit</button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <textarea
          value={editText}
          onChange={e => setEditText(e.target.value)}
          style={{
            width: "100%", minHeight: "70vh", padding: 16,
            background: "var(--bg-2)", border: "1px solid var(--accent)",
            borderRadius: "var(--radius)", color: "var(--text-0)",
            fontSize: 12, fontFamily: "monospace", lineHeight: 1.6,
            resize: "vertical", boxSizing: "border-box" as const,
          }}
        />
      ) : content === null ? (
        <div style={{ color: "var(--text-2)", fontSize: 13, padding: 20 }}>Loading...</div>
      ) : content === "" ? (
        <div className="card" style={{ color: "var(--text-2)", fontSize: 13, textAlign: "center", padding: 40 }}>
          AGENTS.md hasn't been generated yet. Open a project and make a change.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {/* Render markdown-like sections with visual separation */}
          {content.split("\n").map((line, i) => {
            if (line.startsWith("# ")) return (
              <div key={i} style={{ padding: "14px 20px 6px", fontSize: 15, fontWeight: 700, color: "var(--text-0)", borderBottom: "1px solid var(--border)" }}>
                {line.slice(2)}
              </div>
            );
            if (line.startsWith("## ")) return (
              <div key={i} style={{ padding: "12px 20px 4px", fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>
                {line.slice(3)}
              </div>
            );
            if (line.startsWith("- ") || line.startsWith("* ")) return (
              <div key={i} style={{ padding: "2px 20px 2px 32px", fontSize: 13, color: "var(--text-1)", position: "relative" }}>
                <span style={{ position: "absolute", left: 20, color: "var(--text-2)" }}>·</span>
                {line.slice(2)}
              </div>
            );
            if (line.trim() === "") return <div key={i} style={{ height: 6 }} />;
            return (
              <div key={i} style={{ padding: "2px 20px", fontSize: 13, color: "var(--text-1)" }}>
                {line}
              </div>
            );
          })}
          <div style={{ height: 12 }} />
        </div>
      )}
    </div>
  );
}

// === Portability View ===
function PortabilityView({ project }: { project: any }) {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.anchor.getPortabilityReport(project.path).then((r) => {
      setReport(r);
      setLoading(false);
    });
  }, [project.path]);

  if (loading) return <p style={{ color: "var(--text-2)", padding: 40, textAlign: "center" }}>Analyzing your dependencies...</p>;
  if (!report) return <p>No report available.</p>;

  const scoreColor = report.score >= 80 ? "var(--green)" : report.score >= 50 ? "var(--yellow)" : "var(--red)";

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Portability Report</h1>
      <p style={{ color: "var(--text-2)", fontSize: 13, marginBottom: 24 }}>
        How dependent is your project on specific vendors? Higher score = more portable.
      </p>

      <div className="card" style={{ textAlign: "center", padding: 32, marginBottom: 20 }}>
        <div style={{ fontSize: 56, fontWeight: 800, color: scoreColor }}>{report.score}</div>
        <div style={{ fontSize: 14, color: "var(--text-2)", marginTop: 4 }}>out of 100</div>
        <p style={{ fontSize: 13, color: "var(--text-1)", marginTop: 12, maxWidth: 400, margin: "12px auto 0" }}>{report.summary}</p>
      </div>

      {report.vendorLockIn.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, marginBottom: 12 }}>Vendor Dependencies</h3>
          {report.vendorLockIn.map((v: any, i: number) => (
            <div key={i} style={{ padding: "10px 0", borderBottom: i < report.vendorLockIn.length - 1 ? "1px solid var(--border)" : "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <code style={{ color: "var(--accent)", fontSize: 13 }}>{v.dependency}</code>
                <span style={{ fontSize: 12, color: "var(--text-2)", marginLeft: 8 }}>{v.vendor}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className={`badge badge-${v.risk === "high" ? "red" : v.risk === "medium" ? "yellow" : "green"}`}>{v.risk} risk</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {report.recommendations.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 12 }}>Recommendations</h3>
          {report.recommendations.map((r: string, i: number) => (
            <p key={i} style={{ fontSize: 13, color: "var(--text-1)", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>{r}</p>
          ))}
        </div>
      )}

      {report.vendorLockIn.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 24 }}>
          <span style={{ fontSize: 32 }}>🎉</span>
          <p style={{ fontSize: 14, marginTop: 8 }}>No significant vendor lock-in detected. Your project is highly portable!</p>
        </div>
      )}
    </div>
  );
}
