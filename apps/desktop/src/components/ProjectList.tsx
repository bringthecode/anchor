import type { Project } from "../App.tsx";

interface ProjectListProps {
  onSelect: (project: Project) => void;
}

// Placeholder data — in production this reads from Anchor's SQLite
const DEMO_PROJECTS: Project[] = [
  {
    id: "1",
    name: "my-saas-app",
    path: "/Users/rickard/projects/my-saas-app",
    stack: {
      frameworks: ["Next.js", "React", "Tauri"],
      languages: ["TypeScript"],
      buildTools: ["Vite"],
      databases: ["Drizzle"],
    },
    updatedAt: new Date().toISOString(),
    decisionCount: 4,
  },
  {
    id: "2",
    name: "anchor",
    path: "/Users/rickard/projects/anchor",
    stack: {
      frameworks: ["React"],
      languages: ["TypeScript", "Rust"],
      buildTools: ["Turborepo", "Vite"],
      databases: ["SQLite"],
    },
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
    decisionCount: 7,
  },
];

export function ProjectList({ onSelect }: ProjectListProps) {
  return (
    <div>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "24px",
      }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700 }}>Projects</h1>
        <button style={{
          background: "var(--accent)",
          color: "white",
          border: "none",
          borderRadius: "8px",
          padding: "8px 16px",
          fontSize: "14px",
          fontWeight: 600,
          cursor: "pointer",
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = "var(--accent-hover)"}
        onMouseLeave={(e) => e.currentTarget.style.background = "var(--accent)"}
        >
          + Add Project
        </button>
      </div>

      <div style={{ display: "grid", gap: "12px" }}>
        {DEMO_PROJECTS.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onClick={() => onSelect(project)}
          />
        ))}
      </div>
    </div>
  );
}

function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }) {
  const timeAgo = getTimeAgo(project.updatedAt);

  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--bg-card)",
        borderRadius: "12px",
        padding: "20px 24px",
        border: "1px solid var(--border)",
        cursor: "pointer",
        transition: "all 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--accent)";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.transform = "none";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "4px" }}>
            ⚓ {project.name}
          </h3>
          <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: 0 }}>
            {project.path}
          </p>
        </div>
        <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{timeAgo}</span>
      </div>

      <div style={{
        display: "flex",
        gap: "6px",
        marginTop: "12px",
        flexWrap: "wrap",
      }}>
        {[...project.stack.frameworks, ...project.stack.languages].map((tag) => (
          <span
            key={tag}
            style={{
              background: "rgba(99, 102, 241, 0.12)",
              color: "var(--accent)",
              padding: "2px 8px",
              borderRadius: "4px",
              fontSize: "11px",
              fontWeight: 500,
            }}
          >
            {tag}
          </span>
        ))}
      </div>

      <div style={{
        display: "flex",
        gap: "16px",
        marginTop: "12px",
        fontSize: "12px",
        color: "var(--text-secondary)",
      }}>
        <span>{project.decisionCount} decisions</span>
        {project.stack.databases.length > 0 && (
          <span>DB: {project.stack.databases.join(", ")}</span>
        )}
      </div>
    </div>
  );
}

function getTimeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
