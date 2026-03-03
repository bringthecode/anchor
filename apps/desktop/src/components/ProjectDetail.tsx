import { useState } from "react";
import type { Project } from "../App.tsx";

interface ProjectDetailProps {
  project: Project;
  onBack: () => void;
}

type Tab = "overview" | "decisions" | "export" | "timeline";

export function ProjectDetail({ project, onBack }: ProjectDetailProps) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [exporting, setExporting] = useState(false);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <button
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-secondary)",
            cursor: "pointer",
            fontSize: "13px",
            padding: 0,
            marginBottom: "8px",
          }}
        >
          ← Back to Projects
        </button>
        <h1 style={{ fontSize: "28px", fontWeight: 700, margin: 0 }}>
          ⚓ {project.name}
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "13px", margin: "4px 0 0" }}>
          {project.path}
        </p>
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex",
        gap: "4px",
        marginBottom: "24px",
        borderBottom: "1px solid var(--border)",
        paddingBottom: "0",
      }}>
        {(["overview", "decisions", "export", "timeline"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: "none",
              border: "none",
              color: activeTab === tab ? "var(--accent)" : "var(--text-secondary)",
              padding: "8px 16px",
              fontSize: "14px",
              fontWeight: activeTab === tab ? 600 : 400,
              cursor: "pointer",
              borderBottom: activeTab === tab ? "2px solid var(--accent)" : "2px solid transparent",
              marginBottom: "-1px",
              textTransform: "capitalize",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && <OverviewTab project={project} />}
      {activeTab === "decisions" && <DecisionsTab />}
      {activeTab === "export" && <ExportTab exporting={exporting} setExporting={setExporting} />}
      {activeTab === "timeline" && <TimelineTab />}
    </div>
  );
}

function OverviewTab({ project }: { project: Project }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
      <Card title="Tech Stack">
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {project.stack.frameworks.length > 0 && (
            <Row label="Frameworks" value={project.stack.frameworks.join(", ")} />
          )}
          {project.stack.languages.length > 0 && (
            <Row label="Languages" value={project.stack.languages.join(", ")} />
          )}
          {project.stack.buildTools.length > 0 && (
            <Row label="Build" value={project.stack.buildTools.join(", ")} />
          )}
          {project.stack.databases.length > 0 && (
            <Row label="Database" value={project.stack.databases.join(", ")} />
          )}
        </div>
      </Card>

      <Card title="Stats">
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <Row label="Decisions" value={String(project.decisionCount)} />
          <Row label="Last updated" value={new Date(project.updatedAt).toLocaleDateString()} />
        </div>
      </Card>

      <Card title="Quick Actions" fullWidth>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <ActionButton label="Export All" icon="📦" primary />
          <ActionButton label="AI Summary" icon="🤖" />
          <ActionButton label="View Diff" icon="📊" />
          <ActionButton label="Open in Terminal" icon="💻" />
        </div>
      </Card>
    </div>
  );
}

function DecisionsTab() {
  const decisions = [
    { title: "Use Drizzle ORM", category: "technology", description: "Chose Drizzle over Prisma for edge compatibility", date: "2024-03-01" },
    { title: "API-first architecture", category: "architecture", description: "All features exposed via REST API before building UI", date: "2024-02-28" },
    { title: "Tailwind CSS", category: "design", description: "Use Tailwind for all styling, no CSS modules", date: "2024-02-25" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {decisions.map((d, i) => (
        <div key={i} style={{
          background: "var(--bg-card)",
          borderRadius: "10px",
          padding: "16px 20px",
          border: "1px solid var(--border)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "var(--green)",
              }} />
              <strong style={{ fontSize: "15px" }}>{d.title}</strong>
              <span style={{
                background: "rgba(99, 102, 241, 0.12)",
                color: "var(--accent)",
                padding: "2px 8px",
                borderRadius: "4px",
                fontSize: "11px",
              }}>
                {d.category}
              </span>
            </div>
            <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{d.date}</span>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "13px", margin: "8px 0 0 18px" }}>
            {d.description}
          </p>
        </div>
      ))}
    </div>
  );
}

function ExportTab({ exporting, setExporting }: { exporting: boolean; setExporting: (v: boolean) => void }) {
  const targets = [
    { name: "Cursor", file: ".cursorrules", icon: "🖱️", description: "Cursor IDE context rules" },
    { name: "Claude Code", file: "CLAUDE.md", icon: "🤖", description: "Claude Code project context" },
    { name: "Windsurf", file: ".windsurfrules", icon: "🏄", description: "Windsurf IDE rules" },
    { name: "Markdown", file: "PROJECT-CONTEXT.md", icon: "📝", description: "Generic markdown export" },
    { name: "JSON", file: "anchor-context.json", icon: "📋", description: "Machine-readable context" },
  ];

  return (
    <div>
      <div style={{ display: "grid", gap: "12px" }}>
        {targets.map((target) => (
          <div key={target.name} style={{
            background: "var(--bg-card)",
            borderRadius: "10px",
            padding: "16px 20px",
            border: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "24px" }}>{target.icon}</span>
              <div>
                <strong style={{ fontSize: "14px" }}>{target.name}</strong>
                <p style={{ color: "var(--text-secondary)", fontSize: "12px", margin: "2px 0 0" }}>
                  {target.description} → <code style={{ color: "var(--accent)", fontSize: "11px" }}>{target.file}</code>
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setExporting(true);
                setTimeout(() => setExporting(false), 1500);
              }}
              style={{
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                padding: "6px 14px",
                fontSize: "13px",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--accent)"}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--border)"}
            >
              Export
            </button>
          </div>
        ))}
      </div>

      <div style={{ marginTop: "16px" }}>
        <button
          onClick={() => {
            setExporting(true);
            setTimeout(() => setExporting(false), 2000);
          }}
          style={{
            background: "var(--accent)",
            color: "white",
            border: "none",
            borderRadius: "8px",
            padding: "10px 20px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
            width: "100%",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "var(--accent-hover)"}
          onMouseLeave={(e) => e.currentTarget.style.background = "var(--accent)"}
        >
          {exporting ? "Exporting..." : "Export All"}
        </button>
      </div>
    </div>
  );
}

function TimelineTab() {
  const events = [
    { time: "2 min ago", action: "Exported to Cursor", type: "export" },
    { time: "15 min ago", action: "Added decision: Use Drizzle ORM", type: "decision" },
    { time: "1 hour ago", action: "Stack update: added Tailwind CSS", type: "stack" },
    { time: "3 hours ago", action: "Note: Remember to add rate limiting", type: "note" },
    { time: "Yesterday", action: "Project initialized", type: "init" },
  ];

  return (
    <div style={{ position: "relative", paddingLeft: "24px" }}>
      {/* Timeline line */}
      <div style={{
        position: "absolute",
        left: "7px",
        top: "4px",
        bottom: "4px",
        width: "2px",
        background: "var(--border)",
      }} />

      {events.map((event, i) => (
        <div key={i} style={{
          position: "relative",
          paddingBottom: "20px",
          paddingLeft: "16px",
        }}>
          {/* Dot */}
          <div style={{
            position: "absolute",
            left: "-20px",
            top: "4px",
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            background: event.type === "export" ? "var(--accent)" :
                         event.type === "decision" ? "var(--green)" :
                         event.type === "init" ? "var(--yellow)" : "var(--text-secondary)",
            border: "2px solid var(--bg-primary)",
          }} />

          <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginBottom: "2px" }}>
            {event.time}
          </div>
          <div style={{ fontSize: "14px" }}>
            {event.action}
          </div>
        </div>
      ))}
    </div>
  );
}

// Shared UI components

function Card({ title, children, fullWidth }: { title: string; children: React.ReactNode; fullWidth?: boolean }) {
  return (
    <div style={{
      background: "var(--bg-card)",
      borderRadius: "12px",
      padding: "20px 24px",
      border: "1px solid var(--border)",
      gridColumn: fullWidth ? "1 / -1" : undefined,
    }}>
      <h3 style={{ fontSize: "14px", color: "var(--text-secondary)", margin: "0 0 12px", fontWeight: 500 }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function ActionButton({ label, icon, primary }: { label: string; icon: string; primary?: boolean }) {
  return (
    <button style={{
      background: primary ? "var(--accent)" : "var(--bg-secondary)",
      color: primary ? "white" : "var(--text-primary)",
      border: primary ? "none" : "1px solid var(--border)",
      borderRadius: "8px",
      padding: "8px 16px",
      fontSize: "13px",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: "6px",
      fontWeight: primary ? 600 : 400,
      transition: "all 0.15s",
    }}>
      <span>{icon}</span> {label}
    </button>
  );
}
