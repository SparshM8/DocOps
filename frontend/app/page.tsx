"use client";

import React, { useState, useEffect, useCallback } from "react";
import { C, S, Icon } from "./components/Theme";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import DashboardHome from "./components/DashboardHome";
import CopilotWorkspace from "./components/CopilotWorkspace";
import DocumentsPage from "./components/DocumentsPage";
import AnalyticsPage from "./components/AnalyticsPage";
import ProfileSettings from "./components/ProfileSettings";
import SettingsPage from "./components/SettingsPage";

// ─── Auth Screen ──────────────────────────────────────────────────────────────
function AuthScreen({ onLogin }: { onLogin: (token: string, user: any) => void }) {
  const [mode, setMode]       = useState<"login" | "register">("login");
  const [form, setForm]       = useState({ username: "", password: "", role: "field_technician" });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:3001";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const ep = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const res = await fetch(`${GATEWAY}${ep}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Authentication failed");
      if (mode === "login") {
        localStorage.setItem("docops_token", data.token);
        localStorage.setItem("docops_user", JSON.stringify(data.user));
        onLogin(data.token, data.user);
      } else {
        setMode("login"); setError("Registered successfully! Please sign in.");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "transparent",
      padding: 20,
    }}>
      <div className="fade-up" style={{
        width: "100%", maxWidth: 420,
        ...S.card,
        padding: 36,
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 32 }}>
          <div style={{
            width: 48, height: 48, 
            background: `linear-gradient(135deg, ${C.primary}, #2563eb)`,
            color: "#ffffff",
            borderRadius: 12, border: "none", boxShadow: "0 4px 14px rgba(77, 142, 255, 0.4)",
            display: "grid", placeItems: "center",
          }}>
            <Icon name="bolt" size={26} color="#ffffff" />
          </div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, color: C.primary }}>DocOps</div>
            <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 2, marginTop: 2 }}>Enterprise v2.4</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {[
            { label: "Username", key: "username", type: "text",     placeholder: "your_username" },
            { label: "Password", key: "password", type: "password", placeholder: "••••••••"     },
          ].map(f => (
            <div key={f.key}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
                {f.label}
              </label>
              <input
                required type={f.type} placeholder={f.placeholder}
                value={(form as any)[f.key]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                style={{
                  width: "100%", background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`,
                  borderRadius: 10, padding: "12px 16px", fontSize: 14, color: C.text,
                  outline: "none", fontFamily: "inherit",
                  boxSizing: "border-box", transition: "border-color 0.2s",
                }}
                onFocus={e => { e.currentTarget.style.borderColor = C.primary; }}
                onBlur={e => { e.currentTarget.style.borderColor = C.border; }}
              />
            </div>
          ))}
          {mode === "register" && (
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Role</label>
              <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                style={{ width: "100%", background: C.surf2, border: `2px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 14, color: C.text, outline: "none", boxShadow: `2px 2px 0 ${C.black}`, fontFamily: "inherit", boxSizing: "border-box" }}>
                <option value="field_technician">Field Technician</option>
                <option value="plant_manager">Plant Manager</option>
              </select>
            </div>
          )}

          {error && (
            <div style={{ background: "rgba(255,180,171,0.1)", border: "1px solid rgba(255,180,171,0.4)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: C.error }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            ...S.btnPrimary, justifyContent: "center", width: "100%",
            padding: "14px", fontSize: 15, marginTop: 4,
            opacity: loading ? 0.6 : 1, boxSizing: "border-box",
          }}>
            {loading ? "Initializing..." : mode === "login" ? "Access Network" : "Create Node"}
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: C.muted }}>
          {mode === "login" ? "No account? " : "Have an account? "}
          <button onClick={() => { setMode(m => m === "login" ? "register" : "login"); setError(""); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: C.primary, fontWeight: 700, fontSize: 13, fontFamily: "inherit" }}>
            {mode === "login" ? "Register" : "Sign In"}
          </button>
        </p>
      </div>
    </div>
  );
}

// ─── Main Page Router ──────────────────────────────────────────────────────────
type KnowledgeDoc = {
  _id: string;
  docId: string;
  name: string;
  sizeBytes: number;
  status: "processing" | "indexed" | "failed";
  entities?: { equipment_tags: string[]; process_parameters: string[]; safety_standards: string[] };
};

type UserData = {
  id: string;
  username: string;
  role: string;
};

export default function Page() {
  const [token, setToken] = useState<string | null>(null);
  const [user,  setUser]  = useState<UserData | null>(null);
  const [docs,  setDocs]  = useState<KnowledgeDoc[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [activePath, setActivePath] = useState("dashboard");

  const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:3001";

  useEffect(() => {
    const t = localStorage.getItem("docops_token");
    const u = localStorage.getItem("docops_user");
    if (t && u) {
      setToken(t);
      setUser(JSON.parse(u));
    }
  }, []);

  const fetchDocs = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${GATEWAY}/api/documents`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDocs(data);
        
        // Extract unique equipment tags
        const tags = new Set<string>();
        data.forEach((d: KnowledgeDoc) => d.entities?.equipment_tags?.forEach(t => tags.add(t)));
        setAllTags(Array.from(tags));
      }
    } catch (err) {
      console.error("Failed to load documents list", err);
    }
  }, [token, GATEWAY]);

  useEffect(() => {
    if (token) fetchDocs();
  }, [token, fetchDocs]);

  const logout = () => {
    localStorage.removeItem("docops_token");
    localStorage.removeItem("docops_user");
    setToken(null);
    setUser(null);
    setDocs([]);
    setAllTags([]);
  };

  const indexedCount = docs.filter(d => d.status === "indexed").length;

  if (!token) {
    return <AuthScreen onLogin={(t, u) => { setToken(t); setUser(u); }} />;
  }

  return (
    <div style={{ position: "relative", minHeight: "100vh", background: C.bg }}>
      <Sidebar active={activePath} onNav={setActivePath} onLogout={logout} user={user} />
      <TopBar user={user} onLogout={logout} onNavigate={setActivePath} />

      <main style={{ marginLeft: 260, paddingTop: 64, minHeight: "100vh" }}>
        {activePath === "dashboard" && (
          <DashboardHome onNavigate={setActivePath} token={token} />
        )}
        {activePath === "copilot" && (
          <CopilotWorkspace
            token={token}
            user={user}
            docs={docs}
            allTags={allTags}
            indexedCount={indexedCount}
            fetchDocs={fetchDocs}
          />
        )}
        {activePath === "documents" && (
          <DocumentsPage
            token={token}
            user={user}
            docs={docs}
            fetchDocs={fetchDocs}
          />
        )}
        {activePath === "analytics" && (
          <AnalyticsPage
            token={token}
            docs={docs}
          />
        )}
        {activePath === "team" && (
          <div style={{ padding: 40 }}>
            <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, color: C.text }}>DocOps Team</h2>
            <p style={{ color: C.muted, fontSize: 15 }}>
              Currently logged in as a <strong>{user?.role?.replace("_", " ")}</strong>. Team management controls are under active design.
            </p>
          </div>
        )}
        {activePath === "profile" && (
          <ProfileSettings
            user={user}
            token={token}
            onUpdateSuccess={(newToken, updatedUser) => {
              setToken(newToken);
              setUser(updatedUser);
              localStorage.setItem("docops_token", newToken);
              localStorage.setItem("docops_user", JSON.stringify(updatedUser));
            }}
          />
        )}
        {activePath === "settings" && (
          <SettingsPage user={user} />
        )}
      </main>

      {/* Floating AI Action Button */}
      <button
        onClick={() => setActivePath("copilot")}
        title="Open AI Copilot"
        style={{
          position: "fixed", bottom: 28, right: 28,
          width: 60, height: 60, borderRadius: "50%",
          background: `linear-gradient(135deg, ${C.primary}, #2563eb)`, color: "#ffffff",
          border: "none", boxShadow: `0 8px 24px rgba(77, 142, 255, 0.4)`,
          cursor: "pointer", display: "grid", placeItems: "center",
          zIndex: 9999, fontSize: 28, fontFamily: "inherit",
          transition: "transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
        }}
        onMouseOver={e => e.currentTarget.style.transform = "scale(1.05)"}
        onMouseOut={e => e.currentTarget.style.transform = "scale(1)"}
      >
        <Icon name="smart_toy" size={28} color="#ffffff" />
      </button>
    </div>
  );
}
