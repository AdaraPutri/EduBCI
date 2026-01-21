// src/pages/Admin.js

import React, { useMemo } from "react";
import {
  loadParticipants,
  downloadParticipantEventsCSV,
  downloadAllEventsCSV,
  clearAllExperimentData,
} from "../utils/storage.js";

export function Admin() {
  const participants = useMemo(() => loadParticipants(), []);

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h2>Admin</h2>

      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <button onClick={downloadAllEventsCSV} style={{ padding: "8px 14px" }}>
          Download ALL labels CSV
        </button>
        <button
          onClick={() => {
            if (window.confirm("Clear all saved participants + label events on this browser?")) {
              clearAllExperimentData();
              window.location.reload();
            }
          }}
          style={{ padding: "8px 14px" }}
        >
          Clear local data
        </button>
      </div>

      <h3>Participants</h3>
      {participants.length === 0 ? (
        <p>No participants saved on this browser yet.</p>
      ) : (
        <ul>
          {participants.map((pid) => (
            <li key={pid} style={{ marginBottom: 8 }}>
              <b>{pid}</b> &nbsp;
              <button onClick={() => downloadParticipantEventsCSV(pid)} style={{ padding: "6px 10px" }}>
                Download CSV
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

