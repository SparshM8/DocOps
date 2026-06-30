"use client";

import React from "react";
import { C, Icon } from "./Theme";

const NAV = [
  { id: "dashboard", icon: "dashboard",   label: "Dashboard"   },
  { id: "copilot",   icon: "smart_toy",   label: "AI Copilot"  },
  { id: "scanner",   icon: "qr_code_scanner", label: "AR Scanner"  },
  { id: "documents", icon: "description", label: "Documents"   },
  { id: "analytics", icon: "analytics",   label: "Analytics"   },
  { id: "team",      icon: "group",       label: "Team"        },
];

const NAV_BOTTOM = [
  { id: "profile",  icon: "person",   label: "My Profile" },
  { id: "settings", icon: "settings", label: "Settings"   },
];

interface SidebarProps {
  active: string;
  onNav: (p: string) => void;
  onLogout: () => void;
  user: any;
}

function NavButton({ item, isActive, onNav }: { item: { id: string; icon: string; label: string }; isActive: boolean; onNav: (p: string) => void }) {
  return (
    <button
      onClick={() => onNav(item.id)}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 14px", borderRadius: 10,
        fontSize: 14, fontWeight: isActive ? 700 : 500,
        color: isActive ? "#ffffff" : C.muted,
        background: isActive
          ? `linear-gradient(135deg, rgba(77,142,255,0.25), rgba(37,99,235,0.15))`
          : "transparent",
        border: isActive ? `1px solid rgba(77,142,255,0.35)` : "1px solid transparent",
        cursor: "pointer", textAlign: "left", width: "100%",
        fontFamily: "inherit", transition: "all 0.18s ease",
        boxShadow: isActive ? `0 4px 12px rgba(77,142,255,0.15)` : "none",
      }}
      onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = C.text; } }}
      onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.muted; } }}
    >
      <Icon name={item.icon} size={20} color={isActive ? C.primary : undefined} />
      {item.label}
    </button>
  );
}

export default function Sidebar({ active, onNav, onLogout, user }: SidebarProps) {
  return (
    <aside style={{
      position: "fixed", top: 0, left: 0, bottom: 0,
      width: 260,
      background: "rgba(5, 11, 20, 0.7)",
      backdropFilter: "blur(24px)",
      WebkitBackdropFilter: "blur(24px)",
      borderRight: `1px solid rgba(255,255,255,0.06)`,
      display: "flex",
      flexDirection: "column",
      padding: "24px 12px",
      zIndex: 100, overflowY: "auto",
    }}>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 36, paddingLeft: 4 }}>
        <div style={{
          width: 40, height: 40,
          background: `linear-gradient(135deg, ${C.primary}, #2563eb)`,
          borderRadius: 12, boxShadow: `0 4px 14px rgba(77,142,255,0.4)`,
          display: "grid", placeItems: "center", flexShrink: 0,
        }}>
          <Icon name="bolt" size={22} color="#ffffff" />
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: C.text, letterSpacing: -0.5 }}>DocOps</div>
          <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 2 }}>Enterprise v2.4</div>
        </div>
      </div>

      {/* Main Nav */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV.map(item => <NavButton key={item.id} item={item} isActive={active === item.id} onNav={onNav} />)}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "16px 4px" }} />

      {/* Account Nav */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV_BOTTOM.map(item => <NavButton key={item.id} item={item} isActive={active === item.id} onNav={onNav} />)}
      </div>

      {/* Footer: User Card + Logout */}
      <div style={{ marginTop: "auto", paddingTop: 16, borderTop: `1px solid rgba(255,255,255,0.06)` }}>
        {user && (
          <div
            onClick={() => onNav("profile")}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 8px", borderRadius: 12, cursor: "pointer",
              transition: "background 0.18s",
              border: "1px solid transparent",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.border = "1px solid rgba(255,255,255,0.08)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.border = "1px solid transparent"; }}
          >
            <div style={{
              width: 34, height: 34, borderRadius: "50%",
              background: `linear-gradient(135deg, ${C.primary}, #2563eb)`,
              display: "grid", placeItems: "center",
              fontWeight: 800, fontSize: 14, color: "#fff", flexShrink: 0,
              boxShadow: `0 2px 8px rgba(77,142,255,0.4)`,
            }}>
              {user.username?.charAt(0)?.toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.username}</div>
              <div style={{ fontSize: 10, color: C.muted, textTransform: "capitalize", letterSpacing: 0.5 }}>{user.role?.replace("_", " ")}</div>
            </div>
            <button
              onClick={e => { e.stopPropagation(); onLogout(); }}
              title="Logout"
              style={{
                background: "none", border: "none", cursor: "pointer",
                borderRadius: 6, padding: 4, display: "grid", placeItems: "center", flexShrink: 0,
              }}
              onMouseEnter={e => (e.currentTarget.querySelector("span")! as HTMLElement).style.color = C.error}
              onMouseLeave={e => (e.currentTarget.querySelector("span")! as HTMLElement).style.color = C.muted}
            >
              <Icon name="logout" size={18} color={C.muted} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
