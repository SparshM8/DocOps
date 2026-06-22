"use client";

import React, { useEffect, useState } from "react";
import { C, S, Icon } from "./Theme";

interface DashboardProps {
  onNavigate: (path: string) => void;
  token: string;
}

export default function DashboardHome({ onNavigate, token }: DashboardProps) {
  const [stats, setStats] = useState({
    vector_count: 0,
    document_count: 0,
    query_count: 0,
    user_count: 0,
    documents: [] as string[],
    offline_mock: false,
  });
  const [health, setHealth] = useState({
    gateway: "loading",
    database: "loading",
    ai_backend: "loading",
  });
  const [loading, setLoading] = useState(true);

  const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:3001";

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        // Fetch health
        const hRes = await fetch(`${GATEWAY}/api/health`);
        if (hRes.ok) {
          const hData = await hRes.json();
          setHealth(hData);
        }

        // Fetch stats
        const sRes = await fetch(`${GATEWAY}/api/stats`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (sRes.ok) {
          const sData = await sRes.json();
          setStats(sData);
        }
      } catch (err) {
        console.error("Error loading dashboard data", err);
      } finally {
        setLoading(false);
      }
    }

    if (token) {
      fetchDashboardData();
    }
  }, [token, GATEWAY]);

  return (
    <div style={{ padding: 28, overflowY: "auto", minHeight: "100%" }}>
      {/* Hero */}
      <div style={{
        ...S.card,
        background: "linear-gradient(135deg, #1a2540 0%, #0d1f44 60%, #0b1326 100%)",
        padding: 48, marginBottom: 28, position: "relative", overflow: "hidden",
      }}>
        {/* Glow */}
        <div style={{
          position: "absolute", top: -80, right: -40, width: 360, height: 360,
          background: "radial-gradient(circle, rgba(77,142,255,0.12) 0%, transparent 70%)",
          pointerEvents: "none"
        }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: stats.offline_mock ? "rgba(245,158,11,0.2)" : "rgba(87,27,193,0.25)",
            border: stats.offline_mock ? "1px solid #f59e0b" : `1px solid ${C.purple}`,
            borderRadius: 100, padding: "5px 14px", marginBottom: 20,
            fontSize: 11, fontWeight: 700, color: stats.offline_mock ? "#fbbf24" : C.second,
            textTransform: "uppercase", letterSpacing: 1
          }}>
            <Icon name="bolt" size={13} color={stats.offline_mock ? "#fbbf24" : C.second} /> 
            {stats.offline_mock ? "Local Offline Mode Active" : "Enterprise Core Synced"}
          </div>
          <h2 style={{ fontSize: 42, fontWeight: 800, lineHeight: 1.15, marginBottom: 16, color: C.text }}>
            Orchestrate Your<br/>
            <span style={{ color: C.primary, fontStyle: "italic" }}>Living Documents</span>
          </h2>
          <p style={{ fontSize: 15, color: C.muted, maxWidth: 480, marginBottom: 32, lineHeight: 1.65 }}>
            DocOps transforms static plant documentation into dynamic knowledge nodes. Query manuals,
            regulatory codes, and failure reports using local AI.
          </p>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <button style={{ ...S.btnPrimary, padding: "14px 28px", fontSize: 15 }} onClick={() => onNavigate("copilot")}>
              <Icon name="smart_toy" size={18} color="#001a42" /> Open AI Copilot
            </button>
            <button style={{ ...S.btnGhost, padding: "14px 28px", fontSize: 15 }} onClick={() => onNavigate("copilot")}>
              <Icon name="hub" size={18} color={C.text} /> View Knowledge Graph
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 20, marginBottom: 28 }}>
        {[
          { label: "Indexed Vaults",   value: stats.document_count.toString(), color: C.primary,  trend: `${stats.documents.length} sources total`, trendIcon: "folder",      icon: "description" },
          { label: "Knowledge Nodes",  value: stats.vector_count.toLocaleString(), color: C.second,  trend: "Vector embeddings", trendIcon: "scatter_plot",  icon: "speed" },
          { label: "Active Queries",   value: stats.query_count.toString(), color: C.accent,  trend: "RAG searches logged",    trendIcon: "history",       icon: "group" },
          { label: "Registered Users", value: stats.user_count.toString(), color: C.error,   trend: "Authorized logins",      trendIcon: "verified_user", icon: "shield" },
        ].map(stat => (
          <div key={stat.label} style={{ ...S.card, padding: 24, position: "relative", overflow: "hidden" }}>
            <div style={{
              position: "absolute", right: -12, bottom: -12,
              fontSize: 80, opacity: 0.07, fontFamily: "Material Symbols Outlined",
              fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 48"
            }}>
              <Icon name={stat.icon} size={80} />
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
              {stat.label}
            </div>
            <div style={{ fontSize: 34, fontWeight: 800, color: stat.color, marginBottom: 8 }}>{stat.value}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, display: "flex", alignItems: "center", gap: 4 }}>
              <Icon name={stat.trendIcon} size={14} color={C.accent} /> {stat.trend}
            </div>
          </div>
        ))}
      </div>

      {/* System status & vaults */}
      <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1.2fr", gap: 20, paddingBottom: 32 }}>
        
        {/* System Health Status */}
        <div style={{ ...S.card, padding: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 20 }}>System Health Matrix</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[
              { name: "DocOps Gateway Proxy", status: health.gateway, icon: "dns", desc: "Express security firewall & rate-limiter" },
              { name: "Entity Database", status: health.database, icon: "database", desc: "User registry & manual index store" },
              { name: "AI Vector Engine", status: health.ai_backend, icon: "cpu", desc: "Ollama Embeddings & LangGraph ReAct agent pipeline" },
            ].map(sys => {
              const isOk = sys.status === "ok" || sys.status === "mongodb" || sys.status === "json-file" || sys.status.startsWith("ok");
              return (
                <div key={sys.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: C.surf2, borderRadius: 10, border: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <Icon name={sys.icon} size={22} color={C.primary} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{sys.name}</div>
                      <div style={{ fontSize: 11, color: C.muted }}>{sys.desc}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: isOk ? C.accent : sys.status === "loading" ? "#f59e0b" : C.error
                    }} />
                    <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: isOk ? C.accent : sys.status === "loading" ? "#f59e0b" : C.error }}>
                      {sys.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Shortcuts & Quick actions */}
        <div style={{ ...S.card, padding: 24, display: "flex", flexDirection: "column", justifySelf: "stretch" }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 20 }}>Quick Actions</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
            <button
              onClick={() => onNavigate("documents")}
              style={{ ...S.btnGhost, justifyContent: "flex-start", width: "100%", padding: "14px 20px" }}
            >
              <Icon name="upload_file" size={18} color={C.primary} />
              Ingest Plant Manual
            </button>
            <button
              onClick={() => onNavigate("copilot")}
              style={{ ...S.btnGhost, justifyContent: "flex-start", width: "100%", padding: "14px 20px" }}
            >
              <Icon name="rule" size={18} color={C.second} />
              Compliance Gap Analysis
            </button>
            <button
              onClick={() => onNavigate("analytics")}
              style={{ ...S.btnGhost, justifyContent: "flex-start", width: "100%", padding: "14px 20px" }}
            >
              <Icon name="history" size={18} color={C.accent} />
              Review Query Logs
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
