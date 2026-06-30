"use client";

import React, { useState, useEffect } from "react";
import { C, Icon } from "./Theme";

interface ARScannerModalProps {
  onClose: () => void;
  onScanComplete: (tag: string) => void;
}

export default function ARScannerModal({ onClose, onScanComplete }: ARScannerModalProps) {
  const [phase, setPhase] = useState<"initializing" | "scanning" | "found">("initializing");
  
  useEffect(() => {
    // Simulate camera initialization
    const t1 = setTimeout(() => {
      setPhase("scanning");
    }, 1500);

    // Simulate finding a tag after some scanning
    const t2 = setTimeout(() => {
      setPhase("found");
    }, 4500);

    // Complete and redirect
    const t3 = setTimeout(() => {
      onScanComplete("Pump P-101");
    }, 6500);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onScanComplete]);

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0, 0, 0, 0.9)", backdropFilter: "blur(8px)",
      zIndex: 9999, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", color: "#fff",
      fontFamily: "inherit"
    }}>
      {/* Header */}
      <div style={{ position: "absolute", top: 24, left: 24, right: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: phase === "scanning" ? C.error : C.accent, animation: phase === "scanning" ? "pulse 1s infinite" : "none" }} />
          <span style={{ fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", fontSize: 13, color: "rgba(255,255,255,0.8)" }}>
            {phase === "initializing" ? "Calibrating Sensors" : phase === "scanning" ? "Live AR Feed" : "Target Locked"}
          </span>
        </div>
        <button onClick={onClose} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", width: 40, height: 40, borderRadius: "50%", cursor: "pointer", display: "grid", placeItems: "center" }}>
          <Icon name="close" size={24} color="#fff" />
        </button>
      </div>

      {/* Viewfinder */}
      <div style={{
        position: "relative", width: 320, height: 320,
        border: `2px solid ${phase === "found" ? C.accent : "rgba(255,255,255,0.3)"}`,
        borderRadius: 24, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
        transition: "border-color 0.3s ease",
        boxShadow: phase === "found" ? `0 0 40px ${C.accent}40` : "none"
      }}>
        {/* Corners */}
        <div style={{ position: "absolute", top: 16, left: 16, width: 30, height: 30, borderTop: "3px solid #fff", borderLeft: "3px solid #fff", borderTopLeftRadius: 8 }} />
        <div style={{ position: "absolute", top: 16, right: 16, width: 30, height: 30, borderTop: "3px solid #fff", borderRight: "3px solid #fff", borderTopRightRadius: 8 }} />
        <div style={{ position: "absolute", bottom: 16, left: 16, width: 30, height: 30, borderBottom: "3px solid #fff", borderLeft: "3px solid #fff", borderBottomLeftRadius: 8 }} />
        <div style={{ position: "absolute", bottom: 16, right: 16, width: 30, height: 30, borderBottom: "3px solid #fff", borderRight: "3px solid #fff", borderBottomRightRadius: 8 }} />

        {/* Scan line animation */}
        {phase === "scanning" && (
          <div style={{
            position: "absolute", left: 0, right: 0, height: 2,
            background: C.accent, boxShadow: `0 0 10px ${C.accent}`,
            animation: "scanline 2s infinite linear"
          }} />
        )}

        {/* Status text inside viewfinder */}
        <div style={{ textAlign: "center", zIndex: 10 }}>
          {phase === "initializing" && <Icon name="settings" size={48} color="rgba(255,255,255,0.5)" />}
          {phase === "found" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", animation: "popIn 0.3s ease-out" }}>
              <Icon name="qr_code_scanner" size={48} color={C.accent} />
              <div style={{ background: "rgba(0,0,0,0.6)", padding: "4px 12px", borderRadius: 100, marginTop: 12, fontSize: 13, fontWeight: 700, color: C.accent, border: `1px solid ${C.accent}` }}>
                Pump P-101 Detected
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 40, fontSize: 14, color: "rgba(255,255,255,0.6)", textAlign: "center", maxWidth: 300, lineHeight: 1.5 }}>
        {phase === "initializing" ? "Connecting to AR Engine..." : phase === "scanning" ? "Point your camera at an equipment QR code or physical tag." : "Retrieving AI Equipment History..."}
      </div>

      <style>{`
        @keyframes scanline {
          0% { top: 10%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 90%; opacity: 0; }
        }
        @keyframes popIn {
          0% { transform: scale(0.8); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
