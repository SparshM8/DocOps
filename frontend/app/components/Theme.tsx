"use client";

import React from "react";

// Design tokens
export const C = {
  bg:      "#0b1326",
  surf:    "#131b2e",
  surf2:   "#1a2540",
  surf3:   "#222d4a",
  border:  "#2d3a55",
  primary: "#adc6ff",
  priDark: "#4d8eff",
  second:  "#d0bcff",
  accent:  "#4edea3",
  error:   "#ffb4ab",
  text:    "#dae2fd",
  muted:   "#8896b3",
  purple:  "#571bc1",
  black:   "#000000",
};

// Shared style objects
export const S = {
  card: {
    background: C.surf,
    border: `2px solid ${C.black}`,
    boxShadow: `6px 6px 0 ${C.black}`,
    borderRadius: 12,
  } as React.CSSProperties,
  btnPrimary: {
    background: C.primary,
    color: "#001a42",
    border: `2px solid ${C.black}`,
    boxShadow: `4px 4px 0 ${C.black}`,
    borderRadius: 10,
    padding: "12px 24px",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontFamily: "inherit",
    transition: "all 0.1s",
  } as React.CSSProperties,
  btnGhost: {
    background: C.surf2,
    color: C.text,
    border: `2px solid ${C.border}`,
    boxShadow: `3px 3px 0 ${C.black}`,
    borderRadius: 10,
    padding: "12px 24px",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontFamily: "inherit",
    transition: "all 0.1s",
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
