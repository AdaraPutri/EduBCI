// src/pages/Admin.js
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useNeurosity } from "../services/neurosity";
import { Nav } from "../components/Nav";

const API_BASE = "http://127.0.0.1:8000";

export function Admin() {
  const { user, selectedDevice, status } = useNeurosity();
  const navigate = useNavigate();

  const [participantId, setParticipantId] = useState("");
  const [starting, setStarting] = useState(false);

  const deviceReady =
    !!selectedDevice?.deviceId &&
    (status?.state === "online" ||
      status?.state === "connected" ||
      status?.connected === true);

  async function startParticipantSession() {
    const pid = participantId.trim();
    if (!pid || !deviceReady || starting) return;

    setStarting(true);
    try {
      const res = await fetch(`${API_BASE}/api/session/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participant_id: pid }),
      });

      const data = await res.json();
      const sessionId = data.session_id;

      navigate(
        `/participant?participantId=${encodeURIComponent(pid)}&sessionId=${encodeURIComponent(
          sessionId
        )}`
      );
    } catch (e) {
      console.log("Failed to start session", e);
    } finally {
      setStarting(false);
    }
  }

  const outlineBtnStyle = {
    fontSize: 25,
    padding: "12px 14px",
    borderRadius: 12,
    border: "2px solid white",
    background: "transparent",
    color: "white",
    cursor: "pointer",
    fontWeight: 600,
  };

  const cardStyle = {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(0,0,0,0.35)",
    color: "white",
    minHeight: 170,
  };

  const inputStyle = {
    fontSize: 25,
    padding: "12px 14px",
    borderRadius: 12,
    border: "2px solid white",
    background: "transparent",
    color: "white",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  };

  return (
    <main
      className="main-container"
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}
    >
      <h2>Hello, Admin!</h2>
      <div
        style={{
          width: "100%",
          maxWidth: 900,
          display: "flex",
          gap: 0,
          alignItems: "center",
        }}
      >
        <div style={{ flex: "0 0 auto" }}>
          {user ? <Nav /> : null}
        </div>

        {/* Participant box */}
        <div style={{ ...cardStyle, flex: "1 1 auto", marginLeft: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 18, opacity: 0.9 }}>Participant ID</div>
            <input
              value={participantId}
              onChange={(e) => setParticipantId(e.target.value)}
              placeholder="e.g. P001"
              style={inputStyle}
            />
            <div style={{ fontSize: 14, opacity: 0.65 }}>
              Enter ID above, then use <b>Start Participant View</b>.
            </div>
          </div>
        </div>
      </div>


      {/* Top buttons: keep Start Participant View next to View Database */}
      <div style={{ display: "flex", gap: 12 }}>
        <Link to="/admin/database">
          <button style={outlineBtnStyle}>View Database</button>
        </Link>

        <button
          style={outlineBtnStyle}
          onClick={startParticipantSession}
          disabled={!participantId.trim() || !deviceReady || starting}
        >
          {starting ? "Starting..." : "Start Participant View"}
        </button>
      </div>
    </main>
  );
}