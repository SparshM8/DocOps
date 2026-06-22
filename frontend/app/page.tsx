"use client";

import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileText,
  FolderOpen,
  LoaderCircle,
  MessageSquare,
  Send,
  ShieldCheck,
  Sparkles,
  Tag,
  UploadCloud,
  X,
  AlertTriangle,
  XCircle,
  BookOpen,
} from "lucide-react";
import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

// ─── Config ───────────────────────────────────────────────────────────────────
const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:3001";

// ─── Types ────────────────────────────────────────────────────────────────────
type DocStatus = "processing" | "indexed" | "failed";

type Entities = {
  equipment_tags: string[];
  process_parameters: string[];
  safety_standards: string[];
};

type KnowledgeDoc = {
  id: string;
  name: string;
  size: string;
  status: DocStatus;
  entities?: Entities;
};

type Citation = {
  filename: string;
  page: number | string;
  score: number;
  excerpt: string;
};

type ChatMsg = {
  id: string;
  role: "user" | "assistant" | "error";
  content: string;
  citations?: Citation[];
};

type ComplianceResult = {
  summary: string;
  compliant: string[];
  gaps: string[];
  missing: string[];
  citations: Citation[];
};

type ActiveTab = "chat" | "compliance";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Coloured pill for entity tags */
function Pill({
  label,
  color,
  onClick,
}: {
  label: string;
  color: "blue" | "violet" | "emerald" | "slate";
  onClick?: () => void;
}) {
  const colours = {
    blue: "bg-blue-500/20 text-blue-300 border-blue-500/30 hover:bg-blue-500/30",
    violet: "bg-violet-500/20 text-violet-300 border-violet-500/30 hover:bg-violet-500/30",
    emerald: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/30",
    slate: "bg-slate-600/50 text-slate-300 border-slate-500/40 hover:bg-slate-600/70",
  };
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${colours[color]} ${onClick ? "cursor-pointer" : ""}`}
    >
      {label}
    </span>
  );
}

/** Source citations list shown under an assistant message */
function CitationCards({ citations }: { citations: Citation[] }) {
  const top = citations.slice(0, 3);
  return (
    <div className="mt-2 space-y-1.5">
      {top.map((c, i) => (
        <div
          key={i}
          className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
        >
          <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">
            <FileText className="h-3 w-3" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold text-slate-700">{c.filename}</p>
            <p className="mt-0.5 text-[10px] text-slate-400">
              Page {c.page} &middot; Score {c.score}
            </p>
          </div>
          <span className="mt-1 text-[10px] font-bold text-blue-400">#{i + 1}</span>
        </div>
      ))}
    </div>
  );
}

/** Compliance result section with coloured cards */
function ComplianceResultPanel({ result }: { result: ComplianceResult }) {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Summary */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-500 mb-1">
          Overall Status
        </p>
        <p className="text-sm leading-6 text-blue-900">{result.summary}</p>
      </div>

      {/* Compliant */}
      {result.compliant.length > 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Compliant ({result.compliant.length})
            </p>
          </div>
          <ul className="space-y-2">
            {result.compliant.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm leading-5 text-emerald-900">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Gaps */}
      {result.gaps.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              Gaps / Unclear ({result.gaps.length})
            </p>
          </div>
          <ul className="space-y-2">
            {result.gaps.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm leading-5 text-amber-900">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Missing */}
      {result.missing.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
          <div className="mb-3 flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-600" />
            <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
              Missing Requirements ({result.missing.length})
            </p>
          </div>
          <ul className="space-y-2">
            {result.missing.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm leading-5 text-red-900">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Source docs */}
      {result.citations.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <BookOpen className="h-3.5 w-3.5" /> Source Documents ({result.citations.length})
          </p>
          <div className="space-y-1.5">
            {result.citations.map((c, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm"
              >
                <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
                  <FileText className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-semibold text-slate-700">{c.filename}</p>
                  <p className="text-[10px] text-slate-400">Page {c.page} · Relevance {c.score}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Page() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "I'm ready to search your indexed manuals. Upload a PDF on the left, then ask me about operating procedures, maintenance requirements, or safety steps.",
    },
  ]);
  const [isUploading, setIsUploading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [input, setInput] = useState("");
  const [activeTab, setActiveTab] = useState<ActiveTab>("chat");
  const [allTags, setAllTags] = useState<string[]>([]);
  const [complianceQuery, setComplianceQuery] = useState("");
  const [complianceResult, setComplianceResult] = useState<ComplianceResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const feedRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, isTyping]);

  // Fetch equipment tags from backend
  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch(`${GATEWAY}/api/tags`);
      if (res.ok) {
        const data = await res.json();
        setAllTags(data.tags ?? []);
      }
    } catch {
      /* non-critical — silently fail */
    }
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  // ── Upload ──────────────────────────────────────────────────────────────────
  const ingestFile = async (file?: File) => {
    if (!file || isUploading) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      window.alert("Please upload a PDF document.");
      return;
    }

    const docId = `${file.name}-${Date.now()}`;
    setDocs((prev) => [
      { id: docId, name: file.name, size: fmtBytes(file.size), status: "processing" },
      ...prev,
    ]);
    setIsUploading(true);

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${GATEWAY}/api/upload`, { method: "POST", body: form });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error(err.detail ?? "Upload failed.");
      }

      const data: { status: string; filename: string; chunks_processed: number; entities: Entities } =
        await res.json();

      setDocs((prev) =>
        prev.map((d) =>
          d.id === docId ? { ...d, status: "indexed", entities: data.entities } : d
        )
      );
      await fetchTags(); // refresh tag browser after new doc
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed.";
      setDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, status: "failed" } : d)));
      setMessages((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, role: "error", content: `⚠️ Upload error: ${msg}` },
      ]);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    ingestFile(e.target.files?.[0]);
    e.target.value = "";
  };
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    ingestFile(e.dataTransfer.files?.[0]);
  };
  const removeDoc = (id: string) => setDocs((prev) => prev.filter((d) => d.id !== id));

  // ── Chat Query ──────────────────────────────────────────────────────────────
  const sendMessage = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = input.trim();
    if (!q || isTyping) return;

    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", content: q }]);
    setInput("");
    setIsTyping(true);

    try {
      const res = await fetch(`${GATEWAY}/api/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error(err.detail ?? "Query failed.");
      }
      const data: { answer: string; citations: Citation[] } = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: data.answer,
          citations: data.citations,
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An error occurred.";
      setMessages((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, role: "error", content: `⚠️ ${msg}` },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  // ── Compliance Check ────────────────────────────────────────────────────────
  const runCompliance = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = complianceQuery.trim();
    if (!q || isAnalyzing) return;
    setIsAnalyzing(true);
    setComplianceResult(null);

    try {
      const res = await fetch(`${GATEWAY}/api/compliance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error(err.detail ?? "Compliance check failed.");
      }
      const data: ComplianceResult = await res.json();
      setComplianceResult(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An error occurred.";
      setComplianceResult({
        summary: `Error: ${msg}`,
        compliant: [],
        gaps: [],
        missing: [],
        citations: [],
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const indexedCount = docs.filter((d) => d.status === "indexed").length;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-slate-50 font-sans text-slate-800">
      <div className="mx-auto flex min-h-screen max-w-[1800px]">

        {/* ════════════════════ SIDEBAR ════════════════════ */}
        <aside className="hidden w-[360px] shrink-0 flex-col border-r border-slate-700/60 bg-slate-900 lg:flex">
          <div className="flex flex-col gap-0 overflow-y-auto px-6 py-6 xl:px-7">

            {/* Logo */}
            <div className="mb-8 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 shadow-lg shadow-blue-950/40">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-[15px] font-bold tracking-tight text-white">DocOps</p>
                <p className="text-[11px] font-medium text-slate-400">Industrial Knowledge Copilot</p>
              </div>
            </div>

            {/* Upload zone header */}
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Knowledge Base</p>
                <p className="mt-0.5 text-xs text-slate-400">Upload plant manuals &amp; procedures</p>
              </div>
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
            </div>

            {/* Drop zone */}
            <div
              id="upload-dropzone"
              onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`rounded-2xl border border-dashed p-5 text-center transition ${
                isDragging
                  ? "border-blue-400 bg-blue-500/10"
                  : "border-slate-600 bg-slate-800/60 hover:border-slate-500"
              }`}
            >
              <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-blue-600/15 text-blue-400">
                {isUploading
                  ? <LoaderCircle className="h-5 w-5 animate-spin" />
                  : <UploadCloud className="h-5 w-5" />}
              </div>
              <p className="mt-3 text-xs font-semibold text-slate-100">
                {isUploading ? "Indexing document…" : "Drop PDF manuals here"}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">or click to browse</p>
              <input
                ref={fileInputRef}
                id="file-upload-input"
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                id="select-pdf-btn"
                type="button"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Select PDF
              </button>
            </div>

            {/* Document list */}
            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-3.5 w-3.5 text-slate-400" />
                  <p className="text-xs font-semibold text-white">Documents</p>
                </div>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                  {indexedCount} indexed
                </span>
              </div>

              {docs.length === 0 ? (
                <p className="text-center text-[11px] text-slate-600">No documents yet.</p>
              ) : (
                <div className="space-y-2">
                  {docs.map((doc) => (
                    <div key={doc.id} className="rounded-xl border border-slate-700/60 bg-slate-800/60 p-3">
                      {/* File header row */}
                      <div className="flex items-start gap-2.5">
                        <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-700 text-slate-300">
                          {doc.status === "failed"
                            ? <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                            : <FileText className="h-3.5 w-3.5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] font-medium text-slate-200" title={doc.name}>
                            {doc.name}
                          </p>
                          <div className="mt-1.5 flex items-center justify-between">
                            <span className="text-[10px] text-slate-500">{doc.size}</span>
                            {doc.status === "indexed" && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400">
                                <CheckCircle2 className="h-3 w-3" /> Indexed
                              </span>
                            )}
                            {doc.status === "processing" && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400">
                                <LoaderCircle className="h-3 w-3 animate-spin" /> Processing
                              </span>
                            )}
                            {doc.status === "failed" && (
                              <button
                                onClick={() => removeDoc(doc.id)}
                                className="inline-flex items-center gap-1 text-[10px] font-medium text-red-400 hover:text-red-300"
                              >
                                <X className="h-3 w-3" /> Remove
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Entity pills — shown after indexing */}
                      {doc.status === "indexed" && doc.entities && (
                        <div className="mt-2.5 space-y-1.5 border-t border-slate-700/50 pt-2.5">
                          {doc.entities.equipment_tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {doc.entities.equipment_tags.map((t) => (
                                <Pill
                                  key={t}
                                  label={t}
                                  color="blue"
                                  onClick={() => {
                                    setInput(`Tell me about ${t}`);
                                    setActiveTab("chat");
                                  }}
                                />
                              ))}
                            </div>
                          )}
                          {doc.entities.process_parameters.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {doc.entities.process_parameters.slice(0, 4).map((p) => (
                                <Pill key={p} label={p} color="violet" />
                              ))}
                            </div>
                          )}
                          {doc.entities.safety_standards.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {doc.entities.safety_standards.map((s) => (
                                <Pill
                                  key={s}
                                  label={s}
                                  color="emerald"
                                  onClick={() => {
                                    setComplianceQuery(`Does our procedure comply with ${s}?`);
                                    setActiveTab("compliance");
                                  }}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Equipment Tag Browser */}
            {allTags.length > 0 && (
              <div className="mt-6">
                <div className="mb-3 flex items-center gap-2">
                  <Tag className="h-3.5 w-3.5 text-slate-400" />
                  <p className="text-xs font-semibold text-white">Equipment Tags</p>
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                    {allTags.length}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {allTags.map((tag) => (
                    <Pill
                      key={tag}
                      label={tag}
                      color="slate"
                      onClick={() => {
                        setInput(`Tell me everything about ${tag}`);
                        setActiveTab("chat");
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* ════════════════════ MAIN PANEL ════════════════════ */}
        <section className="flex min-h-screen w-full flex-col">

          {/* Header with tabs */}
          <header className="flex h-[64px] shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8">
            {/* Mobile logo */}
            <div className="flex items-center gap-3 lg:hidden">
              <div className="grid h-8 w-8 place-items-center rounded-xl bg-blue-600">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-bold text-slate-900">DocOps</span>
            </div>

            {/* Tab switcher */}
            <div className="hidden lg:flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
              <button
                id="tab-chat"
                onClick={() => setActiveTab("chat")}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold transition ${
                  activeTab === "chat"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                AI Copilot
              </button>
              <button
                id="tab-compliance"
                onClick={() => setActiveTab("compliance")}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold transition ${
                  activeTab === "compliance"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <ClipboardCheck className="h-3.5 w-3.5" />
                Compliance Check
              </button>
            </div>

            <div className="flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Online
            </div>
          </header>

          {/* ── CHAT TAB ─────────────────────────────────────── */}
          {activeTab === "chat" && (
            <>
              <div ref={feedRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-3xl space-y-6">
                  <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">
                    Answers cite source manuals. Always follow your site&apos;s safety procedures and escalation policy.
                  </div>

                  {messages.map((msg) => {
                    if (msg.role === "error") {
                      return (
                        <div key={msg.id} className="flex justify-start">
                          <div className="max-w-[88%] rounded-2xl rounded-bl-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
                            {msg.content}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[88%] sm:max-w-[78%]`}>
                          <div
                            className={`rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                              msg.role === "user"
                                ? "rounded-br-md bg-blue-600 text-white"
                                : "rounded-bl-md border border-slate-200 bg-white text-slate-700"
                            }`}
                          >
                            {msg.content}
                          </div>
                          {msg.citations && msg.citations.length > 0 && (
                            <CitationCards citations={msg.citations} />
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Chat input bar */}
              <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
                <form id="chat-form" onSubmit={sendMessage} className="mx-auto flex max-w-3xl items-end gap-2">
                  <label htmlFor="technician-question" className="sr-only">Ask about a manual</label>
                  <textarea
                    id="technician-question"
                    value={input}
                    rows={1}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        e.currentTarget.form?.requestSubmit();
                      }
                    }}
                    placeholder="Ask about your manuals — e.g. 'Shutdown sequence for Turbine A-12?'"
                    className="max-h-32 min-h-[48px] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                  <button
                    id="send-btn"
                    type="submit"
                    disabled={!input.trim() || isTyping}
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-blue-600 text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Send message"
                  >
                    {isTyping ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  </button>
                </form>
                <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-slate-400">
                  Shift + Enter for new line · Click equipment tags in sidebar to search
                </p>
              </div>
            </>
          )}

          {/* ── COMPLIANCE TAB ───────────────────────────────── */}
          {activeTab === "compliance" && (
            <div className="flex flex-1 flex-col overflow-y-auto px-4 py-8 sm:px-6 lg:px-8">
              <div className="mx-auto w-full max-w-3xl">

                {/* Compliance header */}
                <div className="mb-6">
                  <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                    <ClipboardCheck className="h-5 w-5 text-blue-600" />
                    Compliance &amp; Gap Analysis
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Ask whether your uploaded procedures meet a specific regulation or standard.
                    The AI will identify what&apos;s compliant, what has gaps, and what&apos;s missing.
                  </p>
                </div>

                {/* Example prompts */}
                <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[
                    "Does our turbine procedure comply with OISD-137?",
                    "Are safety requirements for pressure vessels documented?",
                    "Do our maintenance records follow Factory Act requirements?",
                    "Is our lockout/tagout procedure compliant with IS:13947?",
                  ].map((example) => (
                    <button
                      key={example}
                      onClick={() => setComplianceQuery(example)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-xs text-slate-600 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                    >
                      {example}
                    </button>
                  ))}
                </div>

                {/* Compliance query form */}
                <form id="compliance-form" onSubmit={runCompliance} className="mb-8">
                  <div className="flex gap-2">
                    <textarea
                      id="compliance-query"
                      value={complianceQuery}
                      rows={2}
                      onChange={(e) => setComplianceQuery(e.target.value)}
                      placeholder="e.g. Does our pump maintenance procedure comply with OISD-137 Section 4?"
                      className="flex-1 resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    />
                    <button
                      id="analyze-btn"
                      type="submit"
                      disabled={!complianceQuery.trim() || isAnalyzing}
                      className="flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isAnalyzing ? (
                        <><LoaderCircle className="h-4 w-4 animate-spin" /> Analyzing…</>
                      ) : (
                        <><ClipboardCheck className="h-4 w-4" /> Analyze</>
                      )}
                    </button>
                  </div>
                </form>

                {/* Compliance result */}
                {isAnalyzing && (
                  <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
                    <LoaderCircle className="h-8 w-8 animate-spin text-blue-400" />
                    <p className="text-sm">Analyzing documents against compliance requirements…</p>
                  </div>
                )}

                {!isAnalyzing && complianceResult && (
                  <ComplianceResultPanel result={complianceResult} />
                )}

                {!isAnalyzing && !complianceResult && (
                  <div className="flex flex-col items-center gap-3 py-16 text-slate-300">
                    <ClipboardCheck className="h-10 w-10" />
                    <p className="text-sm">Enter a compliance question above to get started.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
