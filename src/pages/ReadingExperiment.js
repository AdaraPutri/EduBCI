// src/pages/ReadingExperiment.js

import React, { useState, useEffect, useMemo } from "react";
import { paragraphs } from "../data/paragraphs.js";
import { buildParagraphsWithSentences } from "../utils/sentenceUtils.js";
import { upsertParticipantId, appendEvent } from "../utils/storage.js";

const PARAGRAPHS = buildParagraphsWithSentences(paragraphs);

export function ReadingExperiment() {
  const [participantId, setParticipantId] = useState("");
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);

  const [paragraphIndex, setParagraphIndex] = useState(0);
  const [sentenceIndex, setSentenceIndex] = useState(0);

  const [sentenceStart, setSentenceStart] = useState(null);
  const [inBreak, setInBreak] = useState(false);

  const [sessionId, setSessionId] = useState("");

  const current = PARAGRAPHS[paragraphIndex] || null;
  const sentences = current?.sentences || [];
  const currentSentence = sentences[sentenceIndex] || null;

  // create a stable session id once we start
  const makeSessionId = () => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return `sess_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  };

  // when a new sentence becomes active, start timing it
  useEffect(() => {
    if (started && !finished && !inBreak && currentSentence) {
      setSentenceStart(Date.now());
    }
  }, [started, finished, inBreak, paragraphIndex, sentenceIndex]);

  // key handler
  useEffect(() => {
    function onKeyDown(e) {
      if (!started || finished || inBreak || !currentSentence) return;
      if (!["1", "2"].includes(e.key)) return;

      const labelMap = { "1": "neutral", "2": "confusion" };
      const label = labelMap[e.key];
      const now = Date.now();

      const newEvent = {
        participant_id: participantId.trim(),
        session_id: sessionId,
        paragraph_id: current.paragraphId,
        paragraph_type: current.type,
        sentence_id: currentSentence.sentenceId,
        sentence_text: currentSentence.text,
        t_sentence_start: sentenceStart ?? now,
        t_sentence_end: now,
        key_label: label,
        t_key_press: now,
      };

      appendEvent(newEvent);
      advanceSentence();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    started,
    finished,
    inBreak,
    participantId,
    sessionId,
    current,
    currentSentence,
    sentenceStart,
    sentenceIndex,
    paragraphIndex,
  ]);

  function advanceSentence() {
    const lastSentenceInParagraph = sentenceIndex + 1 >= sentences.length;
    const lastParagraphOverall = paragraphIndex + 1 >= PARAGRAPHS.length;

    if (!lastSentenceInParagraph) {
      setSentenceIndex((i) => i + 1);
      return;
    }

    if (lastParagraphOverall) {
      setFinished(true);
      return;
    }

    // move to next paragraph with a 15s break
    setInBreak(true);
    setTimeout(() => {
      setParagraphIndex((p) => p + 1);
      setSentenceIndex(0);
      setInBreak(false);
    }, 15000);
  }

  function startExperiment() {
    const pid = participantId.trim();
    if (!pid) return;

    upsertParticipantId(pid);
    setSessionId(makeSessionId());

    setStarted(true);
    setFinished(false);
    setParagraphIndex(0);
    setSentenceIndex(0);
    setInBreak(false);
  }

  // --- UI states ---
  if (!started) {
    return (
      <div style={{ padding: 24, maxWidth: 900 }}>
        <h2>Reading Experiment</h2>
        <p>Enter your participant ID to start. During the task, press:</p>
        <ul>
          <li><b>1</b> = neutral</li>
          <li><b>2</b> = confusion</li>
        </ul>

        <label>
          Participant ID:&nbsp;
          <input
            value={participantId}
            onChange={(e) => setParticipantId(e.target.value)}
            style={{ padding: 8, width: 260 }}
          />
        </label>
        &nbsp;
        <button onClick={startExperiment} disabled={!participantId.trim()} style={{ padding: "8px 14px" }}>
          Start
        </button>
      </div>
    );
  }

  if (finished) {
    return (
      <div style={{ padding: 24, maxWidth: 900 }}>
        <h2>Experiment finished</h2>
        <p>Thanks! Your labels have been saved. Please tell the researcher you are done.</p>
        <p>(Downloads are available from the Admin page.)</p>
      </div>
    );
  }

  if (inBreak) {
    return (
      <div style={{ padding: 24, maxWidth: 900 }}>
        <h2>Break</h2>
        <p>Next paragraph will start in ~15 seconds…</p>
      </div>
    );
  }

  if (!current || sentences.length === 0 || !currentSentence) {
    return (
      <div style={{ padding: 24, maxWidth: 900 }}>
        <h2>Loading paragraph…</h2>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h3>
        Paragraph {paragraphIndex + 1} / {PARAGRAPHS.length} &nbsp;
      </h3>

      <div style={{ fontSize: 18, lineHeight: 1.8 }}>
        {sentences.map((s, idx) => (
          <span
            key={s.sentenceId}
            style={{
              background: idx === sentenceIndex ? "rgba(255, 235, 59, 0.5)" : "transparent",
              padding: idx === sentenceIndex ? "2px 4px" : 0,
              borderRadius: 4,
              transition: "background 120ms ease",
            }}
          >
            {s.text + " "}
          </span>
        ))}
      </div>

      <div style={{ marginTop: 16, opacity: 0.85 }}>
        <b>Press:</b> 1 = neutral, 2 = confusion
      </div>
    </div>
  );
}
