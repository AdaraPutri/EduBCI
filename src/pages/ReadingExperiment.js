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
    const digits = participantId.match(/\d+/)?.[0];
    const n = digits ? parseInt(digits, 10) : 1;
    const shift = ((n - 1) % 10 + 10) % 10;

    const N = paragraphs.filter((p) => p.type === "neutral");
    const P = paragraphs.filter((p) => p.type === "partly_confusing");
    const F = paragraphs.filter((p) => p.type === "fully_confusing");

    if (N.length !== 10 || P.length !== 10 || F.length !== 10) {
      return buildParagraphsWithSentences(paragraphs);
    }

    const rotate = (arr, s) => arr.slice(s).concat(arr.slice(0, s));
    const Nr = rotate(N, shift);
    const Pr = rotate(P, shift);
    const Fr = rotate(F, shift);

    const schedule = [
      "P", "N", "P", "P", "N", "N", "F", "N", "N", "P",
      "P", "F", "P", "F", "F", "P", "N", "F", "N", "F",
      "P", "F", "P", "N", "P", "F", "N", "N", "F", "F",
    ];

    let iN = 0, iP = 0, iF = 0;
    const ordered = schedule.map((t) => {
      if (t === "N") return Nr[iN++];
      if (t === "P") return Pr[iP++];
      return Fr[iF++]; // e.g. participant 1 will have F[0] first, participant 2 will have F[1] first, etc.
    });

    return buildParagraphsWithSentences(ordered);
  }, [participantId]);

  const [paragraphIndex, setParagraphIndex] = useState(0);
  const [sentenceIndex, setSentenceIndex] = useState(0);

  const current = PARAGRAPHS[paragraphIndex];
  const currentSentence =
    current && current.sentences ? current.sentences[sentenceIndex] : null;

  const totalParagraphs = PARAGRAPHS.length;
  const currentParagraphNumber = paragraphIndex + 1;

  // --- experiment state ---
  const [started, setStarted] = useState(false);
  const [armed, setArmed] = useState(false); // ✅ new: session is ready, waiting for participant to press Start
  const [inBreak, setInBreak] = useState(false);
  const [finished, setFinished] = useState(false);
  const [sentenceStart, setSentenceStart] = useState(null);

  const [events, setEvents] = useState([]);

  const eegRowsRef = useRef([]);
  const activeIdsRef = useRef({ paragraph_id: null, sentence_id: null });

  const activeSessionKeyRef = useRef(null);

  useEffect(() => {
    activeIdsRef.current = {
      paragraph_id: current?.paragraphId != null ? Number(current.paragraphId) : null,
      sentence_id: currentSentence?.sentenceId ?? null,
    };
  }, [current?.paragraphId, currentSentence?.sentenceId]);

  // ✅ Arm the session once we have participantId + sessionId AND headset is ready.
  // Do NOT start the task yet; wait for participant to press Start.
  useEffect(() => {
    const sid = sessionId || "";
    const key =
      participantId.trim() && sid.trim() ? `${participantId.trim()}|${sid.trim()}` : null;

    if (!key) {
      setStarted(false);
      setArmed(false);
      activeSessionKeyRef.current = null;
      return;
    }
    if (!deviceReady) {
      setStarted(false);
      setArmed(false);
      return;
    }

    if (activeSessionKeyRef.current === key) return;
    activeSessionKeyRef.current = key;

    eegRowsRef.current = [];
    setEvents([]);
    setParagraphIndex(0);
    setSentenceIndex(0);
    setInBreak(false);
    setFinished(false);

    setSentenceStart(null);
    setStarted(false);
    setArmed(true);
  }, [participantId, sessionId, deviceReady]);

  function beginExperiment() {
    if (!armed) return;
    setArmed(false);
    setStarted(true);
    setSentenceStart(Date.now());
  }

  // start timer when a new sentence appears
  useEffect(() => {
    if (started && !finished && !inBreak && currentSentence) {
      setSentenceStart(Date.now());
    }
  }, [started, finished, inBreak, paragraphIndex, sentenceIndex, currentSentence]);

  // --- EEG subscription ---
  useEffect(() => {
    if (!started || finished || !deviceReady) return;

    const sub = neurosity.brainwaves("raw").subscribe((epoch) => {
      const t_app = Date.now();
      const t_device = epoch?.timestamp ?? epoch?.info?.timestamp ?? null;
      const data = epoch?.data;
      if (!data) return;

      const { paragraph_id, sentence_id } = activeIdsRef.current;

      if (Array.isArray(data) && typeof data[0] === "number") {
        const row = { t_app, t_device, paragraph_id, sentence_id };
        CHANNELS.forEach((ch, i) => (row[ch] = data[i] ?? null));
        eegRowsRef.current.push(row);
        return;
      }

      if (Array.isArray(data) && Array.isArray(data[0])) {
        if (data[0].length === CHANNELS.length) {
          data.forEach((sample) => {
            const row = { t_app: Date.now(), t_device, paragraph_id, sentence_id };
            CHANNELS.forEach((ch, i) => (row[ch] = sample[i] ?? null));
            eegRowsRef.current.push(row);
          });
          return;
        }

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

  // periodic batch flush
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
      fetch(`${API_BASE}/api/session/${sessionId}/finish`, { method: "POST" }).catch(
        () => {}
      );
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
      t_key_press: now,
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

    if (isLastParagraph) {
      setInBreak(false);
      setFinished(true);
      return;
    }

    setInBreak(true);
  }

  function continueToNextParagraph() {
    setParagraphIndex((p) => p + 1);
    setSentenceIndex(0);
    setInBreak(false);
  }

  // --- UI ---
  if (!started) {
    const missingIds = !participantId.trim() || !sessionId;

    // ✅ NEW: start screen before first paragraph
    if (!missingIds && deviceReady && armed) {
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
            <p style={{ fontSize: 25, marginTop: 8 }}>
              Thank you for agreeing to participate in this experiment. There are two phases. We will now begin with Phase 1.
            </p>
            <h3>Phase 1</h3>
            <p style={{ fontSize: 25, marginTop: 8 }}>
              You will read one paragraph at a time, revealed sentence-by-sentence. 
              After each sentence, press the button "Neutral" if it was easy to understand, or "Confusing" if it was slightly to very difficult to understand.
              <br />
              <br />
              There are no right or wrong answers, please label based on your experience. Keep your focus on the text, try to minimize unnecessary movement, and continue until you reach the final thank-you screen.
              If you need to take a break, you can do so between paragraphs.
              <br />
              <br />
              When you’re ready, press "Start" to begin the reading task.
            </p>
          </div>

          <div style={{ alignSelf: "flex-end" }}>
            <button
              onClick={beginExperiment}
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
              Start
            </button>
          </div>
        </div>
      );
    }

    return (
      <div style={{ maxWidth: 900, margin: "80px auto", padding: 16 }}>
        <h2>Reading Experiment</h2>

        {missingIds ? (
          <p style={{ marginTop: 12 }}>
            Session not started yet. Please ask the admin to start the session.
          </p>
        ) : (
          <>
            <p style={{ marginTop: 12 }}>Waiting for headset connection...</p>
            <p style={{ color: "crimson", marginTop: 10 }}>
              Headset not ready yet.
              <br />
              Current status: {status?.state ?? "unknown"}
            </p>
          </>
        )}

        <div style={{ marginTop: 14 }}>
          <button onClick={() => navigate("/admin")}>Back to admin</button>
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
          <h3>Optional Break</h3>
          <p style={{ fontSize: 25, marginTop: 8 }}>You have completed {currentParagraphNumber} of {totalParagraphs} paragraphs. If you'd like, feel free to take a one-minute break before continuing.</p>
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

  if (finished) {
    const eegCount = eegRowsRef.current.length;
    return (
      <div style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
        <h2>Phase 1 is completed.</h2>
        <p>Let the researcher know you are finished with Phase 1.</p>
      </div>
    );
  }

  if (!current || !currentSentence) {
    return (
      <div style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
        <h3>Session ended.</h3>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "80px auto", padding: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 14,
        }}
      >
      </div>

      <div style={{ display: "flex", gap: 18, alignItems: "stretch" }}>
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

        <div style={{ width: 190, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 4 }}>
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