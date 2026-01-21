import React, { useState, useEffect } from "react";
import { paragraphs } from "../data/paragraphs.js";
import { buildParagraphsWithSentences } from "../utils/sentenceUtils.js";

const PARAGRAPHS = buildParagraphsWithSentences(paragraphs);

export function ReadingExperiment() {
  const [participantId, setParticipantId] = useState("");
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);

  const [paragraphIndex, setParagraphIndex] = useState(0);
  const [sentenceIndex, setSentenceIndex] = useState(0);

  const [sentenceStart, setSentenceStart] = useState(null);
  const [events, setEvents] = useState([]);
  const [inBreak, setInBreak] = useState(false);

  const current = PARAGRAPHS[paragraphIndex];
  const currentSentence =
    current && current.sentences ? current.sentences[sentenceIndex] : null;

  // start timer when a new sentence appears
  useEffect(() => {
    if (started && !finished && !inBreak && currentSentence) {
      setSentenceStart(Date.now());
    }
  }, [started, finished, inBreak, currentSentence]);

  // handle key presses for marking events (1,2,3)
  useEffect(() => {
    function onKeyDown(e) {
      if (!started || finished || inBreak || !currentSentence) return;
      if (!["1", "2", "3"].includes(e.key)) return;

      const labelMap = {
        "1": "neutral",
        "2": "low confusion",
        "3": "high confusion",
      };
      const label = labelMap[e.key];
      const now = Date.now();

      const newEvent = {
        participant_id: participantId,
        paragraph_id: current.paragraphId,
        paragraph_type: current.type,
        sentence_id: sentenceIndex + 1,
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
    currentSentence,
    sentenceStart,
    paragraphIndex,
    sentenceIndex,
    participantId,
    current,
  ]);

  function advanceSentence() {
    const isLastSentence = sentenceIndex + 1 >= current.sentences.length;
    const isLastParagraph = paragraphIndex + 1 >= PARAGRAPHS.length;

    if (!isLastSentence) {
      setSentenceIndex((i) => i + 1);
      return;
    }

    // last sentence of last paragraph -> finish
    if (isLastParagraph) {
      setFinished(true);
      setInBreak(false);
      return;
    }

    // move to next paragraph with a break
    setInBreak(true);
    setTimeout(() => {
      setParagraphIndex((p) => p + 1);
      setSentenceIndex(0);
      setInBreak(false);
    }, 15000);
  }

  function startExperiment() {
    if (!participantId.trim()) return;
    setStarted(true);
    setFinished(false);
    setParagraphIndex(0);
    setSentenceIndex(0);
    setSentenceStart(Date.now());
    setEvents([]);
  }

  function downloadCSV() {
    const header = [
      "participant_id",
      "paragraph_id",
      "paragraph_type",
      "sentence_id",
      "t_sentence_start",
      "t_sentence_end",
      "key_label",
      "t_key_press",
    ];

    const rows = events.map((e) =>
      [
        e.participant_id,
        e.paragraph_id,
        e.paragraph_type,
        e.sentence_id,
        e.t_sentence_start,
        e.t_sentence_end,
        e.key_label,
        e.t_key_press,
      ].join(",")
    );

    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `labels_${participantId}.csv`;
    a.click();

    URL.revokeObjectURL(url);
  }

  if (!started) {
    return (
      <div>
        <h2>Reading Experiment</h2>
        <label>
          Participant ID:{" "}
          <input
            value={participantId}
            onChange={(e) => setParticipantId(e.target.value)}
          />
        </label>
        <button onClick={startExperiment} disabled={!participantId}>
          Start
        </button>
      </div>
    );
  }

  if (inBreak) {
    return <div>Break. Next paragraph will start soon...</div>;
  }

  if (finished) {
    return (
      <div>
        <p>Experiment finished.</p>
        <button onClick={downloadCSV}>Download label CSV</button>
      </div>
    );
  }

  if (!currentSentence) {
    return (
      <div>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <h3>
        Paragraph {paragraphIndex + 1} / {PARAGRAPHS.length} ({current.type})
      </h3>

      <p style={{ fontSize: 20, lineHeight: 1.6 }}>
        {currentSentence.text}
      </p>

      <p>Press 1 = neutral, 2 = low confusion, 3 = high confusion</p>

      <button onClick={downloadCSV}>Download label CSV</button>
    </div>
  );
}