interface SidebarProps {
  currentView: "projects" | "settings";
  onViewChange: (view: "projects" | "settings") => void;
  projectName?: string;
  onBack: () => void;
}

export function Sidebar({ currentView, onViewChange, projectName, onBack }: SidebarProps) {
  return (
    <aside style={{
      width: "240px",
      background: "var(--bg-secondary)",
      borderRight: "1px solid var(--border)",
      display: "flex",
      flexDirection: "column",
      padding: "16px 0",
      userSelect: "none",
      WebkitAppRegion: "drag" as any,
    }}>
      {/* Logo */}
      <div style={{
        padding: "8px 20px 24px",
        display: "flex",
        alignItems: "center",
        gap: "10px",
      }}>
        <span style={{ fontSize: "24px" }}>⚓</span>
        <span style={{ fontSize: "18px", fontWeight: 700, letterSpacing: "-0.02em" }}>
          Anchor
        </span>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, WebkitAppRegion: "no-drag" as any }}>
        <NavItem
          icon="📁"
          label="Projects"
          active={currentView === "projects"}
          onClick={() => { onViewChange("projects"); onBack(); }}
        />
        <NavItem
          icon="⚙️"
          label="Settings"
          active={currentView === "settings"}
          onClick={() => onViewChange("settings")}
        />
      </nav>

      {/* Active project indicator */}
      {projectName && (
        <div style={{
          padding: "12px 20px",
          borderTop: "1px solid var(--border)",
          fontSize: "12px",
          color: "var(--text-secondary)",
        }}>
          <div style={{ color: "var(--accent)", fontWeight: 600, marginBottom: "2px" }}>
            Active
          </div>
          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {projectName}
          </div>
        </div>
      )}

      {/* Version */}
      <div style={{
        padding: "12px 20px",
        fontSize: "11px",
        color: "var(--text-secondary)",
        opacity: 0.5,
      }}>
        v0.1.0
      </div>
    </aside>
  );
}

function NavItem({ icon, label, active, onClick }: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        width: "100%",
        padding: "10px 20px",
        border: "none",
        background: active ? "rgba(99, 102, 241, 0.12)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-secondary)",
        cursor: "pointer",
        fontSize: "14px",
        fontWeight: active ? 600 : 400,
        textAlign: "left",
        transition: "all 0.15s",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.04)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
