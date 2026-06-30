"use client";

import React, { useState, useEffect, useRef } from "react";
import { C, Icon } from "./Theme";

interface TopBarProps {
  user: any;
  onLogout?: () => void;
  onNavigate?: (path: string) => void;
}

export default function TopBar({ user, onLogout, onNavigate }: TopBarProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [search, setSearch] = useState("");
  
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  // Mock Notifications Data
  const [notifications, setNotifications] = useState([
    { id: 1, text: "Document 'P&ID_Reactor_5.pdf' processed successfully.", time: "10m ago", read: false },
    { id: 2, text: "Maintenance required for Pump A-12.", time: "1h ago", read: false },
    { id: 3, text: "System update scheduled for tonight.", time: "3h ago", read: true },
  ]);

  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfile(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleOpenNotifications = () => {
    setShowNotifications(!showNotifications);
    setShowProfile(false);
    if (!showNotifications) {
      // Mark all as read when opening
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    }
  };

  const handleOpenProfile = () => {
    setShowProfile(!showProfile);
    setShowNotifications(false);
  };

  return (
    <header style={{
      position: "fixed", top: 0, left: 256, right: 0, height: 64,
      background: "rgba(11,19,38,0.85)", backdropFilter: "blur(12px)",
      borderBottom: `1px solid ${C.border}`,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 28px", zIndex: 900,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        background: C.surf2, border: `2px solid ${C.border}`,
        borderRadius: 10, padding: "8px 16px",
        boxShadow: `2px 2px 0 ${C.black}`, width: 340,
        transition: "all 0.2s ease"
      }}>
        <Icon name="search" size={18} color={C.muted} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && search.trim() && onNavigate) {
              sessionStorage.setItem("pending_copilot_query", search.trim());
              setSearch("");
              onNavigate("copilot");
            }
          }}
          placeholder="Search documents, tags, queries..."
          style={{
            background: "none", border: "none", outline: "none",
            fontSize: 13, color: C.text, width: "100%", fontFamily: "inherit"
          }}
        />
      </div>

      {/* Right actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        
        {/* Notifications */}
        <div ref={notifRef} style={{ position: "relative" }}>
          <button onClick={handleOpenNotifications} style={{
            position: "relative", background: showNotifications ? C.surf3 : "none", border: "none",
            cursor: "pointer", color: showNotifications ? C.text : C.muted, borderRadius: 8,
            width: 40, height: 40, display: "grid", placeItems: "center",
            transition: "all 0.2s"
          }}>
            <Icon name="notifications" size={22} color="inherit" />
            {unreadCount > 0 && (
              <span style={{
                position: "absolute", top: 8, right: 8,
                width: 8, height: 8, background: C.error,
                borderRadius: "50%", border: `2px solid ${C.bg}`
              }} />
            )}
          </button>

          {/* Notifications Dropdown */}
          {showNotifications && (
            <div style={{
              position: "absolute", top: 52, right: 0, width: 320,
              background: C.surf, border: `2px solid ${C.border}`,
              borderRadius: 12, boxShadow: `4px 4px 0 ${C.black}`,
              padding: "16px 0", zIndex: 1000,
              animation: "fadeIn 0.2s ease",
            }}>
              <div style={{ padding: "0 20px 12px", borderBottom: `1px solid ${C.surf2}`, fontWeight: 700, color: C.text, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                Notifications
              </div>
              <div style={{ maxHeight: 300, overflowY: "auto" }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: "20px", textAlign: "center", color: C.muted, fontSize: 13 }}>No new notifications</div>
                ) : (
                  notifications.map(n => (
                    <div key={n.id} style={{
                      padding: "12px 20px", borderBottom: `1px solid ${C.surf2}`,
                      background: n.read ? "transparent" : "rgba(78, 222, 163, 0.05)",
                      display: "flex", gap: 12, alignItems: "flex-start",
                      cursor: "pointer", transition: "background 0.2s"
                    }} onMouseEnter={(e) => e.currentTarget.style.background = C.surf3} onMouseLeave={(e) => e.currentTarget.style.background = n.read ? "transparent" : "rgba(78, 222, 163, 0.05)"}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: n.read ? "transparent" : C.accent, marginTop: 6, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 13, color: C.text, lineHeight: 1.4 }}>{n.text}</div>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{n.time}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div style={{ width: 1, height: 28, background: C.border }} />

        {/* User Profile */}
        {user && (
          <div ref={profileRef} style={{ position: "relative" }}>
            <div 
              onClick={handleOpenProfile}
              style={{ 
                display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                padding: "4px 8px", borderRadius: 30,
                background: showProfile ? C.surf3 : "transparent",
                transition: "all 0.2s"
              }}
            >
              <div style={{ textAlign: "right", display: "none", "@media(minWidth: 768px)": { display: "block" } } as any}>
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

            {/* Profile Dropdown */}
            {showProfile && (
              <div style={{
                position: "absolute", top: 56, right: 0, width: 240,
                background: C.surf, border: `2px solid ${C.border}`,
                borderRadius: 12, boxShadow: `4px 4px 0 ${C.black}`,
                padding: "8px 0", zIndex: 1000,
                animation: "fadeIn 0.2s ease",
              }}>
                <div style={{ padding: "12px 20px", borderBottom: `1px solid ${C.surf2}`, marginBottom: 4 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{user.username}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2, textTransform: "capitalize" }}>{user.role?.replace("_", " ")}</div>
                </div>
                
                <div 
                  style={{ padding: "10px 20px", fontSize: 13, color: C.text, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
                  onMouseEnter={(e) => e.currentTarget.style.background = C.surf3}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  <Icon name="person" size={18} /> My Profile
                </div>
                <div 
                  style={{ padding: "10px 20px", fontSize: 13, color: C.text, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
                  onMouseEnter={(e) => e.currentTarget.style.background = C.surf3}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  <Icon name="settings" size={18} /> Settings
                </div>
                
                <div style={{ height: 1, background: C.surf2, margin: "4px 0" }} />
                
                <div 
                  onClick={onLogout}
                  style={{ padding: "10px 20px", fontSize: 13, color: C.error, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, fontWeight: 600 }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255, 180, 171, 0.1)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  <Icon name="logout" size={18} color={C.error} /> Log out
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </header>
  );
}
