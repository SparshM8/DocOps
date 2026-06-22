"use client";

import React, { useRef, useState, useEffect } from "react";
import { C, S, Icon } from "./Theme";
import KnowledgeGraph from "./KnowledgeGraph";

interface CopilotProps {
  token: string;
  user: any;
  docs: any[];
  allTags: string[];
  indexedCount: number;
  fetchDocs: () => Promise<void>;
}

type ChatMsg = {
  id: string;
  role: "user" | "assistant" | "error";
  content: string;
  tools?: { name: string; status: "running" | "done"; input?: string }[];
};

export default function CopilotWorkspace({ token, user, docs, allTags, indexedCount, fetchDocs }: CopilotProps) {
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "I am the DocOps AI Agent. I can search plant manuals, verify compliance against industrial standards, or perform Root Cause Analysis (RCA) on equipment tags. What procedure or equipment would you like to review today?",
    }
  ]);
  const [isUploading, setIsUploading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [input, setInput] = useState("");
  const [tab, setTab] = useState<"chat" | "graph">("chat");

  const feedRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isTyping]);

  const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:3001";

  const handleIngest = async (file?: File) => {
    if (!file || isUploading || !token) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      alert("Please upload a PDF file.");
      return;
    }
    setIsUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${GATEWAY}/api/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error(e.detail);
      }
      await fetchDocs();
    } catch (err: any) {
      setMessages(p => [...p, { id: `e${Date.now()}`, role: "error", content: `⚠️ Ingestion failed: ${err.message}` }]);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (!q || isTyping || !token) return;

    setMessages(p => [...p, { id: `u${Date.now()}`, role: "user", content: q }]);
    setInput("");
    setIsTyping(true);

    const assistantMsgId = `a${Date.now()}`;
    // Insert empty assistant message that will receive chunks
    setMessages(p => [...p, { id: assistantMsgId, role: "assistant", content: "", tools: [] }]);

    try {
      const res = await fetch(`${GATEWAY}/api/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query: q }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error(errData.detail);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Null stream response");

      const dec = new TextDecoder();
      let done = false;
      let buffer = "";

      while (!done) {
        const { value, done: isDone } = await reader.read();
        done = isDone;
        if (value) {
          buffer += dec.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                
                if (data.type === "chunk") {
                  setMessages(p => p.map(m => m.id === assistantMsgId ? { ...m, content: m.content + data.content } : m));
                } 
                else if (data.type === "tool_start") {
                  setMessages(p => p.map(m => {
                    if (m.id === assistantMsgId) {
                      const tools = [...(m.tools || []), { name: data.tool, status: "running" as const, input: data.input }];
                      return { ...m, tools };
                    }
                    return m;
                  }));
                } 
                else if (data.type === "tool_end") {
                  setMessages(p => p.map(m => {
                    if (m.id === assistantMsgId) {
                      const tools = (m.tools || []).map(t => t.name === data.tool ? { ...t, status: "done" as const } : t);
                      return { ...m, tools };
                    }
                    return m;
                  }));
                }
              } catch (e) {
                // Ignore parse errors on half chunks
              }
            }
          }
        }
      }
    } catch (err: any) {
      setMessages(p => p.map(m => m.id === assistantMsgId ? { ...m, role: "error", content: `⚠️ Query failed: ${err.message}` } : m));
    } finally {
      setIsTyping(false);
    }
  };

  const fmtBytes = (b: number) => b < 1e6 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1e6).toFixed(1)} MB`;

  const isManager = user?.role === "plant_manager";

  return (
    <div style={{ display: "flex", height: "calc(100vh - 64px)", overflow: "hidden" }}>
      
      {/* Left: Documents Sidebar */}
      <aside style={{
        width: 288, minWidth: 288, background: C.surf,
        borderRight: `2px solid ${C.border}`,
        display: "flex", flexDirection: "column",
        overflowY: "auto", padding: 16, gap: 8,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
          Knowledge Ingestion
        </div>

        {isManager && (
          <div
            onDragEnter={e => { e.preventDefault(); setIsDragging(true); }}
            onDragOver={e => e.preventDefault()}
            onDragLeave={() => setIsDragging(false)}
            onDrop={e => { e.preventDefault(); setIsDragging(false); handleIngest(e.dataTransfer.files?.[0]); }}
            style={{
              border: `2px dashed ${isDragging ? C.primary : C.border}`,
              borderRadius: 10, padding: 16, textAlign: "center",
              background: isDragging ? "rgba(173,198,255,0.05)" : C.surf2,
              transition: "all 0.15s", marginBottom: 8,
            }}
          >
            <Icon name={isUploading ? "hourglass_empty" : "upload_file"} size={28} color={C.muted} />
            <div style={{ fontSize: 12, fontWeight: 600, color: C.text, margin: "8px 0" }}>
              {isUploading ? "Extracting & Indexing…" : "Drop Manual PDF here"}
            </div>
            <input ref={fileRef} type="file" accept="application/pdf" style={{ display: "none" }}
              onChange={e => { handleIngest(e.target.files?.[0]); e.target.value = ""; }} />
            <button disabled={isUploading} onClick={() => fileRef.current?.click()}
              style={{ ...S.btnPrimary, padding: "6px 14px", fontSize: 12, opacity: isUploading ? 0.5 : 1 }}>
              Select PDF
            </button>
          </div>
        )}

        {/* Doc list */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "4px 0 8px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="folder_open" size={14} color={C.muted} /> Vaults
          </div>
          <span style={{ background: C.surf3, borderRadius: 100, padding: "2px 8px", fontSize: 10, color: C.muted, fontWeight: 600 }}>
            {indexedCount} indexed
          </span>
        </div>

        {docs.length === 0 ? (
          <div style={{ textAlign: "center", padding: "12px 0", fontSize: 12, color: C.muted }}>
            No documents yet. Ingest PDFs to query them.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
            {docs.map((doc: any) => (
              <div key={doc._id || doc.docId} style={{
                background: C.surf2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px"
              }}>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <Icon name={doc.status === "failed" ? "error" : "description"} size={14}
                    color={doc.status === "failed" ? C.error : C.muted} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={doc.name}>
                      {doc.name}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                      <span style={{ fontSize: 10, color: C.muted }}>{fmtBytes(doc.sizeBytes)}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: doc.status === "indexed" ? C.accent : doc.status === "processing" ? "#f59e0b" : C.error }}>
                        {doc.status}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Entities */}
        {allTags.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, margin: "12px 0 8px", display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="sell" size={14} color={C.muted} /> Entities
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 150, overflowY: "auto" }}>
              {allTags.map((tag: string) => (
                <button key={tag} onClick={() => { setInput(`Perform RCA on ${tag}`); setTab("chat"); }}
                  style={{ background: C.surf3, border: `1px solid ${C.border}`, borderRadius: 100, padding: "3px 10px", fontSize: 11, color: C.text, cursor: "pointer", fontFamily: "inherit" }}>
                  {tag}
                </button>
              ))}
            </div>
          </>
        )}
      </aside>

      {/* Right: Main Workspace (Chat / Graph) */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#f8fafc", overflow: "hidden" }}>
        
        {/* Tab Header */}
        <div style={{
          height: 56, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 20px", background: "#fff", borderBottom: "1px solid #e2e8f0", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="smart_toy" size={22} color="#3b82f6" />
            <span style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>AI Copilot Workspace</span>
          </div>
          <div style={{ display: "flex", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 10, padding: 3, gap: 2 }}>
            {(["chat", "graph"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 8,
                fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none", fontFamily: "inherit",
                background: tab === t ? "#fff" : "transparent",
                color: tab === t ? "#0f172a" : "#64748b",
                boxShadow: tab === t ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                transition: "all 0.15s",
              }}>
                <Icon name={t === "chat" ? "chat" : "hub"} size={15} color={tab === t ? "#0f172a" : "#64748b"} />
                {t === "chat" ? "Copilot Chat" : "Knowledge Graph"}
              </button>
            ))}
          </div>
        </div>

        {tab === "chat" ? (
          <>
            {/* Quick Suggestions */}
            <div style={{ padding: "16px 20px 0", display: "flex", gap: 12, background: "#fff" }}>
              {[
                { icon: "search", label: "Semantic Search", ex: 'Find shutdown sequence for P-101', query: "Find shutdown sequence for P-101", bg: "#eff6ff", c: "#3b82f6" },
                { icon: "rule", label: "Compliance Analysis", ex: 'Verify procedures against OISD-137', query: "Verify procedures against OISD-137", bg: "#f0fdf4", c: "#22c55e" },
                { icon: "build", label: "RCA 5-Why Analysis", ex: 'Run RCA on Pump P-101 failures', query: "Perform RCA on Pump P-101", bg: "#fffbeb", c: "#f59e0b" },
              ].map(h => (
                <div
                  key={h.label}
                  onClick={() => setInput(h.query)}
                  style={{
                    flex: 1, background: h.bg, border: `1px solid ${h.c}20`, borderRadius: 10, padding: "12px 14px",
                    textAlign: "center", cursor: "pointer", transition: "transform 0.1s"
                  }}
                >
                  <Icon name={h.icon} size={20} color={h.c} />
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#1e293b", margin: "6px 0 3px" }}>{h.label}</div>
                  <div style={{ fontSize: 10, color: "#64748b", fontStyle: "italic" }}>{h.ex}</div>
                </div>
              ))}
            </div>

            {/* Messages Feed */}
            <div ref={feedRef} style={{ flex: 1, overflowY: "auto", padding: "20px", background: "#f8fafc" }}>
              <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
                {messages.map(msg => (
                  <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
                    
                    {/* Tool Call animation blocks */}
                    {msg.tools && msg.tools.map((t, index) => (
                      <div
                        key={index}
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          background: "#f1f5f9", border: "1px solid #cbd5e1",
                          borderRadius: 8, padding: "6px 12px", fontSize: 12,
                          color: "#475569", marginBottom: 8, alignSelf: "flex-start",
                          animation: t.status === "running" ? "pulse 1.5s infinite" : "none"
                        }}
                      >
                        <Icon
                          name={t.status === "running" ? "progress_activity" : "check_circle"}
                          size={14}
                          color={t.status === "running" ? "#3b82f6" : "#22c55e"}
                          style={{
                            display: "inline-block",
                            animation: t.status === "running" ? "spin 1.5s linear infinite" : "none"
                          }}
                        />
                        <span>
                          {t.status === "running" ? "Invoking" : "Completed"} <strong>{t.name}</strong>
                          {t.input && <span style={{ color: "#64748b", fontStyle: "italic" }}> ({t.input})</span>}
                        </span>
                      </div>
                    ))}

                    {/* Main Message Box */}
                    {msg.role === "error" ? (
                      <div style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 12, padding: "12px 16px", fontSize: 14, maxWidth: "80%", lineHeight: 1.6 }}>
                        {msg.content}
                      </div>
                    ) : (
                      <div style={{
                        maxWidth: "80%", padding: "12px 16px", borderRadius: 16, fontSize: 14, lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-word",
                        ...(msg.role === "user"
                          ? { background: "#3b82f6", color: "#fff", borderBottomRightRadius: 4 }
                          : { background: "#fff", color: "#1e293b", border: "1px solid #e2e8f0", borderBottomLeftRadius: 4 }
                        )
                      }}>
                        {msg.content}
                      </div>
                    )}
                  </div>
                ))}
                
                {isTyping && (
                  <div style={{ display: "flex" }}>
                    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, borderBottomLeftRadius: 4, padding: "12px 16px", display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#64748b" }}>
                      <Icon name="hourglass_empty" size={16} color="#3b82f6" />
                      Agent is executing pipeline...
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Input Form */}
            <div style={{ background: "#fff", borderTop: "1px solid #e2e8f0", padding: 16, flexShrink: 0 }}>
              <form onSubmit={handleSend} style={{ display: "flex", gap: 10, alignItems: "flex-end", maxWidth: 720, margin: "0 auto" }}>
                <textarea
                  value={input} rows={1}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement).requestSubmit(); } }}
                  placeholder="Ask about specs, regulatory gaps, safety procedures..."
                  style={{
                    flex: 1, minHeight: 46, maxHeight: 120, resize: "none",
                    background: "#f8fafc", border: "2px solid #e2e8f0", borderRadius: 12,
                    padding: "12px 16px", fontSize: 14, color: "#1e293b", outline: "none",
                    fontFamily: "inherit", transition: "border-color 0.15s",
                  }}
                />
                <button type="submit" disabled={!input.trim() || isTyping} style={{
                  width: 46, height: 46, background: "#3b82f6", color: "#fff",
                  border: `2px solid ${C.black}`, boxShadow: `3px 3px 0 ${C.black}`,
                  borderRadius: 12, cursor: input.trim() && !isTyping ? "pointer" : "not-allowed",
                  display: "grid", placeItems: "center", flexShrink: 0,
                  opacity: !input.trim() || isTyping ? 0.4 : 1, transition: "all 0.1s",
                }}>
                  <Icon name={isTyping ? "hourglass_empty" : "send"} size={18} color="#fff" />
                </button>
              </form>
              <div style={{ textAlign: "center", fontSize: 11, color: "#94a3b8", marginTop: 8 }}>
                AI Model: Llama 3.2 (Local CPU Inference / Ollama Backend)
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, background: "#020817", position: "relative", overflow: "hidden" }}>
            <KnowledgeGraph token={token} />
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
