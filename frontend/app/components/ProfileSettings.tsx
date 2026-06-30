"use client";

import React, { useState } from "react";
import { C, S, Icon } from "./Theme";

interface ProfileSettingsProps {
  user: any;
  token: string;
  onUpdateSuccess: (newToken: string, updatedUser: any) => void;
}

export default function ProfileSettings({ user, token, onUpdateSuccess }: ProfileSettingsProps) {
  const [form, setForm] = useState({ username: user?.username || "", password: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });

  const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:3001";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage({ text: "", type: "" });

    if (form.password && form.password !== form.confirmPassword) {
      return setMessage({ text: "Passwords do not match.", type: "error" });
    }
    if (form.password && form.password.length < 6) {
      return setMessage({ text: "Password must be at least 6 characters.", type: "error" });
    }

    setLoading(true);
    try {
      const payload: any = {};
      if (form.username.trim() && form.username.trim() !== user.username) payload.username = form.username.trim();
      if (form.password) payload.password = form.password;

      if (Object.keys(payload).length === 0) {
        setLoading(false);
        return setMessage({ text: "No changes detected.", type: "info" });
      }

      const res = await fetch(`${GATEWAY}/api/auth/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to update profile");

      onUpdateSuccess(data.token, data.user);
      setMessage({ text: "✓ Profile updated successfully!", type: "success" });
      setForm(prev => ({ ...prev, password: "", confirmPassword: "" }));
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", maxWidth: 460,
    background: "rgba(0,0,0,0.3)",
    border: `1px solid ${C.border}`,
    borderRadius: 10, padding: "12px 16px",
    fontSize: 15, color: C.text, outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
    fontFamily: "inherit",
  };

  return (
    <div className="fade-up" style={{ padding: "36px 40px", maxWidth: 860, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 30, fontWeight: 800, color: C.text, margin: 0 }}>My Profile</h2>
        <p style={{ color: C.muted, fontSize: 15, marginTop: 6 }}>Manage your personal information and credentials.</p>
      </div>

      {/* Profile Card */}
      <div style={{ ...S.card, padding: 32, marginBottom: 24 }}>
        {/* Avatar row */}
        <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 32, paddingBottom: 28, borderBottom: `1px solid ${C.border}` }}>
          <div style={{
            width: 88, height: 88, borderRadius: "50%",
            background: `linear-gradient(135deg, ${C.primary}, #2563eb)`,
            display: "grid", placeItems: "center",
            fontWeight: 900, fontSize: 36, color: "#fff",
            boxShadow: `0 8px 24px rgba(77,142,255,0.4)`,
            flexShrink: 0, userSelect: "none",
          }}>
            {user?.username?.charAt(0)?.toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>{user?.username}</div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8,
              background: "rgba(77,142,255,0.12)", border: `1px solid rgba(77,142,255,0.25)`,
              padding: "5px 14px", borderRadius: 100,
              fontSize: 12, fontWeight: 700, color: C.primary, textTransform: "capitalize",
            }}>
              <Icon name="badge" size={14} color={C.primary} />
              {user?.role?.replace("_", " ")}
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>
              <Icon name="info" size={14} /> &nbsp;Your role is assigned by an administrator.
            </div>
          </div>
        </div>

        {/* Edit Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {/* Username */}
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Username</label>
              <input
                type="text"
                value={form.username}
                onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = C.primary; e.currentTarget.style.boxShadow = `0 0 0 3px rgba(77,142,255,0.15)`; }}
                onBlur={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.boxShadow = "none"; }}
              />
            </div>

            {/* New Password */}
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>New Password</label>
              <input
                type="password"
                value={form.password}
                placeholder="Leave blank to keep current password"
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = C.primary; e.currentTarget.style.boxShadow = `0 0 0 3px rgba(77,142,255,0.15)`; }}
                onBlur={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.boxShadow = "none"; }}
              />
            </div>

            {/* Confirm Password — only visible if they're typing one */}
            {form.password && (
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Confirm New Password</label>
                <input
                  type="password"
                  value={form.confirmPassword}
                  placeholder="Re-enter your new password"
                  onChange={e => setForm(p => ({ ...p, confirmPassword: e.target.value }))}
                  style={{ ...inputStyle, borderColor: form.confirmPassword && form.confirmPassword !== form.password ? C.error : C.border }}
                  onFocus={e => { e.currentTarget.style.borderColor = C.primary; e.currentTarget.style.boxShadow = `0 0 0 3px rgba(77,142,255,0.15)`; }}
                  onBlur={e => { e.currentTarget.style.borderColor = form.confirmPassword !== form.password ? C.error : C.border; e.currentTarget.style.boxShadow = "none"; }}
                />
              </div>
            )}

            {/* Status Message */}
            {message.text && (
              <div style={{
                background: message.type === "error" ? "rgba(255,180,171,0.1)" : message.type === "success" ? "rgba(78,222,163,0.1)" : "rgba(173,198,255,0.08)",
                border: `1px solid ${message.type === "error" ? "rgba(255,180,171,0.4)" : message.type === "success" ? "rgba(78,222,163,0.4)" : C.border}`,
                borderRadius: 10, padding: "12px 16px", fontSize: 14,
                color: message.type === "error" ? C.error : message.type === "success" ? C.accent : C.primary,
                maxWidth: 460,
              }}>
                {message.text}
              </div>
            )}

            {/* Submit */}
            <div style={{ paddingTop: 4 }}>
              <button
                type="submit"
                disabled={loading}
                style={{
                  ...S.btnPrimary,
                  opacity: loading ? 0.6 : 1,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
                onMouseOver={e => { if (!loading) e.currentTarget.style.transform = "translateY(-1px)"; }}
                onMouseOut={e => { e.currentTarget.style.transform = "none"; }}
              >
                {loading ? <><Icon name="hourglass_empty" size={16} color="#fff" /> Saving…</> : <><Icon name="save" size={16} color="#fff" /> Save Changes</>}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Danger Zone */}
      <div style={{ ...S.card, padding: 24, borderColor: "rgba(255,180,171,0.2)", background: "rgba(255,100,80,0.04)" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.error, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="warning" size={18} color={C.error} /> Danger Zone
        </div>
        <p style={{ color: C.muted, fontSize: 13, marginBottom: 16 }}>Once you log out, you will need to enter your credentials to access the system again.</p>
        <button
          style={{
            background: "rgba(255,180,171,0.1)", border: `1px solid rgba(255,180,171,0.35)`,
            borderRadius: 10, padding: "10px 20px", fontSize: 14, fontWeight: 600,
            color: C.error, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8,
            fontFamily: "inherit", transition: "all 0.2s",
          }}
          onMouseOver={e => { e.currentTarget.style.background = "rgba(255,180,171,0.2)"; }}
          onMouseOut={e => { e.currentTarget.style.background = "rgba(255,180,171,0.1)"; }}
          onClick={() => { localStorage.removeItem("docops_token"); localStorage.removeItem("docops_user"); window.location.reload(); }}
        >
          <Icon name="logout" size={16} color={C.error} /> Sign Out of DocOps
        </button>
      </div>
    </div>
  );
}
