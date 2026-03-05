import { useState, useEffect } from "react";

interface PushViewProps {
  project: { path: string; name: string; displayName?: string };
}

interface DiffFile {
  file: string;
  status: string;
  diff: string;
}

export function PushView({ project }: PushViewProps) {
  const [diffData, setDiffData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [commitMsg, setCommitMsg] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [pushing, setPushing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);

  useEffect(() => { refreshDiff(); }, [project.path]);

  const refreshDiff = async () => {
    setLoading(true);
    setResult(null);
    const data = await window.anchor.gitDiff(project.path);
    setDiffData(data);
    // Select all files by default
    if (data?.files) {
      setSelectedFiles(new Set(data.files.map((f: DiffFile) => f.file)));
    }
    setLoading(false);
  };

  const toggleFile = (file: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  };

  const selectAll = () => {
    if (diffData?.files) {
      setSelectedFiles(new Set(diffData.files.map((f: DiffFile) => f.file)));
    }
  };

  const selectNone = () => setSelectedFiles(new Set());

  const commitAndPush = async () => {
    if (!commitMsg.trim() || selectedFiles.size === 0) return;
    setPushing(true);
    setResult(null);
    const res = await window.anchor.gitCommitAndPush(
      project.path,
      commitMsg.trim(),
      Array.from(selectedFiles)
    );
    setResult(res);
    setPushing(false);
    if (res.success) {
      setCommitMsg("");
      setTimeout(() => refreshDiff(), 1000);
    }
  };

  const pull = async () => {
    setPulling(true);
    await window.anchor.gitPull(project.path);
    setPulling(false);
    refreshDiff();
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "modified": return { icon: "M", color: "var(--yellow)", bg: "var(--yellow-bg)" };
      case "staged": return { icon: "S", color: "var(--green)", bg: "var(--green-bg)" };
      case "untracked": return { icon: "+", color: "var(--green)", bg: "var(--green-bg)" };
      case "deleted": return { icon: "D", color: "var(--red)", bg: "var(--red-bg)" };
      default: return { icon: "?", color: "var(--text-2)", bg: "var(--bg-3)" };
    }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--text-2)" }}>Checking for changes...</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Push to GitHub</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={pull} disabled={pulling}>
            {pulling ? "Pulling..." : "⬇ Pull"}
          </button>
          <button className="btn" onClick={refreshDiff}>🔄 Refresh</button>
        </div>
      </div>

      <p style={{ color: "var(--text-2)", fontSize: 13, marginBottom: 20 }}>
        Branch: <strong style={{ color: "var(--accent)" }}>{diffData?.branch || "unknown"}</strong>
        {diffData?.ahead > 0 && <span style={{ marginLeft: 8, color: "var(--green)" }}>↑ {diffData.ahead} ahead</span>}
        {diffData?.behind > 0 && <span style={{ marginLeft: 8, color: "var(--yellow)" }}>↓ {diffData.behind} behind</span>}
      </p>

      {/* Result banner */}
      {result && (
        <div style={{
          padding: 12, borderRadius: "var(--radius-sm)", marginBottom: 16, fontSize: 13,
          background: result.success ? "var(--green-bg)" : "var(--red-bg)",
          color: result.success ? "var(--green)" : "var(--red)",
          border: "1px solid",
          borderColor: result.success ? "var(--green)" : "var(--red)",
        }}>
          {result.success ? (
            <>
              {result.pushed
                ? "Committed and pushed to GitHub!"
                : `Committed locally. ${result.pushError ? "Push failed: " + result.pushError : "No remote configured."}`
              }
            </>
          ) : (
            <>Error: {result.error}</>
          )}
        </div>
      )}

      {diffData?.files?.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
          <h3 style={{ fontSize: 16, marginBottom: 8 }}>Everything is up to date</h3>
          <p style={{ color: "var(--text-2)", fontSize: 13 }}>No uncommitted changes found.</p>
        </div>
      ) : (
        <>
          {/* File list */}
          <div className="card" style={{ padding: 0, marginBottom: 16, overflow: "hidden" }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 16px", borderBottom: "1px solid var(--border)",
              background: "var(--bg-1)",
            }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {diffData?.totalChanges} changed file{diffData?.totalChanges !== 1 ? "s" : ""}
                <span style={{ fontWeight: 400, color: "var(--text-2)", marginLeft: 8 }}>
                  ({selectedFiles.size} selected)
                </span>
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" style={{ padding: "2px 8px", fontSize: 11 }} onClick={selectAll}>All</button>
                <button className="btn" style={{ padding: "2px 8px", fontSize: 11 }} onClick={selectNone}>None</button>
              </div>
            </div>

            {diffData?.files?.map((f: DiffFile) => {
              const st = statusIcon(f.status);
              const isSelected = selectedFiles.has(f.file);
              const isExpanded = expandedFile === f.file;

              return (
                <div key={f.file}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 16px", borderBottom: "1px solid var(--border)",
                    cursor: "pointer", background: isSelected ? "rgba(99, 102, 241, 0.04)" : "transparent",
                  }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleFile(f.file)}
                      style={{ cursor: "pointer" }}
                    />
                    <span style={{
                      width: 20, height: 20, borderRadius: 4, fontSize: 11, fontWeight: 700,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: st.bg, color: st.color,
                    }}>{st.icon}</span>
                    <span style={{ flex: 1, fontSize: 13 }} onClick={() => setExpandedFile(isExpanded ? null : f.file)}>
                      {f.file}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-2)" }}>{f.status}</span>
                    <button
                      className="btn"
                      style={{ padding: "2px 8px", fontSize: 10 }}
                      onClick={() => setExpandedFile(isExpanded ? null : f.file)}
                    >
                      {isExpanded ? "▲" : "▼"}
                    </button>
                  </div>

                  {isExpanded && f.diff && f.diff !== "(new file)" && f.diff !== "(deleted)" && f.diff !== "(binary)" && (
                    <div style={{
                      padding: "8px 16px", background: "var(--bg-0)",
                      borderBottom: "1px solid var(--border)",
                      maxHeight: 300, overflow: "auto",
                    }}>
                      <pre style={{
                        fontSize: 11, fontFamily: "'SF Mono', 'Fira Code', monospace",
                        lineHeight: 1.5, whiteSpace: "pre-wrap", margin: 0,
                      }}>
                        {f.diff.split("\n").map((line: string, i: number) => (
                          <div key={i} style={{
                            color: line.startsWith("+") ? "var(--green)"
                              : line.startsWith("-") ? "var(--red)"
                              : line.startsWith("@@") ? "var(--accent)"
                              : "var(--text-2)",
                            background: line.startsWith("+") ? "rgba(34,197,94,0.05)"
                              : line.startsWith("-") ? "rgba(239,68,68,0.05)"
                              : "transparent",
                            padding: "0 4px",
                          }}>{line}</div>
                        ))}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Commit message + push */}
          <div className="card" style={{ padding: 16 }}>
            <label className="label" style={{ marginBottom: 6 }}>Commit message</label>
            <input
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) commitAndPush(); }}
              placeholder="What did you change? e.g. 'Add user auth with Supabase'"
              style={{ width: "100%", fontSize: 14, padding: "10px 14px", marginBottom: 12 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, justifyContent: "center", padding: 12, fontSize: 14 }}
                onClick={commitAndPush}
                disabled={pushing || !commitMsg.trim() || selectedFiles.size === 0}
              >
                {pushing ? "Pushing..." : `Commit & Push ${selectedFiles.size} file${selectedFiles.size !== 1 ? "s" : ""}`}
              </button>
            </div>
            {selectedFiles.size === 0 && (
              <p style={{ fontSize: 12, color: "var(--yellow)", marginTop: 8 }}>Select at least one file to commit.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
