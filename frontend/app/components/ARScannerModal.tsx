import React, { useEffect, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { C, S, Icon } from "./Theme";

interface ARScannerModalProps {
  onClose: () => void;
  onScan: (decodedText: string) => void;
}

export default function ARScannerModal({ onClose, onScan }: ARScannerModalProps) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // We delay slightly to ensure the DOM element is mounted
    let scanner: Html5Qrcode | null = null;
    
    const startScanner = async () => {
      try {
        scanner = new Html5Qrcode("reader");
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            if (scanner) {
              scanner.stop().then(() => {
                onScan(decodedText);
              });
            }
          },
          (err) => {
            // ignore constant scanning errors
          }
        );
      } catch (err: any) {
        setError("Failed to start camera. Please ensure you have granted camera permissions.");
      }
    };

    setTimeout(startScanner, 300);

    return () => {
      if (scanner && scanner.isScanning) {
        scanner.stop().catch(console.error);
      }
    };
  }, [onScan]);

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.9)", backdropFilter: "blur(10px)",
      zIndex: 9999, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center"
    }}>
      <div style={{
        background: C.surf, width: "100%", maxWidth: 500, borderRadius: 24,
        overflow: "hidden", border: `1px solid rgba(255,255,255,0.1)`,
        boxShadow: "0 20px 40px rgba(0,0,0,0.5)"
      }}>
        <div style={{ padding: 24, display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Icon name="qr_code_scanner" size={24} color={C.primary} />
            <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>Scan Equipment Tag</h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer" }}>
            <Icon name="close" size={24} />
          </button>
        </div>
        
        <div style={{ padding: 24, background: "#000", position: "relative" }}>
          {error ? (
            <div style={{ color: "#f87171", textAlign: "center", padding: 40, fontSize: 14 }}>
              <Icon name="error_outline" size={32} color="#f87171" />
              <div style={{ marginTop: 12 }}>{error}</div>
            </div>
          ) : (
            <>
              <div id="reader" style={{ width: "100%", height: 350, background: "#111", borderRadius: 12, overflow: "hidden" }} />
              
              {/* AR Overlay Scanning Reticle */}
              <div style={{
                position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                width: 250, height: 250, border: "2px solid rgba(77, 142, 255, 0.5)",
                boxShadow: "0 0 20px rgba(77, 142, 255, 0.2)", pointerEvents: "none",
                display: "flex", alignItems: "center", justifyContent: "center"
              }}>
                <div style={{
                  position: "absolute", top: 0, left: 0, width: 20, height: 20,
                  borderTop: "4px solid #4d8eff", borderLeft: "4px solid #4d8eff"
                }} />
                <div style={{
                  position: "absolute", top: 0, right: 0, width: 20, height: 20,
                  borderTop: "4px solid #4d8eff", borderRight: "4px solid #4d8eff"
                }} />
                <div style={{
                  position: "absolute", bottom: 0, left: 0, width: 20, height: 20,
                  borderBottom: "4px solid #4d8eff", borderLeft: "4px solid #4d8eff"
                }} />
                <div style={{
                  position: "absolute", bottom: 0, right: 0, width: 20, height: 20,
                  borderBottom: "4px solid #4d8eff", borderRight: "4px solid #4d8eff"
                }} />
                
                {/* Scanning Laser Line Animation */}
                <div style={{
                  position: "absolute", top: 0, left: 0, right: 0, height: 2,
                  background: "#4d8eff", boxShadow: "0 0 10px #4d8eff",
                  animation: "scanLine 2s infinite linear"
                }} />
              </div>
            </>
          )}
        </div>
        
        <div style={{ padding: 20, textAlign: "center", color: C.muted, fontSize: 13, background: C.surf2 }}>
          Point your device camera at the physical QR code on the equipment to instantly access manuals, schematics, and live RCA history.
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes scanLine {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}} />
    </div>
  );
}
