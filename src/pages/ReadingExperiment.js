// src/pages/ReadingExperiment.js
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { paragraphs } from "../data/paragraphs.js";
import { buildParagraphsWithSentences } from "../utils/sentenceUtils.js";
import { neurosity, useNeurosity } from "../services/neurosity";

const API_BASE = "http://127.0.0.1:8000";
const CHANNELS = ["PO3", "PO4", "C3", "C4", "CP3", "CP4", "F5", "F6"];

export function ReadingExperiment() {
  const [sessionId, setSessionId] = useState(null);
  const [participantId, setParticipantId] = useState("");

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // --- neurosity device readiness ---
  const { selectedDevice, status } = useNeurosity();

  const deviceReady =
    !!selectedDevice?.deviceId &&
    (status?.state === "online" ||
      status?.state === "connected" ||
      status?.connected === true);

  // Pull participant/session from URL (participant-only mode)
  useEffect(() => {
    const pid = (searchParams.get("participantId") || "").trim();
    const sid = (searchParams.get("sessionId") || "").trim();

    setParticipantId(pid);
    setSessionId(sid || null);
  }, [searchParams]);

  // --- paragraph data ---
  const PARAGRAPHS = useMemo(() => {
    // --- 1) parse participant shift (P001 -> 0, P002 -> 1, ... wraps mod 10) ---
    const digits = participantId.match(/\d+/)?.[0];
    const n = digits ? parseInt(digits, 10) : 1;
    const shift = ((n - 1) % 10 + 10) % 10;

    // --- 2) group paragraphs by type ---
    const N = paragraphs.filter((p) => p.type === "neutral");
    const P = paragraphs.filter((p) => p.type === "partly_confusing");
    const F = paragraphs.filter((p) => p.type === "fully_confusing");

    // safety fallback if counts aren't 10/10/10 for some reason
    if (N.length !== 10 || P.length !== 10 || F.length !== 10) {
      return buildParagraphsWithSentences(paragraphs);
    }

    // --- 3) rotate helper ---
    const rotate = (arr, s) => arr.slice(s).concat(arr.slice(0, s));
    const Nr = rotate(N, shift);
    const Pr = rotate(P, shift);
    const Fr = rotate(F, shift);

    // --- 4) fixed mixed type schedule (10 N, 10 P, 10 F) ---
    const schedule = [
      "P", "N", "P", "P", "N", "N", "F", "N", "N", "P",
      "P", "F", "P", "F", "F", "P", "N", "F", "N", "F",
      "P", "F", "P", "N", "P", "F", "N", "N", "F", "F",
    ];

    // --- 5) build ordered list by walking schedule ---
    let iN = 0, iP = 0, iF = 0;
    const ordered = schedule.map((t) => {
      if (t === "N") return Nr[iN++];
      if (t === "P") return Pr[iP++];
      return Fr[iF++];
    });

    return buildParagraphsWithSentences(ordered);
  }, [participantId]);

  const [paragraphIndex, setParagraphIndex] = useState(0);
  const [sentenceIndex, setSentenceIndex] = useState(0);

  const current = PARAGRAPHS[paragraphIndex];
  const currentSentence =
    current && current.sentences ? current.sentences[sentenceIndex] : null;

  const totalParagraphs = PARAGRAPHS.length;
  const currentParagraphNumber = paragraphIndex + 1; // 1-based for display

  // --- experiment state ---
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

  // Track current session key so we can reset when URL changes (new session)
  const activeSessionKeyRef = useRef(null);

  useEffect(() => {
    activeIdsRef.current = {
      paragraph_id: current?.paragraphId != null ? Number(current.paragraphId) : null,
      sentence_id: currentSentence?.sentenceId ?? null,
    };
  }, [current?.paragraphId, currentSentence?.sentenceId]);

  // Auto-start once we have participantId + sessionId AND headset is ready
  useEffect(() => {
    const sid = sessionId || "";
    const key =
      participantId.trim() && sid.trim() ? `${participantId.trim()}|${sid.trim()}` : null;

    if (!key) {
      setStarted(false);
      return;
    }
    if (!deviceReady) {
      setStarted(false);
      return;
    }

    if (activeSessionKeyRef.current === key) return;
    activeSessionKeyRef.current = key;

    // reset buffers/state (same as startExperiment, but without calling /start)
    eegRowsRef.current = [];
    setEvents([]);
    setParagraphIndex(0);
    setSentenceIndex(0);
    setInBreak(false);
    setFinished(false);

    setStarted(true);
    setSentenceStart(Date.now());
  }, [participantId, sessionId, deviceReady]);

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
        CHANNELS.forEach((ch, i) => (row[ch] = data[i] ?? null));
        eegRowsRef.current.push(row);
        return;
      }

      // Case 2: matrix
      if (Array.isArray(data) && Array.isArray(data[0])) {
        // samples x channels
        if (data[0].length === CHANNELS.length) {
          data.forEach((sample) => {
            const row = { t_app: Date.now(), t_device, paragraph_id, sentence_id };
            CHANNELS.forEach((ch, i) => (row[ch] = sample[i] ?? null));
            eegRowsRef.current.push(row);
          });
          return;
        }

        // channels x samples
        if (data.length === CHANNELS.length) {
          const nSamples = data[0].length;
          for (let s = 0; s < nSamples; s++) {
            const row = { t_app: Date.now(), t_device, paragraph_id, sentence_id };
            CHANNELS.forEach((ch, i) => (row[ch] = data[i]?.[s] ?? null));
            eegRowsRef.current.push(row);
          }
        }
      }
    });

    return () => sub.unsubscribe();
  }, [started, finished, deviceReady]);

  // 2) periodic batch flush (every 1s while running)
  useEffect(() => {
    if (!started || finished || !sessionId) return;

    const interval = setInterval(() => {
      if (inBreak) return;

      const batch = eegRowsRef.current.slice(0, 200);
      if (batch.length === 0) return;

      eegRowsRef.current = eegRowsRef.current.slice(200);

      fetch(`${API_BASE}/api/session/${sessionId}/eeg/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participant_id: participantId, rows: batch }),
      })
        .then(async (r) => {
          if (!r.ok) {
            console.log("EEG batch error", r.status, await r.json());
          }
        })
        .catch((e) => console.log("EEG batch fetch failed", e));
    }, 1000);

    return () => clearInterval(interval);
  }, [started, finished, sessionId, participantId, inBreak]);

  useEffect(() => {
    if (!finished || !sessionId) return;

    const remaining = eegRowsRef.current;
    eegRowsRef.current = [];

    const flush = remaining.length
      ? fetch(`${API_BASE}/api/session/${sessionId}/eeg/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participant_id: participantId, rows: remaining }),
        }).catch(() => {})
      : Promise.resolve();

    flush.finally(() => {
      fetch(`${API_BASE}/api/session/${sessionId}/finish`, { method: "POST" }).catch(() => {});
    });
  }, [finished, sessionId, participantId]);

  function labelCurrentSentence(label) {
    if (!started || finished || inBreak || !currentSentence) return;

    const now = Date.now();

    const newEvent = {
      participant_id: participantId,
      paragraph_id: current?.paragraphId != null ? Number(current.paragraphId) : null,
      paragraph_type: current.type,
      sentence_id: currentSentence.sentenceId,
      t_sentence_start: sentenceStart,
      t_sentence_end: now,
      key_label: label,
      t_key_press: now, // keep field name so CSV logic doesn't change
    };

    if (sessionId) {
      fetch(`${API_BASE}/api/session/${sessionId}/label`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newEvent),
      }).catch(() => {});
    }

    setEvents((prev) => [...prev, newEvent]);
    advanceSentence();
  }

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
    return;
  }

  function continueToNextParagraph() {
    setParagraphIndex((p) => p + 1);
    setSentenceIndex(0);
    setInBreak(false);
  }

  // --- UI ---
  if (!started) {
    const missingIds = !participantId.trim() || !sessionId;
    return (
      <div style={{ maxWidth: 900, margin: "80px auto", padding: 16 }}>
        <h2>Reading Experiment</h2>

        {missingIds ? (
          <p style={{ marginTop: 12 }}>
            Session not started yet. Please ask the admin to start the session.
          </p>
        ) : (
          <>
            <p style={{ marginTop: 12 }}>
              Waiting for headset connection...
            </p>
            <p style={{ color: "crimson", marginTop: 10 }}>
              Headset not ready yet.
              <br />
              Current status: {status?.state ?? "unknown"}
            </p>
          </>
        )}

        <div style={{ marginTop: 14 }}>
          <button onClick={() => navigate("/admin/experiment")}>
            Back to setup
          </button>
        </div>
      </div>
    );
  }

  if (inBreak) {
    return (
      <div
        style={{
          maxWidth: 900,
          margin: "80px auto",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          minHeight: "60vh",
          justifyContent: "space-between",
        }}
      >
        <div>
          <h3>Break</h3>
          <p style={{ fontSize: 25, marginTop: 8 }}>Take as long as you need.</p>
        </div>

        <div style={{ alignSelf: "flex-end" }}>
          <button
            onClick={continueToNextParagraph}
            style={{
              fontSize: 25,
              padding: "12px 14px",
              borderRadius: 12,
              border: "none",
              cursor: "pointer",
              background: "#1565c0",
              color: "white",
              fontWeight: 600,
            }}
          >
            Ready for next paragraph
          </button>
        </div>
      </div>
    );
  }

  // Thank-you page after last sentence of last paragraph
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
      </div>
    );
  }

  // Safety fallback (shouldn’t happen)
  if (!current || !currentSentence) {
    return (
      <div style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
        <h3>Session ended.</h3>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "80px auto", padding: 16 }}>
      {/* Progress header (uses paragraphIndex, NOT paragraphId) */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 14,
        }}
      >
        <div style={{ fontSize: 18, color: "#666" }}>
          Paragraph {currentParagraphNumber} / {totalParagraphs}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 18,
          alignItems: "stretch",
        }}
      >
        {/* Left: paragraph */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 25, lineHeight: 1.8 }}>
            {current.sentences.slice(0, sentenceIndex + 1).map((s) => {
              const isActive = s.sentenceId === currentSentence.sentenceId;
              return (
                <span
                  key={s.sentenceId}
                  style={{
                    background: isActive ? "rgba(255, 235, 59, 0.5)" : "transparent",
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
        </div>

        {/* Right: labeling buttons */}
        <div
          style={{
            width: 190,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
              paddingBottom: 4,
            }}
          >
            <button
              onClick={() => labelCurrentSentence("neutral")}
              style={{
                fontSize: 25,
                padding: "12px 14px",
                borderRadius: 12,
                border: "none",
                cursor: "pointer",
                background: "#2e7d32",
                color: "white",
                fontWeight: 600,
              }}
            >
              Neutral
            </button>

            <button
              onClick={() => labelCurrentSentence("confusion")}
              style={{
                fontSize: 25,
                padding: "12px 14px",
                borderRadius: 12,
                border: "none",
                cursor: "pointer",
                background: "#c62828",
                color: "white",
                fontWeight: 600,
              }}
            >
              Confusing
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}