import { useState, useEffect } from "react";

type View = "projects" | "dashboard" | "decisions" | "phases" | "export" | "timeline" | "portability" | "settings";

interface Project {
  path: string;
  name: string;
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

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (activeProject) {
      loadProjectState(activeProject.path);
    }
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
      setActiveProject(project);
      setView("dashboard");
      loadProjects();
    }
  };

  const selectProject = async (project: Project) => {
    if (!window.anchor) return;
    const full = await window.anchor.openProject();
    if (full) {
      setActiveProject(full);
      setView("dashboard");
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* Sidebar */}
      <aside style={{
        width: 220, background: "var(--bg-1)", borderRight: "1px solid var(--border)",
        display: "flex", flexDirection: "column",
      }}>
        {/* Title bar drag area */}
        <div className="titlebar-drag" style={{ padding: "16px 16px 0", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8 }}>
            <span style={{ fontSize: 22 }}>⚓</span>
            <span style={{ fontSize: 16, fontWeight: 700 }}>Anchor</span>
          </div>
        </div>

        <nav className="titlebar-no-drag" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, padding: "0 8px" }}>
          <NavItem icon="📁" label="Projects" active={view === "projects"} onClick={() => setView("projects")} />

          {activeProject && (
            <>
              <div style={{ height: 1, background: "var(--border)", margin: "8px 8px" }} />
              <div style={{ padding: "4px 12px", fontSize: 11, color: "var(--text-2)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {activeProject.name}
              </div>
              <NavItem icon="📊" label="Dashboard" active={view === "dashboard"} onClick={() => setView("dashboard")} />
              <NavItem icon="🧠" label="Decisions" active={view === "decisions"} onClick={() => setView("decisions")} />
              <NavItem icon="🎯" label="Phases" active={view === "phases"} onClick={() => setView("phases")} />
              <NavItem icon="📦" label="Export" active={view === "export"} onClick={() => setView("export")} />
              <NavItem icon="📜" label="Timeline" active={view === "timeline"} onClick={() => setView("timeline")} />
              <NavItem icon="🔓" label="Portability" active={view === "portability"} onClick={() => setView("portability")} />
            </>
          )}
        </nav>

        <div className="titlebar-no-drag" style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--text-2)" }}>
          v0.1.0 · bringthecode.dev
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflow: "auto", padding: "32px 40px" }}>
        {view === "projects" && (
          <ProjectsView projects={projects} onOpen={openProject} onSelect={selectProject} />
        )}
        {view === "dashboard" && activeProject && projectState && (
          <DashboardView project={activeProject} state={projectState} onRefresh={() => loadProjectState(activeProject.path)} />
        )}
        {view === "decisions" && activeProject && projectState && (
          <DecisionsView project={activeProject} decisions={projectState.decisions || []} onRefresh={() => loadProjectState(activeProject.path)} />
        )}
        {view === "phases" && activeProject && projectState && (
          <PhasesView project={activeProject} phases={projectState.phases || []} onRefresh={() => loadProjectState(activeProject.path)} />
        )}
        {view === "export" && activeProject && (
          <ExportView project={activeProject} />
        )}
        {view === "timeline" && activeProject && projectState && (
          <TimelineView activity={projectState.activity || []} />
        )}
        {view === "portability" && activeProject && (
          <PortabilityView project={activeProject} />
        )}
      </main>
    </div>
  );
}

// === Nav Item ===
function NavItem({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 10, width: "100%",
      padding: "8px 12px", border: "none", borderRadius: "var(--radius-sm)",
      background: active ? "var(--accent-bg)" : "transparent",
      color: active ? "var(--accent)" : "var(--text-2)",
      cursor: "pointer", fontSize: 13, fontWeight: active ? 600 : 400, textAlign: "left",
    }}>
      <span style={{ fontSize: 15 }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

// === Projects View ===
function ProjectsView({ projects, onOpen, onSelect }: { projects: any[]; onOpen: () => void; onSelect: (p: any) => void }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Projects</h1>
        <button className="btn btn-primary" onClick={onOpen}>+ Open Project</button>
      </div>
      {projects.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚓</div>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>No projects yet</h2>
          <p style={{ color: "var(--text-2)", marginBottom: 20 }}>Open a project folder to get started</p>
          <button className="btn btn-primary" onClick={onOpen}>Open Project</button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {projects.map((p) => (
            <div key={p.path} className="card" style={{ cursor: "pointer" }} onClick={() => onSelect(p)}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>⚓ {p.name}</strong>
                <span style={{ fontSize: 12, color: "var(--text-2)" }}>{p.path}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// === Dashboard View ===
function DashboardView({ project, state, onRefresh }: { project: any; state: any; onRefresh: () => void }) {
  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>⚓ {project.name}</h1>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
        <StatCard label="Decisions" value={state.decisions?.length || 0} icon="🧠" />
        <StatCard label="Phases" value={state.phases?.length || 0} icon="🎯" />
        <StatCard label="Snapshots" value={state.snapshots?.length || 0} icon="📸" />
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
        </div>
      </div>
      {state.activity?.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3 style={{ fontSize: 14, color: "var(--text-2)", marginBottom: 12 }}>Recent Activity</h3>
          {state.activity.slice(0, 5).map((a: any) => (
            <div key={a.id} style={{ padding: "6px 0", fontSize: 13, borderBottom: "1px solid var(--border)" }}>
              <span style={{ color: "var(--text-2)", marginRight: 8 }}>{new Date(a.timestamp).toLocaleTimeString()}</span>
              {a.summary}
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
      <span style={{ fontSize: 28 }}>{icon}</span>
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
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Decisions</h1>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Record a Decision</h3>
        <div style={{ display: "grid", gap: 10 }}>
          <input placeholder="Decision title" value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: "100%" }} />
          <textarea placeholder="What was decided?" value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} style={{ width: "100%", resize: "vertical" }} />
          <input placeholder="Why? (reasoning)" value={reasoning} onChange={(e) => setReasoning(e.target.value)} style={{ width: "100%" }} />
          <div style={{ display: "flex", gap: 10 }}>
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ flex: 1 }}>
              {["architecture", "technology", "design", "api", "database", "deployment", "security", "performance", "other"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={addDecision}>Add Decision</button>
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
            {d.reasoning && <p style={{ fontSize: 12, color: "var(--text-2)" }}>Why: {d.reasoning}</p>}
          </div>
        ))}
        {decisions.length === 0 && <p style={{ color: "var(--text-2)" }}>No decisions recorded yet.</p>}
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
    if (confirm("Roll back to this phase? This will create a new branch.")) {
      await window.anchor.rollbackToPhase(project.path, phaseId);
      onRefresh();
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Phases</h1>
      <p style={{ color: "var(--text-2)", fontSize: 13, marginBottom: 24 }}>
        Based on your plan.md — complete phases to create snapshots you can roll back to.
      </p>

      {phases.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <p style={{ color: "var(--text-2)" }}>No plan.md found. Create one in your project root to define phases.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {phases.map((p: any, i: number) => (
            <div key={p.id} className="card" style={{ padding: 16, borderLeft: `3px solid ${p.status === "completed" ? "var(--green)" : p.status === "active" ? "var(--accent)" : "var(--border)"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>
                    {p.status === "completed" ? "✅" : p.status === "active" ? "🔵" : "⚪"}
                  </span>
                  <div>
                    <strong style={{ fontSize: 14 }}>{p.title}</strong>
                    {p.description && <p style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>{p.description.slice(0, 100)}</p>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {p.status === "active" && <button className="btn btn-primary" onClick={() => completePhase(p.id)}>Complete</button>}
                  {p.status === "completed" && <button className="btn" onClick={() => rollback(p.id)}>Rollback</button>}
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
function ExportView({ project }: { project: any }) {
  const [exporting, setExporting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string[]>>({});

  const doExport = async (target: string) => {
    setExporting(target);
    const result = await window.anchor.exportContext(project.path, target);
    setResults((prev) => ({ ...prev, [target]: result.files }));
    setExporting(null);
  };

  const doExportAll = async () => {
    setExporting("all");
    const result = await window.anchor.exportAll(project.path);
    setResults({ all: result.files });
    setExporting(null);
  };

  const targets = [
    { id: "cursor", name: "Cursor", icon: "🖱️", file: ".cursorrules" },
    { id: "claude-code", name: "Claude Code", icon: "🤖", file: "CLAUDE.md" },
    { id: "windsurf", name: "Windsurf", icon: "🏄", file: ".windsurfrules" },
    { id: "markdown", name: "Markdown", icon: "📝", file: "PROJECT-CONTEXT.md" },
    { id: "json", name: "JSON", icon: "📋", file: "anchor-context.json" },
  ];

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Export Context</h1>
      <p style={{ color: "var(--text-2)", fontSize: 13, marginBottom: 24 }}>
        Switch tools without losing context. One click, any platform.
      </p>

      <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
        {targets.map((t) => (
          <div key={t.id} className="card" style={{ padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 24 }}>{t.icon}</span>
              <div>
                <strong style={{ fontSize: 14 }}>{t.name}</strong>
                <span style={{ fontSize: 12, color: "var(--text-2)", marginLeft: 8 }}>→ {t.file}</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {results[t.id] && <span className="badge badge-green">✓</span>}
              <button className="btn" onClick={() => doExport(t.id)} disabled={exporting !== null}>
                {exporting === t.id ? "..." : "Export"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", padding: 12 }} onClick={doExportAll} disabled={exporting !== null}>
        {exporting === "all" ? "Exporting..." : "⚡ Export All"}
      </button>
    </div>
  );
}

// === Timeline View ===
function TimelineView({ activity }: { activity: any[] }) {
  const typeIcon: Record<string, string> = {
    commit: "📝", decision: "🧠", export: "📦", "phase-complete": "✅", note: "📌",
  };

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Timeline</h1>
      {activity.length === 0 ? (
        <p style={{ color: "var(--text-2)" }}>No activity yet.</p>
      ) : (
        <div style={{ position: "relative", paddingLeft: 28 }}>
          <div style={{ position: "absolute", left: 9, top: 4, bottom: 4, width: 2, background: "var(--border)" }} />
          {activity.map((a) => (
            <div key={a.id} style={{ position: "relative", paddingBottom: 16, paddingLeft: 20 }}>
              <div style={{
                position: "absolute", left: -24, top: 2, width: 20, height: 20,
                borderRadius: "50%", background: "var(--bg-2)", border: "2px solid var(--border)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10,
              }}>
                {typeIcon[a.type] || "•"}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-2)" }}>{new Date(a.timestamp).toLocaleString()}</div>
              <div style={{ fontSize: 13 }}>{a.summary}</div>
            </div>
          ))}
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

  if (loading) return <p style={{ color: "var(--text-2)" }}>Analyzing...</p>;
  if (!report) return <p>No report available.</p>;

  const scoreColor = report.score >= 80 ? "var(--green)" : report.score >= 50 ? "var(--yellow)" : "var(--red)";

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Portability Report</h1>

      <div className="card" style={{ textAlign: "center", padding: 32, marginBottom: 20 }}>
        <div style={{ fontSize: 56, fontWeight: 800, color: scoreColor }}>{report.score}</div>
        <div style={{ fontSize: 14, color: "var(--text-2)", marginTop: 4 }}>Portability Score</div>
        <p style={{ fontSize: 13, color: "var(--text-1)", marginTop: 12, maxWidth: 400, margin: "12px auto 0" }}>{report.summary}</p>
      </div>

      {report.vendorLockIn.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 12 }}>Vendor Dependencies</h3>
          {report.vendorLockIn.map((v: any, i: number) => (
            <div key={i} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <code style={{ color: "var(--accent)", fontSize: 13 }}>{v.dependency}</code>
                <span style={{ fontSize: 12, color: "var(--text-2)", marginLeft: 8 }}>{v.vendor}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className={`badge badge-${v.risk === "high" ? "red" : v.risk === "medium" ? "yellow" : "green"}`}>{v.risk}</span>
                <span style={{ fontSize: 12, color: "var(--text-2)" }}>→ {v.alternative}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {report.recommendations.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3 style={{ fontSize: 14, marginBottom: 12 }}>Recommendations</h3>
          {report.recommendations.map((r: string, i: number) => (
            <p key={i} style={{ fontSize: 13, color: "var(--text-1)", padding: "6px 0" }}>💡 {r}</p>
          ))}
        </div>
      )}
    </div>
  );
}
