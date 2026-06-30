"use client";

import React, { useEffect, useState } from "react";
import { C, S, Icon } from "./Theme";
import ReactMarkdown from "react-markdown";

interface AnalyticsProps {
  token: string;
  docs: any[];
}

export default function AnalyticsPage({ token, docs }: AnalyticsProps) {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:3001";

  const fetchQueryHistory = async () => {
    try {
      const res = await fetch(`${GATEWAY}/api/query-history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.queries || []);
      }
    } catch (err) {
      console.error("Failed to load query logs", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchQueryHistory();
  }, [token, GATEWAY]);

  const [liveEvent, setLiveEvent] = useState<{ text: string, type: "doc" | "query" } | null>(null);
  const [telemetry, setTelemetry] = useState<{ asset: string, metrics: { vibration: number, temperature: number }, status: "critical" | "nominal", timestamp: string } | null>(null);

  useEffect(() => {
    const wsUrl = GATEWAY.replace("http", "ws") + "/ws/analytics";
    const ws = new WebSocket(wsUrl);
    
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "new_document") {
          setLiveEvent({ text: `New document indexed: ${msg.name}`, type: "doc" });
          setTimeout(() => setLiveEvent(null), 5000);
        } else if (msg.type === "new_query") {
          setLiveEvent({ text: `New search activity: "${msg.query}"`, type: "query" });
          setTimeout(() => setLiveEvent(null), 5000);
          fetchQueryHistory();
        } else if (msg.type === "telemetry") {
          setTelemetry(msg);
        }
      } catch (err) {}
    };
    return () => ws.close();
  }, [GATEWAY]);

  // Aggregate entity metrics
  let totalEquipment = 0;
  let totalParameters = 0;
  let totalStandards = 0;

  docs.forEach(d => {
    totalEquipment += (d.entities?.equipment_tags || []).length;
    totalParameters += (d.entities?.process_parameters || []).length;
    totalStandards += (d.entities?.safety_standards || []).length;
  });

  const grandTotal = totalEquipment + totalParameters + totalStandards;
  const eqPct = grandTotal > 0 ? Math.round((totalEquipment / grandTotal) * 100) : 0;
  const paramPct = grandTotal > 0 ? Math.round((totalParameters / grandTotal) * 100) : 0;
  const stdPct = grandTotal > 0 ? Math.round((totalStandards / grandTotal) * 100) : 0;

  const generateReport = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`${GATEWAY}/api/generate-report`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setReport(data.report);
        setShowModal(true);
      } else {
        alert("Failed to generate report (ensure you are logged in as plant_manager).");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div style={{ padding: 28, overflowY: "auto", minHeight: "100%" }}>
      {/* Title */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <h2 style={{ fontSize: 28, fontWeight: 800, color: C.text }}>System Analytics & Metrics</h2>
          <p style={{ color: C.muted, fontSize: 14, marginTop: 4 }}>
            Monitor entity density distributions and recent operator search patterns.
          </p>
        </div>
        
        {/* Live Event Indicator */}
        {liveEvent && (
          <div className="fade-up" style={{
            background: liveEvent.type === "doc" ? "rgba(78,222,163,0.15)" : "rgba(77,142,255,0.15)",
            border: `1px solid ${liveEvent.type === "doc" ? "rgba(78,222,163,0.3)" : "rgba(77,142,255,0.3)"}`,
            padding: "8px 16px", borderRadius: 100, display: "flex", alignItems: "center", gap: 8,
            color: liveEvent.type === "doc" ? C.accent : C.primary, fontSize: 13, fontWeight: 700
          }}>
            <Icon name={liveEvent.type === "doc" ? "description" : "search"} size={16} />
            {liveEvent.text}
            <span style={{ display: "inline-block", width: 8, height: 8, background: liveEvent.type === "doc" ? C.accent : C.primary, borderRadius: "50%", marginLeft: 4, animation: "pulse 1.5s infinite" }} />
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.9fr", gap: 24 }}>
        
        {/* Left Side: Entity Distributions & Telemetry */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          
          {/* Live IoT Telemetry Simulator */}
          <div style={{ ...S.card, padding: 24, border: telemetry?.status === "critical" ? "2px solid rgba(248,113,113,0.6)" : `1px solid ${C.border}`, position: "relative", overflow: "hidden" }}>
            {telemetry?.status === "critical" && (
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(248,113,113,0.1)", animation: "pulse 1s infinite", pointerEvents: "none" }} />
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800, display: "flex", alignItems: "center", gap: 8, color: telemetry?.status === "critical" ? "#f87171" : C.text }}>
                <Icon name="sensors" size={20} color={telemetry?.status === "critical" ? "#f87171" : C.primary} />
                Live IoT Telemetry
              </h3>
              {telemetry && (
                <span style={{ fontSize: 11, fontWeight: 700, color: telemetry.status === "critical" ? "#f87171" : "#34d399", background: telemetry.status === "critical" ? "rgba(248,113,113,0.1)" : "rgba(52,211,153,0.1)", padding: "4px 10px", borderRadius: 100, textTransform: "uppercase" }}>
                  {telemetry.status}
                </span>
              )}
            </div>

            {!telemetry ? (
              <div style={{ textAlign: "center", padding: "30px 0", color: C.muted, fontSize: 13, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <Icon name="settings_input_antenna" size={24} color={C.muted} />
                Awaiting sensor data...
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={{ background: "rgba(255,255,255,0.03)", padding: 16, borderRadius: 12, border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 4 }}>Asset Tag</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{telemetry.asset}</div>
                </div>
                <div style={{ background: "rgba(255,255,255,0.03)", padding: 16, borderRadius: 12, border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 4 }}>Temperature</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{telemetry.metrics.temperature}°C</div>
                </div>
                <div style={{ background: telemetry.status === "critical" ? "rgba(248,113,113,0.15)" : "rgba(255,255,255,0.03)", padding: 16, borderRadius: 12, border: telemetry.status === "critical" ? "1px solid rgba(248,113,113,0.3)" : `1px solid ${C.border}`, gridColumn: "span 2" }}>
                  <div style={{ fontSize: 12, color: telemetry.status === "critical" ? "#f87171" : C.muted, fontWeight: 600, marginBottom: 4 }}>Vibration (mm/s)</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: telemetry.status === "critical" ? "#f87171" : C.text }}>
                    {telemetry.metrics.vibration.toFixed(2)}
                  </div>
                  {telemetry.status === "critical" && (
                    <div style={{ fontSize: 11, color: "#f87171", marginTop: 4, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                      <Icon name="warning" size={14} /> Critical anomaly detected. AI RCA recommended.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div style={{ ...S.card, padding: 24 }}>
            <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 20 }}>Entity Density Distribution</h3>
            
            {grandTotal === 0 ? (
              <div style={{ textAlign: "center", padding: "30px 0", color: C.muted, fontSize: 13 }}>
                No entities mapped yet. Ingest documents to populate stats.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Equipment Tags */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.primary }} />
                      Equipment Tags
                    </div>
                    <span>{totalEquipment} ({eqPct}%)</span>
                  </div>
                  <div style={{ height: 10, background: C.surf3, borderRadius: 10, overflow: "hidden" }}>
                    <div style={{ width: `${eqPct}%`, height: "100%", background: C.primary, borderRadius: 10 }} />
                  </div>
                </div>

                {/* Parameters */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.second }} />
                      Process Parameters
                    </div>
                    <span>{totalParameters} ({paramPct}%)</span>
                  </div>
                  <div style={{ height: 10, background: C.surf3, borderRadius: 10, overflow: "hidden" }}>
                    <div style={{ width: `${paramPct}%`, height: "100%", background: C.second, borderRadius: 10 }} />
                  </div>
                </div>

                {/* Standards */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.error }} />
                      Safety Standards
                    </div>
                    <span>{totalStandards} ({stdPct}%)</span>
                  </div>
                  <div style={{ height: 10, background: C.surf3, borderRadius: 10, overflow: "hidden" }}>
                    <div style={{ width: `${stdPct}%`, height: "100%", background: C.error, borderRadius: 10 }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quick Metrics Card */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ background: C.surf2, padding: 14, borderRadius: 10, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: C.primary }}>{docs.length}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Documents Indexed</div>
            </div>
            <div style={{ background: C.surf2, padding: 14, borderRadius: 10, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: C.accent }}>{grandTotal}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Linked Entities</div>
            </div>
          </div>

          {/* AI Knowledge Extraction Card */}
          <div style={{ ...S.card, padding: 24, background: `linear-gradient(135deg, ${C.surf} 0%, rgba(87,27,193,0.06) 100%)` }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>AI Knowledge Extraction</h3>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>
              DocOps continuously analyzes system usage to identify operational blind spots and failure trends.
            </p>
            <button onClick={generateReport} disabled={generating} style={{
              ...S.btnPrimary, width: "100%", justifyContent: "center", opacity: generating ? 0.6 : 1
            }}>
              <Icon name="auto_awesome" size={18} color="#001a42" />
              {generating ? "Synthesizing Data..." : "Generate Weekly Lessons Learned"}
            </button>
          </div>
        </div>

        {/* Right Side: Query History Log */}
        <div style={{ ...S.card, padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h3 style={{ fontSize: 17, fontWeight: 800 }}>Audit Query logs</h3>
            <span style={{ fontSize: 11, color: C.muted, display: "flex", alignItems: "center", gap: 4 }}>
              <Icon name="history" size={14} /> Last 50 queries
            </span>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: C.muted, fontSize: 13 }}>
              Loading logs...
            </div>
          ) : history.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: C.muted, fontSize: 13 }}>
              No search queries logged yet.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: 460, overflowY: "auto", paddingRight: 4 }}>
              {history.map((q, idx) => (
                <div
                  key={idx}
                  style={{
                    background: C.surf2,
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                    padding: "12px 16px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0, paddingRight: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text, wordBreak: "break-all" }}>
                      {q.query}
                    </div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 6, display: "flex", gap: 8 }}>
                      <span>Session ID: {q.sid || "Anonymous"}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, whiteSpace: "nowrap" }}>
                    {q.ts ? new Date(q.ts).toLocaleTimeString() : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {showModal && report && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000
        }}>
          <div style={{
            background: C.surf, width: 600, maxHeight: "80vh", borderRadius: 16,
            padding: 32, overflowY: "auto", border: `2px solid ${C.border}`
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontSize: 20, fontWeight: 800, display: "flex", gap: 10, alignItems: "center", color: C.text }}>
                <Icon name="assignment" size={24} color={C.primary} />
                DocOps Auto-Generated Report
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", color: C.text, cursor: "pointer" }}>
                <Icon name="close" size={24} color={C.text} />
              </button>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.6, color: C.text, background: C.surf2, padding: 20, borderRadius: 10, border: `1px solid ${C.border}` }}>
              <ReactMarkdown>{report}</ReactMarkdown>
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
              <button onClick={() => setShowModal(false)} style={{ ...S.btnPrimary, padding: "10px 20px" }}>
                <Icon name="download" size={18} color="#001a42" />
                Export as PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
