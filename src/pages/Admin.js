// src/pages/Admin.js
import React, { useMemo, useState } from "react";

const STORAGE_KEY = "edubci_sessions_v1";
const HEADER = [
  "participant_id",
  "paragraph_id",
  "paragraph_type",
  "sentence_id",
  "t_sentence_start",
  "t_sentence_end",
  "key_label",
  "t_key_press",
  "eeg_timestamp",
  "F5","F6","C3","C4","CP3","CP4","PO3","PO4"
];

function readSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function csvEscape(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

function downloadRowsAsCSV(filename, rows) {
  const lines = [
    HEADER.join(","),
    ...rows.map((r) => HEADER.map((h) => csvEscape(r[h])).join(","))
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function Admin() {
  const sessions = useMemo(() => readSessions(), []);
  const participantIds = Object.keys(sessions);
  const [selected, setSelected] = useState(participantIds[0] || "");

  const selectedSessions = selected ? (sessions[selected] || []) : [];
  const latest = selectedSessions[selectedSessions.length - 1];

  return (
    <div style={{ padding: 24 }}>
      <h2>Admin</h2>

      {participantIds.length === 0 ? (
        <p>No sessions saved yet.</p>
      ) : (
        <>
          <label>
            Participant:
            <select value={selected} onChange={(e) => setSelected(e.target.value)} style={{ marginLeft: 10 }}>
              {participantIds.map((pid) => (
                <option key={pid} value={pid}>{pid}</option>
              ))}
            </select>
          </label>

          <div style={{ marginTop: 16 }}>
            <p>Sessions saved for {selected}: {selectedSessions.length}</p>

            <button
              onClick={() => {
                if (!latest) return;
                downloadRowsAsCSV(`combined_${selected}_${latest.savedAt}.csv`, latest.combinedRows || []);
              }}
              disabled={!latest}
            >
              Download latest combined CSV
            </button>
          </div>
        </>
      )}
    </div>
  );
}
