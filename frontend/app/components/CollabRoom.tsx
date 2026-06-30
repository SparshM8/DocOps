"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { C, Icon } from "./Theme";

interface CollabRoomProps {
  user: any;
  onQuerySync?: (query: string) => void;  // Called when remote peer sends a query
}

type Peer = { peerId: string; username: string; stream?: MediaStream; };
type ChatEntry = { from: string; text: string; ts: number; };

const STUN = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] };
const GATEWAY_WS = (process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:3001").replace("http", "ws");

export default function CollabRoom({ user, onQuerySync }: CollabRoomProps) {
  // UI states
  const [open, setOpen]               = useState(false);
  const [phase, setPhase]             = useState<"idle" | "lobby" | "connecting" | "live">("idle");
  const [roomInput, setRoomInput]     = useState("");
  const [error, setError]             = useState("");
  const [myRoom, setMyRoom]           = useState("");
  const [peers, setPeers]             = useState<Peer[]>([]);
  const [chatLog, setChatLog]         = useState<ChatEntry[]>([]);
  const [chatInput, setChatInput]     = useState("");
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [syncMsg, setSyncMsg]         = useState("");

  // Refs
  const wsRef           = useRef<WebSocket | null>(null);
  const pcRefs          = useRef<Map<string, RTCPeerConnection>>(new Map());
  const dcRefs          = useRef<Map<string, RTCDataChannel>>(new Map());
  const localStreamRef  = useRef<MediaStream | null>(null);
  const myVideoRef      = useRef<HTMLVideoElement>(null);

  // ── Cleanup ────────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    pcRefs.current.forEach(pc => pc.close());
    pcRefs.current.clear();
    dcRefs.current.clear();
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setPeers([]);
    setChatLog([]);
    setPhase("idle");
    setMyRoom("");
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  // ── Attach local stream to video element ──────────────────────────────────
  useEffect(() => {
    if (myVideoRef.current && localStreamRef.current) {
      myVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [phase]);

  // ── Create RTCPeerConnection for a peer ───────────────────────────────────
  const createPeerConn = useCallback((peerId: string, username: string, initiator: boolean) => {
    const pc = new RTCPeerConnection(STUN);
    pcRefs.current.set(peerId, pc);

    // Add local tracks
    localStreamRef.current?.getTracks().forEach(track => {
      pc.addTrack(track, localStreamRef.current!);
    });

    // Remote stream → peer state
    const remoteStream = new MediaStream();
    pc.ontrack = e => {
      e.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));
      setPeers(prev => prev.map(p => p.peerId === peerId ? { ...p, stream: remoteStream } : p));
    };

    // ICE candidates → signaling
    pc.onicecandidate = e => {
      if (e.candidate && wsRef.current?.readyState === 1) {
        wsRef.current.send(JSON.stringify({ type: "ice-candidate", toPeerId: peerId, candidate: e.candidate }));
      }
    };

    // DataChannel setup
    if (initiator) {
      const dc = pc.createDataChannel("docops-sync");
      setupDataChannel(dc, peerId, username);
      dcRefs.current.set(peerId, dc);

      // Create and send offer
      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
        wsRef.current?.send(JSON.stringify({ type: "offer", toPeerId: peerId, sdp: offer }));
      });
    } else {
      pc.ondatachannel = e => {
        setupDataChannel(e.channel, peerId, username);
        dcRefs.current.set(peerId, e.channel);
      };
    }

    return pc;
  }, []);

  // ── DataChannel message handler ───────────────────────────────────────────
  const setupDataChannel = (dc: RTCDataChannel, peerId: string, username: string) => {
    dc.onmessage = e => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "chat") {
          setChatLog(prev => [...prev, { from: username, text: msg.text, ts: Date.now() }]);
        } else if (msg.type === "query-sync") {
          setSyncMsg(`${username} asked: "${msg.query}"`);
          onQuerySync?.(msg.query);
          setTimeout(() => setSyncMsg(""), 5000);
        }
      } catch {}
    };
  };

  // ── Handle incoming WS signaling messages ─────────────────────────────────
  const handleSignal = useCallback((msg: any) => {
    switch (msg.type) {
      case "joined": {
        setMyRoom(msg.room);
        setPhase("live");
        // For each existing peer, initiate a connection
        msg.peers?.forEach((p: { peerId: string; username: string }) => {
          setPeers(prev => [...prev, { peerId: p.peerId, username: p.username }]);
          createPeerConn(p.peerId, p.username, true);
        });
        break;
      }
      case "peer-joined": {
        setPeers(prev => [...prev, { peerId: msg.peerId, username: msg.username }]);
        createPeerConn(msg.peerId, msg.username, false);
        break;
      }
      case "offer": {
        const pc = pcRefs.current.get(msg.fromPeerId) || createPeerConn(msg.fromPeerId, msg.fromUsername, false);
        pc.setRemoteDescription(new RTCSessionDescription(msg.sdp)).then(() =>
          pc.createAnswer()
        ).then(answer => {
          pc.setLocalDescription(answer);
          wsRef.current?.send(JSON.stringify({ type: "answer", toPeerId: msg.fromPeerId, sdp: answer }));
        });
        break;
      }
      case "answer": {
        pcRefs.current.get(msg.fromPeerId)?.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        break;
      }
      case "ice-candidate": {
        pcRefs.current.get(msg.fromPeerId)?.addIceCandidate(new RTCIceCandidate(msg.candidate));
        break;
      }
      case "peer-left": {
        setPeers(prev => prev.filter(p => p.peerId !== msg.peerId));
        pcRefs.current.get(msg.peerId)?.close();
        pcRefs.current.delete(msg.peerId);
        dcRefs.current.delete(msg.peerId);
        break;
      }
      case "data-sync": {
        // Fallback: data relayed via signaling server (when DataChannel not yet ready)
        if (msg.payload?.type === "chat") {
          setChatLog(prev => [...prev, { from: msg.fromUsername, text: msg.payload.text, ts: Date.now() }]);
        }
        break;
      }
    }
  }, [createPeerConn]);

  // ── Join a room ───────────────────────────────────────────────────────────
  const joinRoom = async () => {
    const code = roomInput.trim().toUpperCase();
    if (!code || code.length < 4) {
      setError("Room code must be at least 4 characters.");
      return;
    }
    setError("");
    setPhase("connecting");

    try {
      // Get camera + mic
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (myVideoRef.current) myVideoRef.current.srcObject = stream;

      // Connect to signaling server
      const ws = new WebSocket(`${GATEWAY_WS}/ws/collab`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "join", room: code, username: user?.username || "Anonymous" }));
      };
      ws.onmessage = e => {
        try { handleSignal(JSON.parse(e.data)); } catch {}
      };
      ws.onclose = () => {
        if (phase !== "idle") { cleanup(); setError("Connection lost."); }
      };
      ws.onerror = () => {
        cleanup();
        setError("Failed to connect to signaling server.");
        setPhase("lobby");
      };
    } catch (err: any) {
      setPhase("lobby");
      setError(err.name === "NotAllowedError" ? "Camera/mic permission denied." : err.message);
    }
  };

  // ── Broadcast query to all peers via DataChannel ─────────────────────────
  const broadcastQuery = (query: string) => {
    dcRefs.current.forEach(dc => {
      if (dc.readyState === "open") {
        dc.send(JSON.stringify({ type: "query-sync", query }));
      }
    });
  };

  // Expose broadcast so parent can call it
  (CollabRoom as any)._broadcastQuery = broadcastQuery;

  // ── Chat send ─────────────────────────────────────────────────────────────
  const sendChat = () => {
    if (!chatInput.trim()) return;
    const entry: ChatEntry = { from: user?.username || "Me", text: chatInput.trim(), ts: Date.now() };
    setChatLog(prev => [...prev, entry]);
    dcRefs.current.forEach(dc => {
      if (dc.readyState === "open") dc.send(JSON.stringify({ type: "chat", text: entry.text }));
    });
    // Fallback via WS relay
    wsRef.current?.send(JSON.stringify({ type: "data-sync", payload: { type: "chat", text: entry.text } }));
    setChatInput("");
  };

  const toggleAudio = () => {
    const enabled = !audioEnabled;
    localStreamRef.current?.getAudioTracks().forEach(t => t.enabled = enabled);
    setAudioEnabled(enabled);
  };
  const toggleVideo = () => {
    const enabled = !videoEnabled;
    localStreamRef.current?.getVideoTracks().forEach(t => t.enabled = enabled);
    setVideoEnabled(enabled);
  };

  const genRoomCode = () => setRoomInput(Math.random().toString(36).substring(2, 6).toUpperCase());

  // ── Render ────────────────────────────────────────────────────────────────
  const panelStyle: React.CSSProperties = {
    position: "fixed", bottom: 80, right: 24, zIndex: 5000,
    width: open ? (phase === "live" ? 480 : 340) : 56,
    height: open ? (phase === "live" ? 560 : "auto") : 56,
    borderRadius: open ? 20 : "50%",
    background: "rgba(5,11,20,0.92)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    border: `1px solid ${phase === "live" ? "rgba(77,142,255,0.4)" : "rgba(255,255,255,0.1)"}`,
    boxShadow: phase === "live"
      ? "0 0 0 3px rgba(77,142,255,0.2), 0 20px 60px rgba(0,0,0,0.6)"
      : "0 8px 32px rgba(0,0,0,0.5)",
    overflow: "hidden",
    transition: "all 0.35s cubic-bezier(0.34,1.56,0.64,1)",
    display: "flex", flexDirection: "column",
  };

  return (
    <>
      {/* Sync notification toast */}
      {syncMsg && (
        <div style={{
          position: "fixed", bottom: 150, right: 24, zIndex: 6000,
          background: "rgba(77,142,255,0.15)", border: `1px solid rgba(77,142,255,0.4)`,
          borderRadius: 12, padding: "10px 16px", fontSize: 13, color: C.primary,
          backdropFilter: "blur(12px)", maxWidth: 320,
          animation: "fadeIn 0.3s ease",
        }}>
          <Icon name="sync" size={14} color={C.primary} /> &nbsp;{syncMsg}
        </div>
      )}

      <div style={panelStyle}>
        {/* Toggle Button (when collapsed) */}
        {!open && (
          <button onClick={() => { setOpen(true); if (phase === "idle") setPhase("lobby"); }}
            style={{
              width: 56, height: 56, background: "none", border: "none", cursor: "pointer",
              display: "grid", placeItems: "center", position: "relative",
            }}>
            <Icon name="group" size={24} color={C.primary} />
            {phase === "live" && (
              <span style={{
                position: "absolute", top: 8, right: 8, width: 10, height: 10,
                background: C.accent, borderRadius: "50%", border: "2px solid #050b14",
              }} />
            )}
          </button>
        )}

        {open && (
          <>
            {/* Header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 16px", borderBottom: `1px solid rgba(255,255,255,0.07)`, flexShrink: 0,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Icon name="videocam" size={20} color={phase === "live" ? C.accent : C.primary} />
                <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                  {phase === "live" ? `Room: ${myRoom}` : "Live Collaboration"}
                </span>
                {phase === "live" && (
                  <span style={{
                    background: "rgba(78,222,163,0.15)", border: "1px solid rgba(78,222,163,0.3)",
                    borderRadius: 100, padding: "2px 10px", fontSize: 10, fontWeight: 700,
                    color: C.accent, textTransform: "uppercase", letterSpacing: 1,
                  }}>LIVE</span>
                )}
              </div>
              <button onClick={() => setOpen(false)} style={{
                background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 4,
              }}>
                <Icon name="keyboard_arrow_down" size={20} color={C.muted} />
              </button>
            </div>

            {/* LOBBY */}
            {(phase === "lobby" || phase === "connecting") && (
              <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
                <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, margin: 0 }}>
                  Share a room code with a colleague. Both open the same code to start a live video + AI sync session.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={roomInput}
                    onChange={e => setRoomInput(e.target.value.toUpperCase())}
                    placeholder="ROOM CODE"
                    maxLength={8}
                    style={{
                      flex: 1, background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`,
                      borderRadius: 10, padding: "10px 14px", fontSize: 15, fontWeight: 700,
                      color: C.text, outline: "none", letterSpacing: 3, textAlign: "center",
                      fontFamily: "monospace",
                    }}
                    onKeyDown={e => e.key === "Enter" && joinRoom()}
                  />
                  <button onClick={genRoomCode} title="Generate random code" style={{
                    background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`,
                    borderRadius: 10, padding: "10px 12px", cursor: "pointer", color: C.muted,
                  }}>
                    <Icon name="casino" size={18} color={C.muted} />
                  </button>
                </div>
                {error && <p style={{ color: C.error, fontSize: 12, margin: 0 }}>{error}</p>}
                <button
                  onClick={joinRoom}
                  disabled={phase === "connecting"}
                  style={{
                    background: phase === "connecting" ? "rgba(77,142,255,0.1)" : `linear-gradient(135deg, ${C.primary}, #2563eb)`,
                    border: "none", borderRadius: 10, padding: "12px", fontSize: 14, fontWeight: 700,
                    color: "#fff", cursor: phase === "connecting" ? "wait" : "pointer",
                    fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    boxShadow: phase !== "connecting" ? "0 4px 14px rgba(77,142,255,0.35)" : "none",
                  }}>
                  {phase === "connecting"
                    ? <><Icon name="hourglass_empty" size={16} color={C.primary} /> Connecting…</>
                    : <><Icon name="videocam" size={16} color="#fff" /> Join Room</>}
                </button>
                <p style={{ fontSize: 11, color: C.muted, margin: 0, textAlign: "center" }}>
                  Requires camera + microphone permission
                </p>
              </div>
            )}

            {/* LIVE SESSION */}
            {phase === "live" && (
              <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
                {/* Video Grid */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: peers.length > 0 ? "1fr 1fr" : "1fr",
                  gap: 8, padding: 12, background: "rgba(0,0,0,0.3)", flexShrink: 0,
                }}>
                  {/* My video */}
                  <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", background: "#000", aspectRatio: "4/3" }}>
                    <video ref={myVideoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <div style={{
                      position: "absolute", bottom: 6, left: 8, fontSize: 11, fontWeight: 700,
                      color: "#fff", background: "rgba(0,0,0,0.6)", borderRadius: 6, padding: "2px 8px",
                    }}>
                      {user?.username} (You)
                    </div>
                    {!videoEnabled && (
                      <div style={{ position: "absolute", inset: 0, background: "#111", display: "grid", placeItems: "center" }}>
                        <Icon name="videocam_off" size={28} color={C.muted} />
                      </div>
                    )}
                  </div>
                  {/* Remote peers */}
                  {peers.map(peer => (
                    <RemoteVideo key={peer.peerId} peer={peer} />
                  ))}
                  {peers.length === 0 && (
                    <div style={{ borderRadius: 10, background: "rgba(255,255,255,0.04)", border: `1px dashed ${C.border}`, display: "grid", placeItems: "center", aspectRatio: "4/3" }}>
                      <div style={{ textAlign: "center", color: C.muted }}>
                        <Icon name="person_add" size={24} color={C.muted} />
                        <div style={{ fontSize: 11, marginTop: 6 }}>Waiting for peer…</div>
                        <div style={{ fontSize: 11, marginTop: 4, fontWeight: 700, color: C.primary, letterSpacing: 2 }}>{myRoom}</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Chat Area */}
                <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {chatLog.length === 0 && (
                    <p style={{ color: C.muted, fontSize: 12, textAlign: "center", marginTop: 12 }}>
                      Chat with your team. AI queries sync automatically.
                    </p>
                  )}
                  {chatLog.map((entry, i) => (
                    <div key={i} style={{ fontSize: 12, lineHeight: 1.5 }}>
                      <span style={{ fontWeight: 700, color: C.primary }}>{entry.from}: </span>
                      <span style={{ color: C.text }}>{entry.text}</span>
                    </div>
                  ))}
                </div>

                {/* Chat Input */}
                <div style={{ padding: "8px 12px", borderTop: `1px solid rgba(255,255,255,0.07)`, display: "flex", gap: 8, flexShrink: 0 }}>
                  <input
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && sendChat()}
                    placeholder="Send message…"
                    style={{
                      flex: 1, background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`,
                      borderRadius: 8, padding: "8px 12px", fontSize: 12, color: C.text,
                      outline: "none", fontFamily: "inherit",
                    }}
                  />
                  <button onClick={sendChat} style={{ background: C.primary, border: "none", borderRadius: 8, padding: "8px 10px", cursor: "pointer" }}>
                    <Icon name="send" size={14} color="#fff" />
                  </button>
                </div>

                {/* Controls */}
                <div style={{ display: "flex", justifyContent: "center", gap: 10, padding: "10px 12px", borderTop: `1px solid rgba(255,255,255,0.07)`, flexShrink: 0 }}>
                  <ControlBtn icon={audioEnabled ? "mic" : "mic_off"} active={audioEnabled} onClick={toggleAudio} title={audioEnabled ? "Mute" : "Unmute"} />
                  <ControlBtn icon={videoEnabled ? "videocam" : "videocam_off"} active={videoEnabled} onClick={toggleVideo} title={videoEnabled ? "Stop Video" : "Start Video"} />
                  <button onClick={() => { cleanup(); setPhase("lobby"); }} title="Leave Room" style={{
                    width: 40, height: 40, borderRadius: "50%", border: "none", cursor: "pointer",
                    background: "rgba(255,100,80,0.15)", display: "grid", placeItems: "center",
                    transition: "background 0.2s",
                  }}
                    onMouseOver={e => e.currentTarget.style.background = "rgba(255,100,80,0.3)"}
                    onMouseOut={e => e.currentTarget.style.background = "rgba(255,100,80,0.15)"}
                  >
                    <Icon name="call_end" size={18} color={C.error} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function RemoteVideo({ peer }: { peer: Peer }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current && peer.stream) videoRef.current.srcObject = peer.stream;
  }, [peer.stream]);
  return (
    <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", background: "#000", aspectRatio: "4/3" }}>
      <video ref={videoRef} autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      {!peer.stream && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "#111" }}>
          <Icon name="hourglass_empty" size={22} color="#64748b" />
        </div>
      )}
      <div style={{
        position: "absolute", bottom: 6, left: 8, fontSize: 11, fontWeight: 700,
        color: "#fff", background: "rgba(0,0,0,0.6)", borderRadius: 6, padding: "2px 8px",
      }}>
        {peer.username}
      </div>
    </div>
  );
}

function ControlBtn({ icon, active, onClick, title }: { icon: string; active: boolean; onClick: () => void; title: string }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 40, height: 40, borderRadius: "50%", border: "none", cursor: "pointer",
      background: active ? "rgba(77,142,255,0.15)" : "rgba(255,180,171,0.1)",
      display: "grid", placeItems: "center", transition: "background 0.2s",
    }}>
      <Icon name={icon} size={18} color={active ? "#4d8eff" : "#ffb4ab"} />
    </button>
  );
}
