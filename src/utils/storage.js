const PARTICIPANTS_KEY = "edubci_participants_v1";
const EVENTS_KEY = "edubci_label_events_v1";

function safeParseJSON(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function loadParticipants() {
  const raw = localStorage.getItem(PARTICIPANTS_KEY);
  return safeParseJSON(raw || "[]", []);
}

export function upsertParticipantId(participantId) {
  const pid = (participantId || "").trim();
  if (!pid) return;

  const participants = loadParticipants();
  if (!participants.includes(pid)) {
    participants.push(pid);
    localStorage.setItem(PARTICIPANTS_KEY, JSON.stringify(participants));
  }
}

export function loadEvents() {
  const raw = localStorage.getItem(EVENTS_KEY);
  return safeParseJSON(raw || "[]", []);
}

export function appendEvent(eventObj) {
  const events = loadEvents();
  events.push(eventObj);
  localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
}

export function clearAllExperimentData() {
  localStorage.removeItem(PARTICIPANTS_KEY);
  localStorage.removeItem(EVENTS_KEY);
}

function toCSV(rows, header) {
  const escape = (v) => {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replaceAll('"', '""')}"`;
    }
    return s;
  };

  const lines = [];
  lines.push(header.map(escape).join(","));
  for (const row of rows) {
    lines.push(header.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadAllEventsCSV() {
  const events = loadEvents();
  const header = [
    "participant_id",
    "session_id",
    "paragraph_id",
    "paragraph_type",
    "sentence_id",
    "sentence_text",
    "t_sentence_start",
    "t_sentence_end",
    "key_label",
    "t_key_press",
  ];
  const csv = toCSV(events, header);
  downloadText("all_labels.csv", csv);
}

export function downloadParticipantEventsCSV(participantId) {
  const pid = (participantId || "").trim();
  const events = loadEvents().filter((e) => e.participant_id === pid);

  const header = [
    "participant_id",
    "session_id",
    "paragraph_id",
    "paragraph_type",
    "sentence_id",
    "sentence_text",
    "t_sentence_start",
    "t_sentence_end",
    "key_label",
    "t_key_press",
  ];
  const csv = toCSV(events, header);
  downloadText(`labels_${pid}.csv`, csv);
}
