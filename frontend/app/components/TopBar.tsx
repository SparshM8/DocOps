"use client";

import React from "react";
import { C, Icon } from "./Theme";

interface TopBarProps {
  user: any;
}

export default function TopBar({ user }: TopBarProps) {
  return (
    <header style={{
      position: "fixed", top: 0, left: 256, right: 0, height: 64,
      background: "rgba(11,19,38,0.9)", backdropFilter: "blur(16px)",
      borderBottom: `1px solid ${C.border}`,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 28px", zIndex: 900,
    }}>
      {/* Search */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        background: C.surf2, border: `2px solid ${C.border}`,
        borderRadius: 10, padding: "8px 16px",
        boxShadow: `2px 2px 0 ${C.black}`, width: 300
      }}>
        <Icon name="search" size={18} color={C.muted} />
        <input
          placeholder="Search documents, tags, queries..."
          style={{
            background: "none", border: "none", outline: "none",
            fontSize: 13, color: C.text, width: "100%", fontFamily: "inherit"
          }}
        />
      </div>

      {/* Right actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {[
          { icon: "notifications", badge: true },
          { icon: "help_outline", badge: false },
        ].map(btn => (
          <button key={btn.icon} style={{
            position: "relative", background: "none", border: "none",
            cursor: "pointer", color: C.muted, borderRadius: 8,
            width: 36, height: 36, display: "grid", placeItems: "center"
          }}>
            <Icon name={btn.icon} size={20} color={C.muted} />
            {btn.badge && (
              <span style={{
                position: "absolute", top: 6, right: 6,
                width: 8, height: 8, background: C.error,
                borderRadius: "50%", border: `2px solid ${C.bg}`
              }} />
            )}
          </button>
        ))}
        <div style={{ width: 1, height: 28, background: C.border }} />
        {user && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1 }}>{user.username}</div>
              <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1.5, marginTop: 2 }}>
                {user.role?.replace("_", " ")}
              </div>
            </div>
            <div style={{
              width: 38, height: 38, borderRadius: "50%",
              background: C.primary, color: "#001a42",
              display: "grid", placeItems: "center",
              fontWeight: 800, fontSize: 15,
              border: `2px solid ${C.black}`, boxShadow: `2px 2px 0 ${C.black}`,
            }}>
              {user.username?.charAt(0)?.toUpperCase()}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
