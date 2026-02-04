import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = "http://127.0.0.1:8000";

export function Database() {
  const navigate = useNavigate();

  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    fetch(`${API_BASE}/api/participants`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!mounted) return;
        setParticipants(data.participants || []);
        setErr("");
      })
      .catch((e) => {
        if (!mounted) return;
        setErr(`Failed to load participants: ${e.message}`);
      })
      .finally(() => mounted && setLoading(false));

    return () => {
      mounted = false;
    };
  }, []);

  async function downloadCsv(pid) {
    try {
      const res = await fetch(`${API_BASE}/api/participants/${encodeURIComponent(pid)}/csv`);
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `participant_${pid}.csv`;
      a.click();

      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert(`Download failed for ${pid}: ${e.message}`);
    }
  }

  async function downloadSimFeedbackCsv(pid) {
    try {
      const res = await fetch(
        `${API_BASE}/api/participants/${encodeURIComponent(pid)}/simulation_feedback_csv`
      );
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `participant_${pid}_simulation_feedback.csv`;
      a.click();

      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert(`Download failed for ${pid}: ${e.message}`);
    }
  }
  
  async function downloadSimSurveyCsv(pid) {
    try {
      const res = await fetch(
        `${API_BASE}/api/participants/${encodeURIComponent(pid)}/simulation_survey_csv`
      );
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `participant_${pid}_simulation_survey.csv`;
      a.click();

      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert(`Download failed for ${pid}: ${e.message}`);
    }
  }


  return (
    <div
      style={{
        maxWidth: 900,
        margin: "60px auto",
        padding: 16,
        color: "white",
        background: "rgba(0,0,0,0.55)",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 6,
        }}
      >
        <h2 style={{ margin: 0, color: "white" }}>Database</h2>

        <button onClick={() => navigate("/admin")} style={outlineBtn}>
          Back to Admin
        </button>
      </div>

      {loading && <p style={{ color: "white" }}>Loading…</p>}
      {err && <p style={{ color: "crimson" }}>{err}</p>}

      {!loading && !err && (
        <div style={{ overflowX: "auto", marginTop: 16 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", color: "white" }}>
            <thead>
              <tr>
                <th style={th}>Participant ID</th>
                <th style={th}>Sessions</th>
                <th style={th}>Last Started</th>
                <th style={th}>Last Ended</th>
                <th style={th}>EEG + Labels</th>
                <th style={th}>Simulation Feedback</th>
                <th style={th}>Simulation Survey</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => (
                <tr key={p.participant_id}>
                  <td style={td}>{p.participant_id}</td>
                  <td style={td}>{p.session_count}</td>
                  <td style={td}>{formatMs(p.last_started_at_ms)}</td>
                  <td style={td}>{formatMs(p.last_ended_at_ms)}</td>
                  <td style={td}>
                    <button onClick={() => downloadCsv(p.participant_id)} style={outlineBtn}>
                      Download CSV
                    </button>
                  </td>
                  <td style={td}>
                    <button onClick={() => downloadSimFeedbackCsv(p.participant_id)} style={outlineBtn}>
                      Download CSV
                    </button>
                  </td>
                  <td style={td}>
                    <button onClick={() => downloadSimSurveyCsv(p.participant_id)} style={outlineBtn}>
                        Download CSV
                    </button>
                    </td>
                </tr>
              ))}

              {participants.length === 0 && (
                <tr>
                  <td style={td} colSpan={7}>
                    No participants yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th = {
  textAlign: "left",
  padding: "10px 8px",
  borderBottom: "1px solid rgba(255,255,255,0.2)",
  fontSize: 14,
  color: "rgba(255,255,255,0.8)",
};

const td = {
  padding: "10px 8px",
  borderBottom: "1px solid rgba(255,255,255,0.12)",
  fontSize: 16,
  color: "white",
};

const outlineBtn = {
  fontSize: 16,
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.6)",
  background: "transparent",
  color: "white",
  cursor: "pointer",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

function formatMs(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  return d.toLocaleString();
}