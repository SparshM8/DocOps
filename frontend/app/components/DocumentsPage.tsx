"use client";

import React, { useRef, useState } from "react";
import { C, S, Icon } from "./Theme";

interface DocumentProps {
  token: string;
  user: any;
  docs: any[];
  fetchDocs: () => Promise<void>;
}

export default function DocumentsPage({ token, user, docs, fetchDocs }: DocumentProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:3001";

  const handleIngest = async (file?: File) => {
    if (!file || isUploading || !token) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      alert("Only PDF manuals are supported.");
      return;
    }

    setIsUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${GATEWAY}/api/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error(errData.detail);
      }

      await fetchDocs();
    } catch (err: any) {
      alert(`Ingestion failed: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (doc: any) => {
    if (!confirm(`Are you sure you want to delete "${doc.name}" and erase all indexed vector nodes?`)) return;

    try {
      // 1. Delete from DB via Gateway
      const res = await fetch(`${GATEWAY}/api/documents/${doc._id || doc.docId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Delete failed");
      }

      // 2. Also remove from Python backend vector index
      await fetch(`${GATEWAY}/api/documents/${doc.docId}/delete-vectors`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ source_name: doc.name })
      }).catch(err => console.warn("Failed to clear vector index, cleanup required:", err));

      if (selectedDoc?.docId === doc.docId) {
        setSelectedDoc(null);
      }

      await fetchDocs();
    } catch (err: any) {
      alert(`Failed to delete: ${err.message}`);
    }
  };

  const fmtBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    const k = bytes / 1024;
    if (k < 1024) return `${k.toFixed(1)} KB`;
    return `${(k / 1024).toFixed(1)} MB`;
  };

  const filteredDocs = docs.filter(d => d.name.toLowerCase().includes(filterQuery.toLowerCase()));

  const isManager = user?.role === "plant_manager";

  return (
    <div style={{ padding: 28, overflowY: "auto", minHeight: "100%" }}>
      {/* Title */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, color: C.text }}>Document Vault Ingestion</h2>
        <p style={{ color: C.muted, fontSize: 14, marginTop: 4 }}>
          Upload PDF manuals, standard operating procedures (SOPs), or regulatory protocols.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: selectedDoc ? "1.4fr 1.1fr" : "1fr", gap: 24 }}>
        
        {/* Main Panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Drag & Drop Upload (Plant Managers only) */}
          {isManager ? (
            <div
              onDragEnter={e => { e.preventDefault(); setIsDragging(true); }}
              onDragOver={e => e.preventDefault()}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => { e.preventDefault(); setIsDragging(false); handleIngest(e.dataTransfer.files?.[0]); }}
              style={{
                ...S.card,
                border: `2px dashed ${isDragging ? C.primary : C.border}`,
                padding: "36px 20px",
                textAlign: "center",
                background: isDragging ? "rgba(173,198,255,0.05)" : C.surf,
                cursor: "pointer",
                transition: "all 0.15s",
                boxShadow: isDragging ? `6px 6px 0 ${C.primary}` : S.card.boxShadow
              }}
            >
              <Icon name={isUploading ? "hourglass_empty" : "cloud_upload"} size={42} color={C.primary} />
              <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 12, color: C.text }}>
                {isUploading ? "Processing & Indexing Manual..." : "Drag & Drop Manual PDF"}
              </h3>
              <p style={{ fontSize: 12, color: C.muted, margin: "8px 0 16px" }}>
                Supports standard PDF files up to 50 MB. Text will be chunked and embedded locally.
              </p>
              <input ref={fileRef} type="file" accept="application/pdf" style={{ display: "none" }}
                onChange={e => { handleIngest(e.target.files?.[0]); e.target.value = ""; }} />
              <button disabled={isUploading} onClick={() => fileRef.current?.click()} style={S.btnPrimary}>
                <Icon name="attach_file" size={16} color="#001a42" /> Select Document
              </button>
            </div>
          ) : (
            <div style={{ ...S.card, padding: 20, background: "rgba(255,180,171,0.05)", border: `2px solid ${C.error}` }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <Icon name="lock" size={24} color={C.error} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.error }}>Ingestion Restricted</div>
                  <div style={{ fontSize: 12, color: C.muted }}>Only Plant Managers have write permissions to ingest new manuals.</div>
                </div>
              </div>
            </div>
          )}

          {/* Table Container */}
          <div style={{ ...S.card, padding: 20 }}>
            {/* Table Header Filter */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Indexed Manuals ({filteredDocs.length})</div>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                background: C.surf2, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: "6px 12px", width: 220
              }}>
                <Icon name="search" size={16} color={C.muted} />
                <input
                  placeholder="Filter by filename..."
                  value={filterQuery}
                  onChange={e => setFilterQuery(e.target.value)}
                  style={{ background: "none", border: "none", outline: "none", fontSize: 12, color: C.text, width: "100%" }}
                />
              </div>
            </div>

            {/* Manuals Table */}
            {filteredDocs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: C.muted, fontSize: 14 }}>
                No documents match the filter or have been ingested yet.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${C.border}`, fontSize: 11, textTransform: "uppercase", color: C.muted }}>
                      <th style={{ padding: "10px 8px" }}>Filename</th>
                      <th style={{ padding: "10px 8px" }}>Size</th>
                      <th style={{ padding: "10px 8px" }}>Status</th>
                      <th style={{ padding: "10px 8px", textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDocs.map(doc => {
                      const isSelected = selectedDoc?.docId === doc.docId;
                      return (
                        <tr
                          key={doc._id || doc.docId}
                          onClick={() => setSelectedDoc(doc)}
                          style={{
                            borderBottom: `1px solid ${C.border}`,
                            cursor: "pointer",
                            background: isSelected ? "rgba(173,198,255,0.06)" : "transparent",
                            transition: "background 0.1s"
                          }}
                        >
                          <td style={{ padding: "12px 8px", fontSize: 13, fontWeight: 600 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <Icon name="description" size={16} color={C.primary} />
                              <div style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {doc.name}
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: "12px 8px", fontSize: 12, color: C.muted }}>{fmtBytes(doc.sizeBytes)}</td>
                          <td style={{ padding: "12px 8px" }}>
                            <span style={{
                              padding: "2px 8px", borderRadius: 100, fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                              background: doc.status === "indexed" ? "rgba(78,222,163,0.12)" : doc.status === "processing" ? "rgba(245,158,11,0.12)" : "rgba(255,180,171,0.12)",
                              color: doc.status === "indexed" ? C.accent : doc.status === "processing" ? "#f59e0b" : C.error,
                              border: `1px solid ${doc.status === "indexed" ? "rgba(78,222,163,0.3)" : doc.status === "processing" ? "rgba(245,158,11,0.3)" : "rgba(255,180,171,0.3)"}`
                            }}>
                              {doc.status}
                            </span>
                          </td>
                          <td style={{ padding: "12px 8px", textAlign: "right" }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: "inline-flex", gap: 8 }}>
                              <button
                                onClick={() => setSelectedDoc(doc)}
                                style={{ background: "none", border: "none", cursor: "pointer", color: C.primary, padding: 4 }}
                                title="Inspect Entities"
                              >
                                <Icon name="visibility" size={18} />
                              </button>
                              {isManager && (
                                <button
                                  onClick={() => handleDelete(doc)}
                                  style={{ background: "none", border: "none", cursor: "pointer", color: C.error, padding: 4 }}
                                  title="Delete Document"
                                >
                                  <Icon name="delete" size={18} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Entity Inspector Panel */}
        {selectedDoc && (
          <div style={{ ...S.card, padding: 24, alignSelf: "start", position: "relative" }}>
            <button
              onClick={() => setSelectedDoc(null)}
              style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", color: C.muted }}
            >
              <Icon name="close" size={20} />
            </button>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
              <Icon name="hub" size={24} color={C.primary} />
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800 }}>Metadata Inspector</h3>
                <span style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>{selectedDoc.docId}</span>
              </div>
            </div>

            <div style={{ marginBottom: 16, borderBottom: `1px solid ${C.border}`, paddingBottom: 12 }}>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Document Reference</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{selectedDoc.name}</div>
            </div>

            {/* Render entity lists */}
            {[
              { title: "Equipment Tags Detected", key: "equipment_tags", icon: "build", color: C.primary },
              { title: "Process Parameters", key: "process_parameters", icon: "settings_input_component", color: C.second },
              { title: "Safety Regulations Cited", key: "safety_standards", icon: "policy", color: C.error },
            ].map(group => {
              const tagsList = selectedDoc.entities?.[group.key] || [];
              return (
                <div key={group.key} style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 8 }}>
                    <Icon name={group.icon} size={15} color={group.color} />
                    {group.title}
                  </div>
                  {tagsList.length === 0 ? (
                    <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic" }}>None identified</div>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {tagsList.map((t: string) => (
                        <span
                          key={t}
                          style={{
                            fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 8,
                            background: `${group.color}15`, color: group.color, border: `1px solid ${group.color}35`
                          }}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
