"use client";

import React, { useEffect, useRef, useState } from "react";
import { C, Icon } from "./Theme";

interface VoiceModalProps {
  onTranscript: (text: string) => void;
  onClose: () => void;
  language?: string;
}

export default function VoiceModal({ onTranscript, onClose, language = "en-IN" }: VoiceModalProps) {
  const [phase, setPhase]           = useState<"listening" | "processing" | "done" | "error">("listening");
  const [interim, setInterim]       = useState("");
  const [final, setFinal]           = useState("");
  const [errorMsg, setErrorMsg]     = useState("");
  const [volume, setVolume]         = useState<number[]>(Array(20).fill(3));
  const recognitionRef              = useRef<any>(null);
  const silenceTimerRef             = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyserRef                 = useRef<AnalyserNode | null>(null);
  const animFrameRef                = useRef<number>(0);
  const streamRef                   = useRef<MediaStream | null>(null);

  // ── Waveform Analyser ──────────────────────────────────────────────────────
  const startWaveform = (stream: MediaStream) => {
    const ctx      = new AudioContext();
    const source   = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    analyserRef.current = analyser;

    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const bars = Array.from({ length: 20 }, (_, i) => {
        const val = data[Math.floor(i * (data.length / 20))] ?? 0;
        return Math.max(3, Math.round((val / 255) * 60));
      });
      setVolume(bars);
      animFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  // ── Speech Recognition ────────────────────────────────────────────────────
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setPhase("error");
      setErrorMsg("Voice input is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    const recognition = new SR();
    recognition.lang            = language;
    recognition.continuous      = true;
    recognition.interimResults  = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current      = recognition;

    const resetSilenceTimer = (transcript: string) => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        if (transcript.trim()) {
          recognition.stop();
          setPhase("processing");
        }
      }, 1800);
    };

    recognition.onresult = (e: any) => {
      let interimText  = "";
      let finalText    = final;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t + " ";
        else interimText = t;
      }
      setInterim(interimText);
      setFinal(finalText);
      resetSilenceTimer(finalText + interimText);
    };

    recognition.onend = () => {
      cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };

    recognition.onerror = (e: any) => {
      if (e.error === "no-speech") {
        setPhase("error");
        setErrorMsg("No speech detected. Please try again.");
      } else if (e.error === "not-allowed") {
        setPhase("error");
        setErrorMsg("Microphone access denied. Please allow mic permissions.");
      } else {
        setPhase("error");
        setErrorMsg(`Error: ${e.error}`);
      }
    };

    // Get mic stream for waveform visualisation
    navigator.mediaDevices?.getUserMedia({ audio: true }).then(stream => {
      streamRef.current = stream;
      startWaveform(stream);
      recognition.start();
    }).catch(() => {
      // Start recognition anyway even without waveform
      recognition.start();
    });

    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      cancelAnimationFrame(animFrameRef.current);
      recognition.abort();
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  // ── When phase becomes "processing" → submit ───────────────────────────────
  useEffect(() => {
    if (phase === "processing") {
      const text = final.trim();
      if (text) {
        setTimeout(() => {
          onTranscript(text);
          onClose();
        }, 600);
      } else {
        setPhase("error");
        setErrorMsg("Nothing was heard. Please try again.");
      }
    }
  }, [phase, final, onTranscript, onClose]);

  const handleCancel = () => {
    recognitionRef.current?.abort();
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    cancelAnimationFrame(animFrameRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    onClose();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0, 5, 20, 0.88)",
      backdropFilter: "blur(14px)",
      WebkitBackdropFilter: "blur(14px)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      animation: "fadeIn 0.2s ease",
    }}>
      {/* Close button */}
      <button onClick={handleCancel} style={{
        position: "absolute", top: 24, right: 24,
        background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: "50%", width: 42, height: 42,
        cursor: "pointer", display: "grid", placeItems: "center",
        color: "#94a3b8", transition: "all 0.2s",
      }}>
        <Icon name="close" size={20} color="#94a3b8" />
      </button>

      {/* Status label */}
      <div style={{
        fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase",
        color: phase === "error" ? "#f87171" : phase === "processing" ? C.accent : C.primary,
        marginBottom: 32,
      }}>
        {phase === "listening"   && "Listening…"}
        {phase === "processing"  && "Processing…"}
        {phase === "error"       && "Oops!"}
      </div>

      {/* Waveform bars */}
      {phase === "listening" && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 4, height: 80, marginBottom: 40,
        }}>
          {volume.map((h, i) => (
            <div key={i} style={{
              width: 4, height: h, borderRadius: 4,
              background: `linear-gradient(to top, ${C.primary}, rgba(77,142,255,0.4))`,
              transition: "height 0.08s ease",
              animation: `pulse-bar 1.2s ease-in-out ${i * 0.05}s infinite`,
            }} />
          ))}
        </div>
      )}

      {/* Processing spinner */}
      {phase === "processing" && (
        <div style={{ marginBottom: 40 }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%",
            border: `3px solid rgba(78,222,163,0.2)`,
            borderTop: `3px solid ${C.accent}`,
            animation: "spin 0.8s linear infinite",
          }} />
        </div>
      )}

      {/* Error icon */}
      {phase === "error" && (
        <div style={{ marginBottom: 32 }}>
          <Icon name="mic_off" size={56} color="#f87171" />
        </div>
      )}

      {/* Transcript display */}
      <div style={{
        maxWidth: 600, width: "90%", textAlign: "center", minHeight: 80,
      }}>
        {phase === "error" ? (
          <p style={{ color: "#f87171", fontSize: 16, lineHeight: 1.6 }}>{errorMsg}</p>
        ) : (
          <>
            {final && (
              <p style={{ color: "#f8fafc", fontSize: 22, fontWeight: 600, lineHeight: 1.5, marginBottom: 8 }}>
                {final}
              </p>
            )}
            {interim && (
              <p style={{ color: "#94a3b8", fontSize: 18, fontStyle: "italic", lineHeight: 1.5 }}>
                {interim}
              </p>
            )}
            {!final && !interim && phase === "listening" && (
              <p style={{ color: "#475569", fontSize: 16 }}>Say something… I'm listening</p>
            )}
          </>
        )}
      </div>

      {/* Instruction */}
      {phase === "listening" && (
        <p style={{ color: "#475569", fontSize: 13, marginTop: 32, textAlign: "center" }}>
          Speak your question — auto-submits when you stop talking
        </p>
      )}

      {/* Buttons */}
      <div style={{ display: "flex", gap: 12, marginTop: 40 }}>
        {phase === "error" && (
          <button
            onClick={() => { setPhase("listening"); setErrorMsg(""); setFinal(""); setInterim(""); }}
            style={{
              background: `linear-gradient(135deg, ${C.primary}, #2563eb)`,
              border: "none", borderRadius: 12, padding: "12px 28px",
              color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 8, fontFamily: "inherit",
            }}>
            <Icon name="mic" size={18} color="#fff" /> Try Again
          </button>
        )}
        <button onClick={handleCancel} style={{
          background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12, padding: "12px 28px",
          color: "#94a3b8", fontSize: 14, fontWeight: 600, cursor: "pointer",
          fontFamily: "inherit",
        }}>
          Cancel
        </button>
      </div>

      {/* Global keyframe injection */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes pulse-bar {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
