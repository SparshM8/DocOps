"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { C, Icon } from "./Theme";

interface CollabRoomProps {
  user: any;
  isActivePage?: boolean;
  onNavigate?: () => void;
  onQuerySync?: (query: string) => void;  // Called when remote peer sends a query
}

type Peer = { peerId: string; username: string; stream?: MediaStream; };
type ChatEntry = { from: string; text: string; ts: number; };

const STUN = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] };
const GATEWAY_WS = (process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:3001").replace("http", "ws");

export default function CollabRoom({ user, isActivePage = true, onNavigate, onQuerySync }: CollabRoomProps) {
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
  
  if (!isActivePage) {
    if (phase !== "live") return null;

    // Floating PiP when active in another tab
    return (
      <div style={{
        position: "fixed", bottom: 28, right: 28, zIndex: 5000,
        width: 240, background: "rgba(10,15,28,0.9)",
        backdropFilter: "blur(16px)", border: `1px solid rgba(77,142,255,0.4)`,
        borderRadius: 16, overflow: "hidden",
        boxShadow: "0 10px 40px rgba(0,0,0,0.6), 0 0 0 2px rgba(77,142,255,0.2)",
        display: "flex", flexDirection: "column",
        animation: "fadeIn 0.3s ease",
      }}>
        <div style={{ padding: "8px 12px", background: "rgba(0,0,0,0.4)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: 1, display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 6, height: 6, background: C.accent, borderRadius: "50%", boxShadow: `0 0 6px ${C.accent}` }} />
            Live
          </span>
          <button onClick={onNavigate} style={{
            background: "none", border: "none", color: C.primary, cursor: "pointer", display: "flex", padding: 4
          }} title="Return to Team Room">
            <Icon name="open_in_full" size={16} />
          </button>
        </div>
        
        {/* Render a tiny version of the first peer's video, or waiting state */}
        <div style={{ aspectRatio: "4/3", background: "#000", position: "relative" }}>
          {peers.length > 0 ? (
            <RemoteVideo peer={peers[0]} />
          ) : (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: C.muted }}>
              <Icon name="person_add" size={24} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      padding: "32px 40px",
      maxWidth: 1200,
      margin: "0 auto",
      display: "flex",
      flexDirection: "column",
      gap: 24,
      animation: "fadeIn 0.25s ease-out",
    }}>
      {/* Header Area */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: 28, fontWeight: 800, color: C.text, display: "flex", alignItems: "center", gap: 12, margin: 0 }}>
            <Icon name="groups" size={32} color={C.primary} />
            Collab Room
          </h2>
          <p style={{ color: C.muted, fontSize: 14, margin: "6px 0 0 0" }}>
            Real-time peer-to-peer video calls and query syncing using WebRTC.
          </p>
        </div>
        {phase === "live" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              background: "rgba(78,222,163,0.15)", border: "1px solid rgba(78,222,163,0.3)",
              borderRadius: 100, padding: "4px 12px", fontSize: 11, fontWeight: 700,
              color: C.accent, textTransform: "uppercase", letterSpacing: 1,
            }}>Active Room: {myRoom}</span>
            <button onClick={() => { cleanup(); setPhase("lobby"); }} style={{
              background: "rgba(255,100,80,0.15)", border: `1px solid rgba(255,100,80,0.2)`,
              borderRadius: 10, padding: "8px 16px", color: C.error, fontSize: 13,
              fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              transition: "all 0.2s"
            }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,100,80,0.25)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,100,80,0.15)"}
            >
              <Icon name="call_end" size={16} /> Disconnect
            </button>
          </div>
        )}
      </div>

      {/* Sync notification toast */}
      {syncMsg && (
        <div style={{
          position: "fixed", top: 80, right: 40, zIndex: 6000,
          background: "rgba(77,142,255,0.15)", border: `1px solid rgba(77,142,255,0.4)`,
          borderRadius: 12, padding: "12px 18px", fontSize: 13, color: C.primary,
          backdropFilter: "blur(12px)", maxWidth: 320,
          boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
          animation: "slideIn 0.3s cubic-bezier(0.34,1.56,0.64,1)",
        }}>
          <Icon name="sync" size={14} color={C.primary} /> &nbsp;{syncMsg}
        </div>
      )}

      {/* LOBBY / DISCONNECTED */}
      {(phase === "idle" || phase === "lobby" || phase === "connecting") && (
        <div style={{
          background: "rgba(10,15,28,0.4)",
          backdropFilter: "blur(16px)",
          border: `1px solid ${C.border}`,
          borderRadius: 20,
          padding: 40,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          maxWidth: 600,
          width: "100%",
          margin: "40px auto 0",
          textAlign: "center",
          boxShadow: "0 20px 40px rgba(0,0,0,0.3)"
        }}>
          <div style={{
            width: 80, height: 80, borderRadius: "50%",
            background: "rgba(77,142,255,0.08)", border: `1px solid rgba(77,142,255,0.15)`,
            display: "grid", placeItems: "center", marginBottom: 24
          }}>
            <Icon name="video_chat" size={38} color={C.primary} />
          </div>
          <h3 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: "0 0 12px 0" }}>Start collaborating</h3>
          <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.6, margin: "0 0 32px 0", maxWidth: 440 }}>
            Enter a room code below to connect with another engineer. Once joined, your video streams and AI Copilot prompts will sync in real time.
          </p>

          <div style={{ display: "flex", gap: 12, width: "100%", maxWidth: 400, marginBottom: 16 }}>
            <input
              value={roomInput}
              onChange={e => setRoomInput(e.target.value.toUpperCase())}
              placeholder="ENTER ROOM CODE"
              maxLength={8}
              style={{
                flex: 1, background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`,
                borderRadius: 12, padding: "14px 18px", fontSize: 16, fontWeight: 700,
                color: C.text, outline: "none", letterSpacing: 4, textAlign: "center",
                fontFamily: "monospace", transition: "all 0.2s"
              }}
              onFocus={e => e.currentTarget.style.borderColor = C.primary}
              onBlur={e => e.currentTarget.style.borderColor = C.border}
              onKeyDown={e => e.key === "Enter" && joinRoom()}
            />
            <button onClick={genRoomCode} title="Generate random code" style={{
              background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`,
              borderRadius: 12, padding: "0 18px", cursor: "pointer", color: C.muted,
              display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s"
            }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = C.primary}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = C.border}
            >
              <Icon name="casino" size={20} color={C.muted} />
            </button>
          </div>

          {error && <p style={{ color: C.error, fontSize: 13, fontWeight: 600, margin: "0 0 20px 0" }}>{error}</p>}

          <button
            onClick={joinRoom}
            disabled={phase === "connecting"}
            style={{
              width: "100%", maxWidth: 400,
              background: phase === "connecting" ? "rgba(77,142,255,0.1)" : `linear-gradient(135deg, ${C.primary}, #2563eb)`,
              border: "none", borderRadius: 12, padding: "14px 20px", fontSize: 15, fontWeight: 700,
              color: "#fff", cursor: phase === "connecting" ? "wait" : "pointer",
              fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              transition: "all 0.2s",
              boxShadow: phase !== "connecting" ? "0 4px 14px rgba(77,142,255,0.35)" : "none",
            }}>
            {phase === "connecting"
              ? <><div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.2)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} /> Connecting Session…</>
              : <><Icon name="videocam" size={18} color="#fff" /> Start Session</>}
          </button>
        </div>
      )}

      {/* LIVE SESSION */}
      {phase === "live" && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 340px",
          gap: 24,
          alignItems: "stretch",
        }}>
          {/* Left Side: Video streams + Controls */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: peers.length > 0 ? "1fr 1fr" : "1fr",
              gap: 16,
              background: "rgba(10,15,28,0.3)",
              border: `1px solid ${C.border}`,
              borderRadius: 20,
              padding: 16,
              aspectRatio: "16/10",
              alignContent: "center",
            }}>
              {/* My video */}
              <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", background: "#060913", border: `1px solid rgba(255,255,255,0.06)`, height: "100%" }}>
                <video ref={myVideoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <div style={{
                  position: "absolute", bottom: 12, left: 12, fontSize: 12, fontWeight: 700,
                  color: "#fff", background: "rgba(5,11,20,0.8)", backdropFilter: "blur(8px)", borderRadius: 8, padding: "4px 12px",
                }}>
                  {user?.username} (You)
                </div>
                {!videoEnabled && (
                  <div style={{ position: "absolute", inset: 0, background: "#0b0f19", display: "grid", placeItems: "center" }}>
                    <Icon name="videocam_off" size={42} color={C.muted} />
                  </div>
                )}
              </div>
              {/* Remote peer */}
              {peers.map(peer => (
                <RemoteVideo key={peer.peerId} peer={peer} />
              ))}
              {peers.length === 0 && (
                <div style={{
                  borderRadius: 14, background: "rgba(255,255,255,0.02)", border: `1px dashed ${C.border}`,
                  display: "grid", placeItems: "center", height: "100%"
                }}>
                  <div style={{ textAlign: "center", color: C.muted }}>
                    <div style={{
                      width: 50, height: 50, borderRadius: "50%", background: "rgba(77,142,255,0.05)",
                      display: "grid", placeItems: "center", margin: "0 auto 12px"
                    }}>
                      <Icon name="hourglass_top" size={22} color={C.primary} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Waiting for other peer to connect…</div>
                    <div style={{ fontSize: 12, marginTop: 6, color: C.muted }}>Share Room Code: <strong style={{ color: C.primary, fontSize: 13 }}>{myRoom}</strong></div>
                  </div>
                </div>
              )}
            </div>

            {/* Media Controls */}
            <div style={{
              display: "flex", justifySelf: "center", gap: 14, padding: "12px 24px",
              background: "rgba(10,15,28,0.4)", border: `1px solid ${C.border}`, borderRadius: 16,
              alignSelf: "center"
            }}>
              <ControlBtn icon={audioEnabled ? "mic" : "mic_off"} active={audioEnabled} onClick={toggleAudio} title={audioEnabled ? "Mute Microphone" : "Unmute Microphone"} />
              <ControlBtn icon={videoEnabled ? "videocam" : "videocam_off"} active={videoEnabled} onClick={toggleVideo} title={videoEnabled ? "Stop Camera" : "Start Camera"} />
            </div>
          </div>

          {/* Right Side: Chat & Activity Logs */}
          <div style={{
            background: "rgba(10,15,28,0.4)",
            backdropFilter: "blur(16px)",
            border: `1px solid ${C.border}`,
            borderRadius: 20,
            display: "flex", flexDirection: "column",
            overflow: "hidden",
            height: "100%",
            minHeight: 400
          }}>
            {/* Panel Title */}
            <div style={{
              padding: "16px 20px", borderBottom: `1px solid rgba(255,255,255,0.07)`,
              display: "flex", alignItems: "center", gap: 8
            }}>
              <Icon name="chat" size={18} color={C.primary} />
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: 1 }}>Room Chat</span>
            </div>

            {/* Chat List */}
            <div style={{
              flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12
            }}>
              {chatLog.length === 0 && (
                <div style={{ textAlign: "center", padding: "32px 16px", color: C.muted }}>
                  <Icon name="forum" size={24} color={C.muted} style={{ marginBottom: 8 }} />
                  <p style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                    Chat history is peer-to-peer. Send a message to get started!
                  </p>
                </div>
              )}
              {chatLog.map((entry, i) => {
                const isMe = entry.from === (user?.username || "Me");
                return (
                  <div key={i} style={{
                    display: "flex", flexDirection: "column",
                    alignItems: isMe ? "flex-end" : "flex-start"
                  }}>
                    <span style={{ fontSize: 10, color: C.muted, marginBottom: 3, fontWeight: 600 }}>{entry.from}</span>
                    <div style={{
                      maxWidth: "85%", padding: "8px 12px", borderRadius: 12, fontSize: 13, lineHeight: 1.4,
                      background: isMe ? `linear-gradient(135deg, ${C.primary}, #2563eb)` : "rgba(255,255,255,0.06)",
                      color: "#fff",
                      borderBottomRightRadius: isMe ? 2 : 12,
                      borderBottomLeftRadius: isMe ? 12 : 2,
                    }}>
                      {entry.text}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Chat Input */}
            <div style={{ padding: 16, borderTop: `1px solid rgba(255,255,255,0.07)`, display: "flex", gap: 8 }}>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendChat()}
                placeholder="Type messages..."
                style={{
                  flex: 1, background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`,
                  borderRadius: 10, padding: "10px 14px", fontSize: 13, color: C.text,
                  outline: "none", fontFamily: "inherit",
                }}
                onFocus={e => e.currentTarget.style.borderColor = C.primary}
                onBlur={e => e.currentTarget.style.borderColor = C.border}
              />
              <button onClick={sendChat} style={{
                background: `linear-gradient(135deg, ${C.primary}, #2563eb)`,
                border: "none", borderRadius: 10, width: 38, height: 38,
                display: "grid", placeItems: "center", cursor: "pointer",
                boxShadow: `0 4px 10px rgba(77,142,255,0.25)`
              }}>
                <Icon name="send" size={14} color="#fff" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global styling overrides/animations */}
      <style>{`
        @keyframes slideIn {
          from { transform: translateY(-20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
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
