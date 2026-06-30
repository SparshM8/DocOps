"use client";

import React, { useState } from "react";
import { C, S, Icon } from "./Theme";

interface SettingsPageProps {
  user: any;
}

type NotificationPrefs = {
  docProcessed: boolean;
  maintenanceAlerts: boolean;
  systemUpdates: boolean;
  complianceReports: boolean;
};

type DisplayPrefs = {
  compactMode: boolean;
  showQueryHistory: boolean;
  autoOpenCopilot: boolean;
  useWebLLM: boolean;
};

function Section({ title, description, icon, children }: { title: string; description: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={{ ...S.card, padding: 28, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 24, paddingBottom: 20, borderBottom: `1px solid ${C.border}` }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: "rgba(77,142,255,0.12)", border: `1px solid rgba(77,142,255,0.2)`,
          display: "grid", placeItems: "center",
        }}>
          <Icon name={icon} size={22} color={C.primary} />
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>{title}</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 3 }}>{description}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

function Toggle({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{label}</div>
        {description && <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{description}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        style={{
          width: 48, height: 26, borderRadius: 13, border: "none", cursor: "pointer",
          background: checked ? `linear-gradient(135deg, ${C.primary}, #2563eb)` : "rgba(255,255,255,0.1)",
          position: "relative", transition: "background 0.2s", flexShrink: 0,
          boxShadow: checked ? `0 2px 8px rgba(77,142,255,0.4)` : "none",
        }}
      >
        <span style={{
          position: "absolute", top: 3, left: checked ? 25 : 3,
          width: 20, height: 20, borderRadius: "50%", background: "#fff",
          transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
        }} />
      </button>
    </div>
  );
}

export default function SettingsPage({ user }: SettingsPageProps) {
  const [notifs, setNotifs] = useState<NotificationPrefs>({
    docProcessed: true,
    maintenanceAlerts: true,
    systemUpdates: false,
    complianceReports: true,
  });
  const [display, setDisplay] = useState<DisplayPrefs>({
    compactMode: false,
    showQueryHistory: true,
    autoOpenCopilot: false,
    useWebLLM: false,
  });
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    // Persist to localStorage for now
    localStorage.setItem("docops_notif_prefs", JSON.stringify(notifs));
    localStorage.setItem("docops_display_prefs", JSON.stringify(display));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  React.useEffect(() => {
    const n = localStorage.getItem("docops_notif_prefs");
    const d = localStorage.getItem("docops_display_prefs");
    if (n) setNotifs(JSON.parse(n));
    if (d) setDisplay(JSON.parse(d));
  }, []);

  return (
    <div className="fade-up" style={{ padding: "36px 40px", maxWidth: 860, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 32, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontSize: 30, fontWeight: 800, color: C.text, margin: 0 }}>Settings</h2>
          <p style={{ color: C.muted, fontSize: 15, marginTop: 6 }}>Configure your DocOps workspace preferences.</p>
        </div>
        <button
          onClick={handleSave}
          style={{
            ...S.btnPrimary,
            background: saved ? `linear-gradient(135deg, ${C.accent}, #059669)` : undefined,
            boxShadow: saved ? `0 4px 14px rgba(78,222,163,0.35)` : undefined,
            transition: "all 0.3s",
          }}
        >
          {saved ? <><Icon name="check_circle" size={16} color="#fff" /> Saved!</> : <><Icon name="save" size={16} color="#fff" /> Save Preferences</>}
        </button>
      </div>

      {/* Account Info (read-only) */}
      <Section title="Account Information" description="Overview of your current account details." icon="account_circle">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[
            { label: "Username", value: user?.username || "—", icon: "person" },
            { label: "Role", value: user?.role?.replace("_", " ") || "—", icon: "badge" },
            { label: "Session", value: "Active", icon: "verified_user" },
            { label: "Auth Method", value: "Password (PBKDF2)", icon: "lock" },
          ].map(item => (
            <div key={item.label} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "14px 18px", border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name={item.icon} size={13} color={C.muted} /> {item.label}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.text, textTransform: "capitalize" }}>{item.value}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: C.muted, marginTop: 16, display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="edit" size={13} color={C.muted} />
          To change your username or password, visit&nbsp;
          <strong style={{ color: C.primary }}>My Profile</strong>.
        </p>
      </Section>

      {/* Notifications */}
      <Section title="Notification Preferences" description="Control which system events alert you." icon="notifications">
        <Toggle
          label="Document Processed"
          description="Get notified when a PDF or diagram finishes indexing."
          checked={notifs.docProcessed}
          onChange={v => setNotifs(p => ({ ...p, docProcessed: v }))}
        />
        <Toggle
          label="Maintenance Alerts"
          description="Receive alerts for AI-generated equipment maintenance recommendations."
          checked={notifs.maintenanceAlerts}
          onChange={v => setNotifs(p => ({ ...p, maintenanceAlerts: v }))}
        />
        <Toggle
          label="Compliance Reports"
          description="Get notified when an OISD / Factory Act compliance report is ready."
          checked={notifs.complianceReports}
          onChange={v => setNotifs(p => ({ ...p, complianceReports: v }))}
        />
        <Toggle
          label="System Updates"
          description="Receive announcements about DocOps platform updates."
          checked={notifs.systemUpdates}
          onChange={v => setNotifs(p => ({ ...p, systemUpdates: v }))}
        />
      </Section>

      {/* Display */}
      <Section title="Display & Workspace" description="Customize how the DocOps interface behaves." icon="tune">
        <Toggle
          label="Compact Mode"
          description="Reduce spacing and padding for a denser information layout."
          checked={display.compactMode}
          onChange={v => setDisplay(p => ({ ...p, compactMode: v }))}
        />
        <Toggle
          label="Show Query History"
          description="Display previous AI queries in the Copilot sidebar for quick reference."
          checked={display.showQueryHistory}
          onChange={v => setDisplay(p => ({ ...p, showQueryHistory: v }))}
        />
        <Toggle
          label="Auto-open AI Copilot"
          description="Automatically navigate to AI Copilot after uploading a new document."
          checked={display.autoOpenCopilot}
          onChange={v => setDisplay(p => ({ ...p, autoOpenCopilot: v }))}
        />
        <Toggle
          label="Offline AI Inference (WebLLM)"
          description="Download and run Llama-3-8B entirely in your browser using WebGPU for true offline operation."
          checked={display.useWebLLM}
          onChange={v => setDisplay(p => ({ ...p, useWebLLM: v }))}
        />
      </Section>

      {/* Security */}
      <Section title="Security & Sessions" description="Review your active sessions and security posture." icon="security">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { label: "Current Session", desc: "Logged in · This device", status: "active", icon: "computer" },
          ].map(sess => (
            <div key={sess.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "14px 18px", border: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Icon name={sess.icon} size={20} color={C.primary} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{sess.label}</div>
                  <div style={{ fontSize: 12, color: C.muted }}>{sess.desc}</div>
                </div>
              </div>
              <span style={{
                background: "rgba(78,222,163,0.1)", border: "1px solid rgba(78,222,163,0.3)",
                borderRadius: 100, padding: "3px 12px", fontSize: 11, fontWeight: 700,
                color: C.accent, textTransform: "uppercase", letterSpacing: 1,
              }}>Active</span>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: C.muted, margin: "16px 0 0" }}>
          JWT tokens expire after 7 days. Password changes invalidate previous tokens immediately.
        </p>
      </Section>

      {/* Data Export (Air-gapped Sync) */}
      <Section title="Air-Gapped Data Sync" description="Export offline vector database state." icon="cloud_download">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "14px 18px", border: `1px solid ${C.border}` }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Export Knowledge Vault</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Downloads a complete Qdrant vector snapshot. Can be manually loaded onto air-gapped rugged tablets.</div>
          </div>
          <button 
            onClick={() => {
              const token = localStorage.getItem("docops_token");
              if (!token) return;
              const a = document.createElement('a');
              a.href = `${process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:3001"}/api/export-vault`;
              // Usually we'd want to fetch with headers to pass auth, but since it's a direct download link, we'll fetch then blob it
              fetch(a.href, { headers: { "Authorization": `Bearer ${token}` } })
                .then(r => r.blob())
                .then(blob => {
                  const url = window.URL.createObjectURL(blob);
                  const anchor = document.createElement('a');
                  anchor.href = url;
                  anchor.download = 'docops_vault_backup.zip';
                  anchor.click();
                  window.URL.revokeObjectURL(url);
                });
            }}
            style={{ ...S.btnPrimary, flexShrink: 0, padding: "8px 16px" }}
          >
            <Icon name="download" size={16} /> Export .zip
          </button>
        </div>
      </Section>

      {/* About */}
      <Section title="About DocOps" description="Platform version and technology stack." icon="info">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { label: "Platform Version", value: "Enterprise v2.4" },
            { label: "AI Architecture", value: "GraphRAG + Hybrid Search" },
            { label: "Vector Engine", value: "Qdrant + BM25 Ensemble" },
            { label: "Agent Framework", value: "LangGraph ReAct" },
            { label: "Document Ingestion", value: "PDF + P&ID Vision" },
            { label: "Auth Method", value: "JWT (RS256 ready)" },
          ].map(item => (
            <div key={item.label} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "10px 16px", background: "rgba(0,0,0,0.15)", borderRadius: 8, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8 }}>{item.label}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{item.value}</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
