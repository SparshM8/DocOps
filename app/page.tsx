"use client";

import {
  CheckCircle2,
  ChevronRight,
  FileText,
  FolderOpen,
  LoaderCircle,
  Send,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import { ChangeEvent, DragEvent, FormEvent, useEffect, useRef, useState } from "react";

type DocumentStatus = "processing" | "indexed";

type KnowledgeDocument = {
  id: string;
  name: string;
  size: string;
  status: DocumentStatus;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citation?: {
    document: string;
    page: number;
  };
};

const initialDocuments: KnowledgeDocument[] = [
  { id: "doc-1", name: "Turbine A-12 Operating Manual.pdf", size: "14.2 MB", status: "indexed" },
  { id: "doc-2", name: "Plant Safety Procedures 2025.pdf", size: "8.6 MB", status: "indexed" },
  { id: "doc-3", name: "Compressor Maintenance Log.pdf", size: "2.1 MB", status: "processing" },
];

const initialMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "I’m ready to search your indexed manuals. Ask about operating procedures, maintenance requirements, or safety steps.",
    citation: { document: "Turbine A-12 Operating Manual.pdf", page: 4 },
  },
];

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Page() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>(initialDocuments);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isUploading, setIsUploading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [input, setInput] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const feed = feedRef.current;
    if (feed) feed.scrollTo({ top: feed.scrollHeight, behavior: "smooth" });
  }, [messages, isTyping]);

  const ingestFile = (file?: File) => {
    if (!file || isUploading) return;

    if (file.type !== "application/pdf") {
      window.alert("Please upload a PDF document.");
      return;
    }

    const newDocument: KnowledgeDocument = {
      id: `${file.name}-${Date.now()}`,
      name: file.name,
      size: formatBytes(file.size),
      status: "processing",
    };

    setDocuments((current) => [newDocument, ...current]);
    setIsUploading(true);

    // TODO: INTEGRATION POINT - Replace this timeout with a fetch call that uploads the PDF to your Node/Python ingestion API and updates status from its response.
    window.setTimeout(() => {
      setDocuments((current) =>
        current.map((document) =>
          document.id === newDocument.id ? { ...document, status: "indexed" } : document,
        ),
      );
      setIsUploading(false);
    }, 2000);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    ingestFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    ingestFile(event.dataTransfer.files?.[0]);
  };

  const sendMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedInput = input.trim();
    if (!trimmedInput || isTyping) return;

    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: "user", content: trimmedInput },
    ]);
    setInput("");
    setIsTyping(true);

    // TODO: INTEGRATION POINT - Replace this timeout with a fetch call to your Node/Python RAG chat API, then append its answer and citation metadata.
    window.setTimeout(() => {
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content:
            "For a controlled Turbine A-12 shutdown, first reduce the load gradually to the minimum stable operating point. Confirm vibration and bearing-temperature readings are within normal limits, then initiate the standard shutdown from the control panel. Keep the lube-oil pump running through the prescribed coast-down period and do not isolate the unit until rotor speed reaches zero.",
          citation: { document: "Turbine A-12 Operating Manual.pdf", page: 47 },
        },
      ]);
      setIsTyping(false);
    }, 1500);
  };

  return (
    <main className="min-h-screen bg-slate-50 font-sans text-slate-800">
      <div className="mx-auto flex min-h-screen max-w-[1800px]">
        <aside className="hidden w-1/3 min-w-[340px] flex-col border-r border-slate-700 bg-slate-900 p-6 lg:flex xl:p-8">
          <div className="mb-9 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-600 shadow-lg shadow-blue-950/30">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-base font-semibold tracking-tight text-white">DocOps</p>
              <p className="text-xs font-medium text-slate-400">Industrial Knowledge Copilot</p>
            </div>
          </div>

          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Knowledge Base Ingestion</p>
              <p className="mt-1 text-xs text-slate-400">Add manuals for your field team</p>
            </div>
            <ShieldCheck className="h-5 w-5 text-emerald-400" aria-label="Secure workspace" />
          </div>

          <div
            className={`rounded-2xl border border-dashed p-6 text-center transition sm:p-8 ${
              isDragging
                ? "border-blue-400 bg-blue-500/15"
                : "border-slate-600 bg-slate-800/70 hover:border-slate-500"
            }`}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-600/15 text-blue-400">
              {isUploading ? <LoaderCircle className="h-6 w-6 animate-spin" /> : <UploadCloud className="h-6 w-6" />}
            </div>
            <p className="mt-4 text-sm font-semibold text-slate-100">
              {isUploading ? "Indexing your document…" : "Drop PDF manuals here"}
            </p>
            <p className="mt-1.5 text-xs leading-5 text-slate-400">or browse files from your computer</p>
            <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
            <button
              type="button"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="mt-5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Select PDF
            </button>
          </div>

          <div className="mt-8 flex min-h-0 flex-1 flex-col">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-slate-400" />
                <h2 className="text-sm font-semibold text-white">Active Documents</h2>
              </div>
              <span className="rounded-full bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-400">{documents.length}</span>
            </div>
            <div className="space-y-2 overflow-y-auto pr-1">
              {documents.map((document) => (
                <div key={document.id} className="rounded-xl border border-slate-700 bg-slate-800/70 p-3.5">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-700 text-slate-300">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-slate-200" title={document.name}>{document.name}</p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-500">{document.size}</span>
                        {document.status === "indexed" ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Indexed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400">
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Processing
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <section className="flex min-h-screen w-full flex-col bg-slate-50 lg:w-2/3">
          <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 lg:hidden">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-bold tracking-tight text-slate-900 sm:text-base">Technician Assistant</h1>
                  <span className="hidden h-2 w-2 rounded-full bg-emerald-400 sm:block" />
                </div>
                <p className="mt-0.5 text-xs text-slate-500">Grounded in your plant documentation</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Online
            </div>
          </header>

          <div ref={feedRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <div className="mx-auto max-w-3xl space-y-6">
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">
                Answers cite the source manual used. Always follow your site’s safety procedures and escalation policy.
              </div>

              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[88%] sm:max-w-[78%] ${message.role === "user" ? "items-end" : "items-start"}`}>
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                        message.role === "user"
                          ? "rounded-br-md bg-blue-600 text-white"
                          : "rounded-bl-md border border-slate-200 bg-white text-slate-700"
                      }`}
                    >
                      {message.content}
                    </div>
                    {message.citation && (
                      <div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm">
                        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">
                          <FileText className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] font-semibold text-slate-700">{message.citation.document}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">Source citation · Page {message.citation.page}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                      </div>
                    )}
                  </div>
                </div>
              ))}

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

          <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
            <form onSubmit={sendMessage} className="mx-auto flex max-w-3xl items-end gap-2">
              <label htmlFor="technician-question" className="sr-only">Ask about a manual</label>
              <textarea
                id="technician-question"
                value={input}
                rows={1}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Ask a question about your manuals…"
                className="max-h-32 min-h-[48px] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
              <button
                type="submit"
                disabled={!input.trim() || isTyping}
                className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-blue-600 text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-45"
                aria-label="Send message"
              >
                {isTyping ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </button>
            </form>
            <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-slate-400">Shift + Enter for a new line</p>
          </div>
        </section>
      </div>
    </main>
  );
}
