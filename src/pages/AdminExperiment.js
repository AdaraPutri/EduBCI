// src/pages/AdminExperiment.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useNeurosity } from "../services/neurosity";

const API_BASE = "http://127.0.0.1:8000";

export function AdminExperiment() {
  const [participantId, setParticipantId] = useState("");
  const [starting, setStarting] = useState(false);
  const navigate = useNavigate();

  const { selectedDevice, status } = useNeurosity();
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

  return (
    <div style={{ maxWidth: 900, margin: "80px auto", padding: 16 }}>
      <div style={{ marginTop: 12 }}>
        <label>
          Participant ID:{" "}
          <input
            value={participantId}
            onChange={(e) => setParticipantId(e.target.value)}
            placeholder="e.g. P001"
            style={{ padding: 6 }}
          />
        </label>
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 12 }}>
        <button onClick={() => navigate("/admin")}>Back to Admin Page</button>
        <button
          onClick={startParticipantSession}
          disabled={!participantId.trim() || !deviceReady || starting}
        >
          {starting ? "Starting..." : "Start participant view"}
        </button>
      </div>

      {!deviceReady && (
        <p style={{ color: "crimson", marginTop: 10 }}>
          Headset not ready yet. Go to Devices and connect/select your Crown.
          <br />
          Current status: {status?.state ?? "unknown"}
        </p>
      )}
    </div>
  );
}