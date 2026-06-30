"use client";

import React from "react";

// Design tokens
export const C = {
  bg:      "#030712",
  surf:    "rgba(19, 27, 46, 0.4)",
  surf2:   "rgba(26, 37, 64, 0.5)",
  surf3:   "rgba(34, 45, 74, 0.6)",
  border:  "rgba(173, 198, 255, 0.1)",
  primary: "#4d8eff",
  priDark: "#3b72db",
  second:  "#d0bcff",
  accent:  "#4edea3",
  error:   "#ffb4ab",
  text:    "#f8fafc",
  muted:   "#94a3b8",
  purple:  "#8b5cf6",
  black:   "#000000",
};

// Shared style objects
export const S = {
  card: {
    background: C.surf,
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    border: `1px solid ${C.border}`,
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
    borderRadius: 16,
  } as React.CSSProperties,
  btnPrimary: {
    background: `linear-gradient(135deg, ${C.primary}, #2563eb)`,
    color: "#ffffff",
    border: "none",
    boxShadow: `0 4px 14px rgba(77, 142, 255, 0.3)`,
    borderRadius: 12,
    padding: "12px 24px",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontFamily: "inherit",
    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
  } as React.CSSProperties,
  btnGhost: {
    background: "rgba(255, 255, 255, 0.05)",
    backdropFilter: "blur(8px)",
    color: C.text,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: "12px 24px",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontFamily: "inherit",
    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
  } as React.CSSProperties,
};

// Component: Icon
export function Icon({ name, size = 20, color }: { name: string; size?: number; color?: string }) {
  return (
    <span
      className="material-symbols-outlined"
      style={{ fontSize: size, color, display: "inline-flex", alignItems: "center", lineHeight: 1 }}
    >
      {name}
    </span>
  );
}
