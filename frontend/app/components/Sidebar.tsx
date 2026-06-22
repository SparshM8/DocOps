"use client";

import React from "react";
import { C, S, Icon } from "./Theme";

const NAV = [
  { id: "dashboard", icon: "dashboard",   label: "Dashboard"   },
  { id: "copilot",   icon: "smart_toy",   label: "AI Copilot"  },
  { id: "documents", icon: "description", label: "Documents"   },
  { id: "analytics", icon: "analytics",   label: "Analytics"   },
  { id: "team",      icon: "group",       label: "Team"        },
];

interface SidebarProps {
  active: string;
  onNav: (p: string) => void;
  onLogout: () => void;
  user: any;
}

export default function Sidebar({ active, onNav, onLogout, user }: SidebarProps) {
  return (
    <aside style={{
      position: "fixed", top: 0, left: 0, bottom: 0,
      width: 256, background: C.surf,
      borderRight: `2px solid ${C.border}`,
      display: "flex", flexDirection: "column",
      padding: "24px 16px",
      zIndex: 1000, overflowY: "auto",
    }}>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
        <div style={{
          width: 40, height: 40, background: C.primary, color: "#001a42",
          borderRadius: 10, border: `2px solid ${C.black}`, boxShadow: `3px 3px 0 ${C.black}`,
          display: "grid", placeItems: "center", flexShrink: 0,
        }}>
          <Icon name="bolt" size={22} />
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: C.primary, letterSpacing: -0.5 }}>DocOps</div>
          <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 2 }}>Enterprise v2.4</div>
        </div>
      </div>

      {/* Nav items */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {NAV.map(item => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNav(item.id)}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 12px", borderRadius: 10,
                fontSize: 14, fontWeight: isActive ? 700 : 500,
                color: isActive ? C.primary : C.muted,
                background: isActive ? `rgba(173,198,255,0.1)` : "transparent",
                border: isActive ? `2px solid ${C.primary}` : "2px solid transparent",
                cursor: "pointer", textAlign: "left", width: "100%",
                fontFamily: "inherit", transition: "all 0.15s",
                boxShadow: isActive ? `2px 2px 0 rgba(173,198,255,0.2)` : "none",
              }}
            >
              <Icon name={item.icon} size={20} color={isActive ? C.primary : C.muted} />
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ marginTop: "auto", paddingTop: 16, borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 12 }}>
        <button
          style={{ ...S.btnPrimary, justifyContent: "center", width: "100%", boxSizing: "border-box" }}
          onClick={() => onNav("copilot")}
        >
          <Icon name="add" size={18} color="#001a42" />
          New Query
        </button>
        {user && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 4px" }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: C.primary, color: "#001a42",
              display: "grid", placeItems: "center",
              fontWeight: 800, fontSize: 14, border: `2px solid ${C.black}`, flexShrink: 0
            }}>
              {user.username?.charAt(0)?.toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.username}</div>
              <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>{user.role?.replace("_", " ")}</div>
            </div>
            <button onClick={onLogout} title="Logout" style={{
              background: "none", border: "none", cursor: "pointer", color: C.muted,
              borderRadius: 6, padding: 4, display: "grid", placeItems: "center", flexShrink: 0
            }}>
              <Icon name="logout" size={18} color={C.muted} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
