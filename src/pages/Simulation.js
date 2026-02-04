import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { paragraphs } from "../data/paragraphs.js";
import { buildParagraphsWithSentences } from "../utils/sentenceUtils.js";

const API_BASE = "http://127.0.0.1:8000";

export function Simulation() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const participantId = (searchParams.get("participantId") || "").trim();
  const sessionIdRaw = (searchParams.get("sessionId") || "").trim();
  const sessionId = sessionIdRaw ? Number(sessionIdRaw) : null;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [armed, setArmed] = useState(true);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);

  const [items, setItems] = useState([]);
  const [metrics, setMetrics] = useState(null);

  const [idx, setIdx] = useState(0);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  
  // questionnaire states
  const [q1, setQ1] = useState("");
  const [q2, setQ2] = useState("");
  const [q3, setQ3] = useState("");
  const [q4, setQ4] = useState("");
  const [q5, setQ5] = useState("");

  const [surveySaving, setSurveySaving] = useState(false);
  const [surveySubmitted, setSurveySubmitted] = useState(false);


  // Build the SAME paragraph order logic (so paragraph_id + sentence_id mapping stays consistent)
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
      return Fr[iF++];
    });

    return buildParagraphsWithSentences(ordered);
  }, [participantId]);

  useEffect(() => {
    if (!participantId) {
      setErr("Missing participantId in URL.");
      setLoading(false);
      return;
    }
    if (!sessionId) {
      setErr("Missing sessionId in URL (simulation needs a session to store feedback).");
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);

    fetch(`${API_BASE}/api/simulation/items?participant_id=${encodeURIComponent(participantId)}&n=10`)
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      })
      .then((data) => {
        if (!mounted) return;
        setItems(data.items || []);
        setMetrics({
          confusion_matrix: data.confusion_matrix,
          recall_neutral: data.recall_neutral,
          recall_confusion: data.recall_confusion,
        });
        setErr("");
      })
      .catch((e) => mounted && setErr(`Failed to load simulation items: ${e.message}`))
      .finally(() => mounted && setLoading(false));

    return () => {
      mounted = false;
    };
  }, [participantId, sessionId]);

  const item = items[idx] || null;

  const resolved = useMemo(() => {
    if (!item) return { paragraph: null, targetSentence: null, targetIndex: -1 };

    const paragraph = PARAGRAPHS.find((p) => Number(p.paragraphId) === Number(item.paragraph_id)) || null;
    if (!paragraph?.sentences?.length) return { paragraph, targetSentence: null, targetIndex: -1 };

    const targetIndex = paragraph.sentences.findIndex((s) => Number(s.sentenceId) === Number(item.sentence_id));
    const targetSentence = targetIndex >= 0 ? paragraph.sentences[targetIndex] : null;

    return { paragraph, targetSentence, targetIndex };
  }, [item, PARAGRAPHS]);

  function begin() {
    if (!armed) return;
    setArmed(false);
    setStarted(true);
  }

  async function submitAndNext() {
    if (!item || saving) return;

    setSaving(true);
    try {
      await fetch(`${API_BASE}/api/simulation/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          participant_id: participantId,
          paragraph_id: item.paragraph_id,
          sentence_id: item.sentence_id,
          bucket: item.bucket,
          true_label: item.true_label,
          predicted_label: item.predicted_label,
          feedback_text: text,
          t_feedback_ms: Date.now(),
        }),
      });

      setText("");

      if (idx + 1 >= items.length) {
        setFinished(true);
        return;
      }
      setIdx((i) => i + 1);
    } finally {
      setSaving(false);
    }
  }
  
  async function submitSurvey() {
    if (surveySaving) return;

    const q1n = Number(q1);
    const q2n = Number(q2);
    const q3n = Number(q3);

    if (![1,2,3,4,5].includes(q1n) || ![1,2,3,4,5].includes(q2n) || ![1,2,3,4,5].includes(q3n)) {
      alert("Please answer Q1–Q3 with a rating from 1 to 5.");
      return;
    }

    setSurveySaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/simulation/survey`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          participant_id: participantId,
          q1_helpful_highlight_reading: q1n,
          q2_helpful_questions_lecture: q2n,
          q3_helpful_explanations_lecture: q3n,
          q4_other_software_reading: q4,
          q5_other_software_lecture: q5,
          t_survey_ms: Date.now(),
        }),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `HTTP ${res.status}`);
      }

      setSurveySubmitted(true);
    } catch (e) {
      alert(`Failed to submit survey: ${e.message}`);
    } finally {
      setSurveySaving(false);
    }
  }

  

  if (loading) {
    return (
      <div style={{ maxWidth: 900, margin: "80px auto", padding: 16, color: "white" }}>
        <h2>Simulation</h2>
        <p>Loading…</p>
      </div>
    );
  }

  if (err) {
    return (
      <div style={{ maxWidth: 900, margin: "80px auto", padding: 16, color: "white" }}>
        <h2>Simulation</h2>
        <p style={{ color: "crimson" }}>{err}</p>
        <button onClick={() => navigate("/admin")} style={outlineBtn}>Back to Admin</button>
      </div>
    );
  }

  if (!started && armed) {
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
          color: "white",
        }}
      >
        <div>
          <h3>Simulation</h3>
          <p style={{ fontSize: 22, lineHeight: 1.6, opacity: 0.95 }}>
            Imagine you are studying for an exam by reading a textbook. In this simulation, the system automatically
            highlights one sentence at a time based on EEG signals. After each highlighted sentence, type any thoughts
            you have (e.g., whether it feels helpful, annoying, trustworthy, or distracting), then press Next.
          </p>
        </div>

        <div style={{ alignSelf: "flex-end" }}>
          <button
            onClick={begin}
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
  
  if (finished) {
    if (surveySubmitted) {
      return (
        <div style={{ maxWidth: 900, margin: "80px auto", padding: 16, color: "white" }}>
          <h2>Thank you!</h2>
          <p>Simulation complete.</p>
          <button onClick={() => navigate("/admin")} style={outlineBtn}>Back to Admin</button>
        </div>
      );
    }

    const selectStyle = {
      width: "100%",
      boxSizing: "border-box",
      background: "transparent",
      color: "white",
      border: "1px solid rgba(255,255,255,0.35)",
      borderRadius: 10,
      padding: "10px 12px",
      outline: "none",
      fontSize: 20,
    };

    const labelStyle = { fontSize: 20, opacity: 0.9, marginBottom: 8, lineHeight: 1.4 };

    const textareaStyle = {
      width: "100%",
      boxSizing: "border-box",
      background: "transparent",
      color: "white",
      border: "1px solid rgba(255,255,255,0.35)",
      borderRadius: 10,
      padding: 10,
      outline: "none",
      resize: "vertical",
      fontSize: 20,
    };

    const card = {
      border: "1px solid rgba(255,255,255,0.2)",
      background: "rgba(0,0,0,0.35)",
      borderRadius: 12,
      padding: 14,
      marginTop: 12,
    };

    return (
      <div style={{ maxWidth: 900, margin: "80px auto", padding: 16, color: "white" }}>
        <h2>Thank you!</h2>
        <p style={{ opacity: 0.9 }}>
          Before you go, please answer these final questions.
        </p>

        <div style={card}>
          <div style={labelStyle}>
            <b>Q1:</b> On a scale from 1 (Not at all helpful) to 5 (Extremely helpful): <br />
            How helpful would it be to have software automatically highlight sentences that you find confusing while you are reading on the computer?
          </div>
          <select value={q1} onChange={(e) => setQ1(e.target.value)} style={selectStyle}>
            <option value="">Select 1–5</option>
            <option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option>
          </select>
        </div>

        <div style={card}>
          <div style={labelStyle}>
            <b>Q2:</b> On a scale from 1 (Not at all helpful) to 5 (Extremely helpful): <br />
            How helpful would it be to have software suggest clarifying questions to you during a class 
            <br />
            (i.e., in-person lecture) when it detects that you have encountered confusing material?
          </div>
          <select value={q2} onChange={(e) => setQ2(e.target.value)} style={selectStyle}>
            <option value="">Select 1–5</option>
            <option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option>
          </select>
        </div>

        <div style={card}>
          <div style={labelStyle}>
            <b>Q3:</b> On a scale from 1 (Not at all helpful) to 5 (Extremely helpful): <br />
            How helpful would it be to have software that provides additional explanations when it detects that you find material confusing during a class (i.e., in-person lecture)?
          </div>
          <select value={q3} onChange={(e) => setQ3(e.target.value)} style={selectStyle}>
            <option value="">Select 1–5</option>
            <option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option>
          </select>
        </div>

        <div style={card}>
          <div style={labelStyle}>
            <b>Q4:</b> In the context of helping you resolve confusion while reading online, are there other kinds of software that you can think of that would be useful for your studying or learning purposes?
          </div>
          <textarea
            value={q4}
            onChange={(e) => setQ4(e.target.value)}
            rows={5}
            placeholder="Type your answer…"
            style={textareaStyle}
          />
        </div>

        <div style={card}>
          <div style={labelStyle}>
            <b>Q5:</b> In the context of helping you resolve confusion while attending an in-person lecture, are there other kinds of software that you can think of that would be useful for your studying or learning purposes?
          </div>
          <textarea
            value={q5}
            onChange={(e) => setQ5(e.target.value)}
            rows={5}
            placeholder="Type your answer…"
            style={textareaStyle}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button
            onClick={submitSurvey}
            disabled={surveySaving}
            style={{
              fontSize: 18,
              padding: "10px 12px",
              borderRadius: 12,
              border: "none",
              cursor: "pointer",
              background: "#1565c0",
              color: "white",
              fontWeight: 600,
            }}
          >
            {surveySaving ? "Submitting..." : "Submit"}
          </button>
        </div>
      </div>
    );
  }


  if (!item) {
    return (
      <div style={{ maxWidth: 900, margin: "80px auto", padding: 16, color: "white" }}>
        <h2>Simulation</h2>
        <p>No simulation items were returned.</p>
        <button onClick={() => navigate("/admin")} style={outlineBtn}>Back to Admin</button>
      </div>
    );
  }

  const { paragraph, targetSentence, targetIndex } = resolved;

  const predIsConfusion = (item.predicted_label || "").toLowerCase() === "confusion";
  const highlightBg = predIsConfusion ? "rgba(198, 40, 40, 0.45)" : "rgba(46, 125, 50, 0.45)";

  const sideNote =
    item.bucket === "FP"
      ? "Note: This sentence is not actually confusing for you, but the system labels it as confusing."
      : item.bucket === "FN"
      ? "Note: This sentence is actually confusing for you, but the system detects it as neutral."
      : "";

  return (
    <div style={{ maxWidth: 900, margin: "80px auto", padding: 16, color: "white" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14, opacity: 0.85 }}>
        <div>
          Item {idx + 1} / {items.length} (Red = confusion, Green = neutral)
        </div>
      </div>

      <div style={{ display: "flex", gap: 18, alignItems: "stretch" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 25, lineHeight: 1.8 }}>
            {!paragraph || !targetSentence || targetIndex < 0 ? (
              <span style={{ color: "crimson" }}>
                Could not resolve paragraph/sentence for paragraph_id={item.paragraph_id}, sentence_id={item.sentence_id}.
              </span>
            ) : (
              paragraph.sentences.slice(0, targetIndex + 1).map((s) => {
                const isTarget = Number(s.sentenceId) === Number(item.sentence_id);
                return (
                  <span
                    key={s.sentenceId}
                    style={{
                      background: isTarget ? highlightBg : "transparent",
                      padding: isTarget ? "2px 4px" : 0,
                      borderRadius: isTarget ? 6 : 0,
                      marginRight: 6,
                    }}
                  >
                    {s.text}
                  </span>
                );
              })
            )}
          </div>
        </div>

        <div style={{ width: 260, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 12, paddingBottom: 4}}>
          {sideNote && (
            <div
              style={{
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(0,0,0,0.35)",
                borderRadius: 12,
                padding: 12,
                fontSize: 14,
                opacity: 0.95,
              }}
            >
              {sideNote}
            </div>
          )}

          <div
            style={{
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(0,0,0,0.35)",
              borderRadius: 12,
              padding: 12,
            }}
          >
            <div style={{ fontSize: 14, opacity: 0.85, marginBottom: 8 }}>Your feedback</div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type your thoughts here…"
              rows={6}
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: "transparent",
                color: "white",
                border: "1px solid rgba(255,255,255,0.35)",
                borderRadius: 10,
                padding: 10,
                outline: "none",
                resize: "vertical",
                fontSize: 14,
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
              <button
                onClick={submitAndNext}
                disabled={saving}
                style={{
                  fontSize: 18,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "none",
                  cursor: "pointer",
                  background: "#1565c0",
                  color: "white",
                  fontWeight: 600,
                }}
              >
                {saving ? "Saving..." : idx + 1 === items.length ? "Finish" : "Next"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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