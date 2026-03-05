import { useState, useEffect, useRef } from "react";

interface EditorProps {
  project: { path: string; name: string; displayName?: string };
  projectState: any;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  filesChanged?: string[];
}

interface OpenFile {
  path: string;
  content: string;
  modified: boolean;
  language: string;
}

export function EditorView({ project, projectState }: EditorProps) {
  const [files, setFiles] = useState<string[]>([]);
  const [openFile, setOpenFile] = useState<OpenFile | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-20250514");
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [fileTree, setFileTree] = useState<any[]>([]);
  const [splitDirection, setSplitDirection] = useState<"horizontal" | "vertical">("horizontal");
  const [splitSize, setSplitSize] = useState(60);
  const [editorPanel, setEditorPanel] = useState<"code" | "chat" | "split">("split");
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const currentSize = splitSize;
    isDragging.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (splitDirection === "horizontal") {
        const pct = ((ev.clientX - rect.left) / rect.width) * 100;
        setSplitSize(Math.min(80, Math.max(20, pct)));
      } else {
        const pct = ((ev.clientY - rect.top) / rect.height) * 100;
        setSplitSize(Math.min(80, Math.max(20, pct)));
      }
    };
    const onUp = () => {
      isDragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadFileTree();
    window.anchor?.getSetting?.("anthropic-api-key").then((k: string | null) => {
      if (k) setApiKey(k);
    });
    window.anchor?.getSetting?.("claude-model").then((m: string | null) => {
      if (m) setModel(m);
    });
  }, [project.path]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const loadFileTree = async () => {
    if (!window.anchor) return;
    const tree = await window.anchor.getFileTree(project.path);
    setFileTree(tree || []);
  };

  const openFileInEditor = async (filePath: string) => {
    if (!window.anchor) return;
    const content = await window.anchor.readFile(project.path, filePath);
    setOpenFile({
      path: filePath,
      content: content || "",
      modified: false,
      language: detectLanguage(filePath),
    });
  };

  const saveFile = async () => {
    if (!openFile || !window.anchor) return;
    await window.anchor.writeFile(project.path, openFile.path, openFile.content);
    setOpenFile({ ...openFile, modified: false });
  };

  const saveApiKey = (key: string) => {
    setApiKey(key);
    window.anchor?.setSetting?.("anthropic-api-key", key);
    setShowApiKeyInput(false);
  };

  const buildSystemPrompt = (): string => {
    const stack = projectState?.stack || {};
    const decisions = projectState?.decisions || [];
    const notes = projectState?.notes || [];
    const phases = projectState?.phases || [];

    let prompt = `You are an expert developer working on the project "${project.displayName || project.name}".

## Project Context (provided by Anchor)

### Tech Stack
${stack.frameworks?.length ? `Frameworks: ${stack.frameworks.join(", ")}` : ""}
${stack.languages?.length ? `Languages: ${stack.languages.join(", ")}` : ""}
${stack.buildTools?.length ? `Build tools: ${stack.buildTools.join(", ")}` : ""}
${stack.databases?.length ? `Databases: ${stack.databases.join(", ")}` : ""}
`;

    if (decisions.length > 0) {
      prompt += `\n### Architectural Decisions\n`;
      for (const d of decisions) {
        prompt += `- **${d.title}** [${d.category}]: ${d.description}`;
        if (d.reasoning) prompt += ` (Reasoning: ${d.reasoning})`;
        prompt += `\n`;
      }
    }

    if (notes.length > 0) {
      prompt += `\n### Notes\n`;
      for (const n of notes) {
        prompt += `- ${n.content || n}\n`;
      }
    }

    if (phases.length > 0) {
      const activePhase = phases.find((p: any) => p.status === "active");
      if (activePhase) {
        prompt += `\n### Current Phase: ${activePhase.title}\n${activePhase.description || ""}\n`;
      }
    }

    if (openFile) {
      prompt += `\n### Currently Editing: ${openFile.path}\n\`\`\`${openFile.language}\n${openFile.content}\n\`\`\`\n`;
    }

    prompt += `
### Instructions
- You have full context about this project from Anchor's memory.
- When suggesting code changes, provide the complete updated code.
- Respect all architectural decisions listed above.
- Be concise but thorough. The user is a vibecoder who wants to move fast.
- If modifying the current file, output the full updated file content in a code block.
`;

    return prompt;
  };

  const sendMessage = async () => {
    if (!chatInput.trim() || isThinking) return;
    if (!apiKey) {
      setShowApiKeyInput(true);
      return;
    }

    const userMsg: ChatMessage = {
      role: "user",
      content: chatInput.trim(),
      timestamp: new Date().toISOString(),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setIsThinking(true);

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: model,
          max_tokens: 4096,
          system: buildSystemPrompt(),
          messages: [
            ...chatMessages.map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: chatInput.trim() },
          ],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`API error: ${response.status} — ${err}`);
      }

      const data = await response.json();
      const assistantText = data.content
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("\n");

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: assistantText,
        timestamp: new Date().toISOString(),
      };

      setChatMessages((prev) => [...prev, assistantMsg]);

      // Auto-detect if response contains a code block for the current file
      const codeMatch = assistantText.match(/```[\w]*\n([\s\S]*?)```/);
      if (codeMatch && openFile) {
        // Offer to apply
        const applyMsg: ChatMessage = {
          role: "assistant",
          content: "💡 I detected code changes. Click 'Apply Changes' below the code to update your file.",
          timestamp: new Date().toISOString(),
        };
        setChatMessages((prev) => [...prev, applyMsg]);
      }
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        role: "assistant",
        content: `❌ Error: ${err.message}`,
        timestamp: new Date().toISOString(),
      };
      setChatMessages((prev) => [...prev, errorMsg]);
    }

    setIsThinking(false);
  };

  const applyCodeFromMessage = (content: string) => {
    const codeMatch = content.match(/```[\w]*\n([\s\S]*?)```/);
    if (codeMatch && openFile) {
      setOpenFile({ ...openFile, content: codeMatch[1], modified: true });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
    // Cmd+S to save
    if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      saveFile();
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 64px)" }}>
      {/* Toolbar */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "8px 0", marginBottom: 8, borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Editor</h2>
          {openFile && (
            <span style={{ fontSize: 13, color: "var(--text-2)" }}>
              {openFile.path} {openFile.modified && <span style={{ color: "var(--yellow)" }}>●</span>}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className={`btn ${editorPanel === "code" ? "btn-primary" : ""}`} style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => setEditorPanel("code")}>Code</button>
          <button className={`btn ${editorPanel === "split" ? "btn-primary" : ""}`} style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => setEditorPanel("split")}>Split</button>
          <button className={`btn ${editorPanel === "chat" ? "btn-primary" : ""}`} style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => setEditorPanel("chat")}>Chat</button>
          {editorPanel === "split" && (
            <button
              className="btn"
              title={splitDirection === "horizontal" ? "Switch to vertical split" : "Switch to horizontal split"}
              style={{ padding: "4px 10px", fontSize: 11 }}
              onClick={() => { setSplitDirection(d => d === "horizontal" ? "vertical" : "horizontal"); setSplitSize(50); }}
            >
              {splitDirection === "horizontal" ? "⬒" : "⬓"}
            </button>
          )}
          <div style={{ width: 1, background: "var(--border)", margin: "0 4px" }} />
          {openFile?.modified && <button className="btn btn-primary" style={{ padding: "4px 10px", fontSize: 11 }} onClick={saveFile}>Save</button>}
          <select
            value={model}
            onChange={e => { setModel(e.target.value); window.anchor?.setSetting?.("claude-model", e.target.value); }}
            style={{ fontSize: 11, padding: "3px 6px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--bg-2)", color: "var(--text-1)", cursor: "pointer" }}
          >
            <option value="claude-haiku-4-5-20251001">Haiku 4.5</option>
            <option value="claude-sonnet-4-20250514">Sonnet 4</option>
            <option value="claude-opus-4-20250514">Opus 4</option>
          </select>
          <button className="btn" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => setShowApiKeyInput(!showApiKeyInput)}>
            {apiKey ? "Key set" : "Set API Key"}
          </button>
        </div>
      </div>

      {/* API Key input */}
      {showApiKeyInput && (
        <div style={{ padding: 12, background: "var(--bg-2)", borderRadius: "var(--radius-sm)", marginBottom: 8, display: "flex", gap: 8 }}>
          <input
            type="password"
            placeholder="Anthropic API key (sk-ant-...)"
            defaultValue={apiKey}
            style={{ flex: 1, fontSize: 13 }}
            onKeyDown={(e) => { if (e.key === "Enter") saveApiKey((e.target as HTMLInputElement).value); }}
          />
          <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={(e) => {
            const input = (e.target as HTMLElement).parentElement?.querySelector("input");
            if (input) saveApiKey(input.value);
          }}>Save</button>
          <button className="btn" style={{ fontSize: 12 }} onClick={() => setShowApiKeyInput(false)}>Cancel</button>
        </div>
      )}

      {/* Main editor area — always row: [filetree] [split area] */}
      <div style={{ flex: 1, display: "flex", flexDirection: "row", overflow: "hidden" }}>

        {/* File tree - always left, always visible */}
        <div style={{
          width: 200, background: "var(--bg-1)", borderRight: "1px solid var(--border)",
          overflow: "auto", flexShrink: 0,
        }}>
          <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--text-2)", fontWeight: 600, textTransform: "uppercase" }}>Files</div>
          <FileTreeView tree={fileTree} onSelect={openFileInEditor} selectedPath={openFile?.path} />
        </div>

        {/* Split area — handles its own direction */}
        <div
          ref={containerRef}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: editorPanel === "split" && splitDirection === "vertical" ? "column" : "row",
            overflow: "hidden",
            minWidth: 0,
          }}
        >
        {/* Code editor */}
        {(editorPanel === "code" || editorPanel === "split") && (
          <div style={{
            ...(editorPanel === "split"
              ? splitDirection === "horizontal"
                ? { width: `${splitSize}%`, minWidth: 0, flexShrink: 0 }
                : { height: `${splitSize}%`, minHeight: 0, flexShrink: 0 }
              : { flex: 1, minWidth: 0 }),
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}>
            {openFile ? (
              <textarea
                value={openFile.content}
                onChange={(e) => setOpenFile({ ...openFile, content: e.target.value, modified: true })}
                onKeyDown={handleKeyDown}
                spellCheck={false}
                style={{
                  flex: 1, width: "100%", resize: "none",
                  background: "var(--bg-0)", color: "var(--text-0)",
                  border: "none", padding: 16, fontSize: 13,
                  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
                  lineHeight: 1.6, outline: "none", tabSize: 2,
                }}
              />
            ) : (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-2)" }}>
                <div style={{ textAlign: "center" }}>
                  
                  <p>Select a file from the sidebar</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Drag handle */}
        {editorPanel === "split" && (
          <div
            onMouseDown={startDrag}
            style={{
              ...(splitDirection === "horizontal"
                ? { width: 5, cursor: "col-resize" }
                : { height: 5, cursor: "row-resize" }),
              background: "var(--border)",
              flexShrink: 0,
              transition: "background 0.1s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--accent)")}
            onMouseLeave={e => (e.currentTarget.style.background = "var(--border)")}
          />
        )}

        {/* Chat panel */}
        {(editorPanel === "chat" || editorPanel === "split") && (
          <div style={{
            flex: 1,
            display: "flex", flexDirection: "column",
            borderLeft: splitDirection === "horizontal" || editorPanel === "chat" ? "1px solid var(--border)" : "none",
            borderTop: splitDirection === "vertical" && editorPanel === "split" ? "1px solid var(--border)" : "none",
            overflow: "hidden",
            minWidth: 0, minHeight: 0,
          }}>
            {/* Chat header */}
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
              
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Claude</div>
                <div style={{ fontSize: 11, color: "var(--text-2)" }}>
                  Full project context loaded · {projectState?.decisions?.length || 0} decisions
                </div>
              </div>
            </div>

            {/* Chat messages */}
            <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
              {chatMessages.length === 0 && (
                <div style={{ textAlign: "center", padding: 24, color: "var(--text-2)" }}>
                  
                  <p style={{ fontSize: 13, marginBottom: 12 }}>Claude has your full project context loaded.</p>
                  <p style={{ fontSize: 12, lineHeight: 1.6 }}>
                    Ask it to fix a bug, explain code, add a feature, or refactor something.
                    It knows your stack, your decisions, and what file you're editing.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 16, textAlign: "left" }}>
                    <QuickPrompt text="Fix the bug in this file" onClick={(t) => { setChatInput(t); }} />
                    <QuickPrompt text="Explain what this code does" onClick={(t) => { setChatInput(t); }} />
                    <QuickPrompt text="Add error handling" onClick={(t) => { setChatInput(t); }} />
                    <QuickPrompt text="Refactor for better readability" onClick={(t) => { setChatInput(t); }} />
                  </div>
                </div>
              )}

              {chatMessages.map((msg, i) => (
                <div key={i} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 12 }}></span>
                    <span style={{ fontSize: 11, color: "var(--text-2)", fontWeight: 600 }}>
                      {msg.role === "user" ? "You" : "Claude"}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--text-2)" }}>
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div style={{
                    fontSize: 13, lineHeight: 1.6, color: "var(--text-1)",
                    background: msg.role === "user" ? "var(--accent-bg)" : "var(--bg-2)",
                    padding: "10px 14px", borderRadius: "var(--radius-sm)",
                    whiteSpace: "pre-wrap", wordBreak: "break-word",
                  }}>
                    {msg.content}
                    {msg.role === "assistant" && msg.content.includes("```") && (
                      <button
                        className="btn btn-primary"
                        style={{ marginTop: 8, padding: "4px 12px", fontSize: 11 }}
                        onClick={() => applyCodeFromMessage(msg.content)}
                      >
                        Apply changes to {openFile?.path || "file"}
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {isThinking && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 8, color: "var(--text-2)", fontSize: 13 }}>
                  <span className="thinking-dots">Thinking…</span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat input */}
            <div style={{ padding: 12, borderTop: "1px solid var(--border)" }}>
              <div style={{ display: "flex", gap: 8 }}>
                <textarea
                  ref={textareaRef}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={apiKey ? "Ask Claude anything about your project..." : "Set your API key first →"}
                  disabled={!apiKey}
                  rows={2}
                  style={{
                    flex: 1, resize: "none", fontSize: 13,
                    fontFamily: "inherit",
                  }}
                />
                <button
                  className="btn btn-primary"
                  style={{ alignSelf: "flex-end", padding: "8px 14px" }}
                  onClick={sendMessage}
                  disabled={isThinking || !apiKey || !chatInput.trim()}
                >
                  Send
                </button>
              </div>
              {!apiKey && (
                <p style={{ fontSize: 11, color: "var(--yellow)", marginTop: 6 }}>
                  Set your API key above to use the AI assistant.
                </p>
              )}
            </div>
          </div>
        )}
        </div> {/* end split area */}
      </div>
    </div>
  );
}

// === File Tree ===
function FileTreeView({ tree, onSelect, selectedPath, depth = 0 }: {
  tree: any[]; onSelect: (path: string) => void; selectedPath?: string; depth?: number;
}) {
  if (!tree || tree.length === 0) {
    return depth === 0 ? (
      <div style={{ padding: 12, fontSize: 12, color: "var(--text-2)" }}>No files found</div>
    ) : null;
  }

  return (
    <div>
      {tree.map((node) => (
        <div key={node.path}>
          <div
            onClick={() => node.type === "file" && onSelect(node.path)}
            style={{
              padding: "3px 12px", paddingLeft: 12 + depth * 14,
              fontSize: 12, cursor: node.type === "file" ? "pointer" : "default",
              color: selectedPath === node.path ? "var(--accent)" : "var(--text-2)",
              background: selectedPath === node.path ? "var(--accent-bg)" : "transparent",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}
          >
            <span style={{ marginRight: 4 }}>{node.type === "directory" ? "📁" : fileIcon(node.path)}</span>
            {node.path.split("/").pop()}
          </div>
          {node.children && <FileTreeView tree={node.children} onSelect={onSelect} selectedPath={selectedPath} depth={depth + 1} />}
        </div>
      ))}
    </div>
  );
}

function QuickPrompt({ text, onClick }: { text: string; onClick: (text: string) => void }) {
  return (
    <button
      onClick={() => onClick(text)}
      style={{
        background: "var(--bg-2)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)", padding: "6px 12px",
        color: "var(--text-1)", fontSize: 12, cursor: "pointer",
        textAlign: "left", transition: "all 0.15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
    >
      {text}
    </button>
  );
}

function fileIcon(path: string): string {
  if (path.endsWith(".tsx") || path.endsWith(".jsx")) return "⚛️";
  if (path.endsWith(".ts") || path.endsWith(".js")) return "📜";
  if (path.endsWith(".css")) return "🎨";
  if (path.endsWith(".json")) return "📋";
  if (path.endsWith(".md")) return "📝";
  if (path.endsWith(".html")) return "🌐";
  return "txt";
}

function detectLanguage(path: string): string {
  if (path.endsWith(".tsx")) return "tsx";
  if (path.endsWith(".ts")) return "typescript";
  if (path.endsWith(".jsx")) return "jsx";
  if (path.endsWith(".js")) return "javascript";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".md")) return "markdown";
  if (path.endsWith(".html")) return "html";
  if (path.endsWith(".py")) return "python";
  if (path.endsWith(".rs")) return "rust";
  return "text";
}
