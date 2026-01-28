// src/pages/ReadingExperiment.js
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { paragraphs } from "../data/paragraphs.js";
import { buildParagraphsWithSentences } from "../utils/sentenceUtils.js";
import { neurosity, useNeurosity } from "../services/neurosity";

const CHANNELS = ["PO3", "PO4", "C3", "C4", "CP3", "CP4", "F5", "F6"];

export function ReadingExperiment() {
  const navigate = useNavigate();

  // --- neurosity device readiness ---
  const { selectedDevice, status } = useNeurosity();

  const deviceReady =
    !!selectedDevice?.deviceId &&
    (status?.state === "online" ||
      status?.state === "connected" ||
      status?.connected === true);

  // --- paragraph data ---
  const PARAGRAPHS = useMemo(() => buildParagraphsWithSentences(paragraphs), []);
  const [paragraphIndex, setParagraphIndex] = useState(0);
  const [sentenceIndex, setSentenceIndex] = useState(0);

  const current = PARAGRAPHS[paragraphIndex];
  const currentSentence =
    current && current.sentences ? current.sentences[sentenceIndex] : null;

  // --- experiment state ---
  const [participantId, setParticipantId] = useState("");
  const [started, setStarted] = useState(false);
  const [inBreak, setInBreak] = useState(false);
  const [finished, setFinished] = useState(false);
  const [sentenceStart, setSentenceStart] = useState(null);

  // label events
  const [events, setEvents] = useState([]);

  // EEG buffer (large -> ref)
  const eegRowsRef = useRef([]);

  // Track "current paragraph/sentence" for EEG tagging without resubscribing
  const activeIdsRef = useRef({ paragraph_id: null, sentence_id: null });

  useEffect(() => {
    activeIdsRef.current = {
      paragraph_id: current?.paragraphId ?? null,
      sentence_id: currentSentence?.sentenceId ?? null,
    };
  }, [current?.paragraphId, currentSentence?.sentenceId]);

  // start timer when a new sentence appears
  useEffect(() => {
    if (started && !finished && !inBreak && currentSentence) {
      setSentenceStart(Date.now());
    }
  }, [started, finished, inBreak, paragraphIndex, sentenceIndex, currentSentence]);

  // --- EEG subscription (starts once experiment starts & device ready; stops when finished) ---
  useEffect(() => {
    if (!started || finished || !deviceReady) return;

    const sub = neurosity.brainwaves("raw").subscribe((epoch) => {
      const t_app = Date.now();
      const t_device = epoch?.timestamp ?? epoch?.info?.timestamp ?? null;
      const data = epoch?.data;
      if (!data) return;

      const { paragraph_id, sentence_id } = activeIdsRef.current;

      // Case 1: one sample across channels: [ch1, ch2, ...]
      if (Array.isArray(data) && typeof data[0] === "number") {
        const row = { t_app, t_device, paragraph_id, sentence_id };
        CHANNELS.forEach((ch, i) => (row[ch] = data[i] ?? ""));
        eegRowsRef.current.push(row);
        return;
      }

      // Case 2: matrix
      if (Array.isArray(data) && Array.isArray(data[0])) {
        // samples x channels
        if (data[0].length === CHANNELS.length) {
          data.forEach((sample) => {
            const row = { t_app: Date.now(), t_device, paragraph_id, sentence_id };
            CHANNELS.forEach((ch, i) => (row[ch] = sample[i] ?? ""));
            eegRowsRef.current.push(row);
          });
          return;
        }

        // channels x samples
        if (data.length === CHANNELS.length) {
          const nSamples = data[0].length;
          for (let s = 0; s < nSamples; s++) {
            const row = { t_app: Date.now(), t_device, paragraph_id, sentence_id };
            CHANNELS.forEach((ch, i) => (row[ch] = data[i]?.[s] ?? ""));
            eegRowsRef.current.push(row);
          }
        }
      }
    });

    return () => sub.unsubscribe();
  }, [started, finished, deviceReady]);

  // keypress labels: only "1" and "2"
  useEffect(() => {
    function onKeyDown(e) {
      if (!started || finished || inBreak || !currentSentence) return;
      if (!["1", "2"].includes(e.key)) return;

      const labelMap = { "1": "neutral", "2": "confusion" };
      const label = labelMap[e.key];
      const now = Date.now();

      const newEvent = {
        participant_id: participantId,
        paragraph_id: current.paragraphId,
        paragraph_type: current.type,
        sentence_id: currentSentence.sentenceId,
        t_sentence_start: sentenceStart,
        t_sentence_end: now,
        key_label: label,
        t_key_press: now,
      };

      setEvents((prev) => [...prev, newEvent]);
      advanceSentence();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    started,
    finished,
    inBreak,
    participantId,
    current,
    currentSentence,
    sentenceStart,
    paragraphIndex,
    sentenceIndex,
  ]);

  function advanceSentence() {
    const isLastSentence = sentenceIndex + 1 >= current.sentences.length;
    const isLastParagraph = paragraphIndex + 1 >= PARAGRAPHS.length;

    if (!isLastSentence) {
      setSentenceIndex((i) => i + 1);
      return;
    }

    // If last sentence of last paragraph -> finish
    if (isLastParagraph) {
      setInBreak(false);
      setFinished(true);
      return;
    }

    // move to next paragraph with a break
    setInBreak(true);
    setTimeout(() => {
      setParagraphIndex((p) => p + 1);
      setSentenceIndex(0);
      setInBreak(false);
    }, 3000);
  }

  function startExperiment() {
    if (!participantId.trim()) return;
    if (!deviceReady) return;

    // reset buffers
    eegRowsRef.current = [];
    setEvents([]);
    setParagraphIndex(0);
    setSentenceIndex(0);
    setInBreak(false);
    setFinished(false);

    setStarted(true);
    setSentenceStart(Date.now());
  }

  // Combine EEG rows with label events using UI timestamps (t_app within sentence start/end)
  function downloadCombinedCSV() {
    const eegRows = eegRowsRef.current;
    const labelEvents = [...events].sort(
      (a, b) => a.t_sentence_start - b.t_sentence_start
    );

    let j = 0;

    const combined = eegRows.map((r) => {
      while (j < labelEvents.length && r.t_app > labelEvents[j].t_sentence_end) {
        j++;
      }

      const match =
        j < labelEvents.length &&
        r.t_app >= labelEvents[j].t_sentence_start &&
        r.t_app <= labelEvents[j].t_sentence_end
          ? labelEvents[j]
          : null;

      return {
        participant_id: participantId,
        t_app: r.t_app,
        t_device: r.t_device ?? "",
        paragraph_id: match?.paragraph_id ?? r.paragraph_id ?? "",
        sentence_id: match?.sentence_id ?? r.sentence_id ?? "",
        key_label: match?.key_label ?? "",
        ...CHANNELS.reduce((acc, ch) => {
          acc[ch] = r[ch] ?? "";
          return acc;
        }, {}),
      };
    });

    const header = [
      "participant_id",
      "t_app",
      "t_device",
      "paragraph_id",
      "sentence_id",
      "key_label",
      ...CHANNELS,
    ];

    const rows = combined.map((x) => header.map((k) => (x[k] ?? "")).join(","));

    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `combined_${participantId}.csv`;
    a.click();

    URL.revokeObjectURL(url);
  }

  // --- UI ---
  if (!started) {
    return (
      <div style={{ maxWidth: 900, margin: "80px auto", padding: 16 }}>
        <h2>Reading Experiment</h2>

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

        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => navigate("/devices")}
            style={{ marginRight: 10 }}
          >
            Go to Devices
          </button>

          <button
            onClick={startExperiment}
            disabled={!participantId.trim() || !deviceReady}
          >
            Start
          </button>

          {!deviceReady && (
            <p style={{ color: "crimson", marginTop: 10 }}>
              Headset not ready yet. Go to Devices and connect/select your Crown.
              <br />
              Current status: {status?.state ?? "unknown"}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (inBreak) {
    return (
      <div style={{ maxWidth: 900, margin: "80px auto", padding: 16 }}>
        <h3>Break</h3>
        <p>Next paragraph will start soon...</p>
      </div>
    );
  }

  // ✅ Thank-you page after last sentence of last paragraph
  if (finished) {
    const eegCount = eegRowsRef.current.length;
    return (
      <div style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
        <h2>Thank you for participating!</h2>
        <p>Your session is complete.</p>

        <div style={{ marginTop: 12 }}>
          <p>Labels collected: {events.length}</p>
          <p>EEG rows collected: {eegCount}</p>

          {eegCount === 0 && (
            <p style={{ color: "crimson" }}>
              No EEG data was recorded. This usually means the “raw” stream
              didn’t emit data (device not actually streaming, wrong stream name,
              or headset not fully connected).
            </p>
          )}
        </div>

        <div style={{ marginTop: 18 }}>
          <button onClick={downloadCombinedCSV} style={{ marginRight: 10 }}>
            Download combined CSV
          </button>
          <button onClick={() => navigate("/")}>Back to Home</button>
        </div>
      </div>
    );
  }

  // Safety fallback (shouldn’t happen)
  if (!current || !currentSentence) {
    return (
      <div style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
        <h3>Session ended.</h3>
        <button onClick={downloadCombinedCSV}>Download combined CSV</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "80px auto", padding: 16 }}> 
      <h3>
        Paragraph {current.paragraphId} / {PARAGRAPHS.length}
      </h3>

      {/* Whole paragraph, sentence highlighted */}
      <div style={{ fontSize: 25, lineHeight: 1.8 }}>
        {current.sentences.slice(0, sentenceIndex + 1).map((s) => {
          const isActive = s.sentenceId === currentSentence.sentenceId;
          return (
            <span
              key={s.sentenceId}
              style={{
                background: isActive
                  ? "rgba(255, 235, 59, 0.5)"
                  : "transparent",
                padding: isActive ? "2px 4px" : 0,
                borderRadius: isActive ? 6 : 0,
                transition: "background 120ms ease",
                marginRight: 6,
              }}
            >
              {s.text}
            </span>
          );
        })}
      </div>

      <div style={{ marginTop: 18, color: "#444" }}>
        Press <b>1</b> = neutral, <b>2</b> = confusion
      </div>

      {/* optional tiny live debug */}
      <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
        EEG rows buffered: {eegRowsRef.current.length} &nbsp;|&nbsp; Labels:{" "}
        {events.length}
      </div>
    </div>
  );
}

