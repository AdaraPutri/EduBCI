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
  const [q6, setQ6] = useState("");
  const [q7, setQ7] = useState("");

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
          f1_neutral: data.f1_neutral,
          f1_confusion: data.f1_confusion,
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

    if (!allSurveyAnswered) {
      alert("Please answer all questions (Q1–Q7) before submitting.");
      return;
    }

    const q1n = Number(q1);
    const q2n = Number(q2);
    const q3n = Number(q3);
    const q4n = Number(q4);
    const q5n = Number(q5);

    if (![1,2,3,4,5].includes(q1n) || ![1,2,3,4,5].includes(q2n)) {
      alert("Please answer Q1–Q2 with a rating from 1 to 5.");
      return;
    }

    if (![1,2,3,4].includes(q3n) || ![1,2,3,4].includes(q4n) || ![1,2,3,4].includes(q5n)) {
      alert("Please answer Q3–Q5 with a rating from 1 to 4.");
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
          q1_accuracy_confusing_pct: q1n,
          q2_accuracy_neutral_pct: q2n,
          q3_helpful_highlight_reading: q3n,
          q4_helpful_questions_lecture: q4n,
          q5_helpful_explanations_lecture: q5n,
          q6_other_software_reading: q6,
          q7_accuracy_neutral_pct: q7,
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
          margin: "20px auto",
          padding: 8,
          display: "flex",
          flexDirection: "column",
          minHeight: "60vh",
          justifyContent: "space-between",
          color: "white",
        }}
      >
      <div>
        <h3>Phase 2</h3>

        <p style={{ fontSize: 22, lineHeight: 1.6, opacity: 0.95 }}>
          Imagine you are studying for an exam by reading an online textbook that your headset is connected to. For each paragraph, one sentence is highlighted to show that is the sentence you are reading.
          If the sentence is highlighted in yellow like the example shown below, that means your EEG signals indicated the sentence is confusing for you. 
          <br />

          <div style={{ marginTop: 14, fontSize: 20, lineHeight: 1.6, opacity: 0.95 }}>
                    <div style={{ marginBottom: 8 }}>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <div>
                        <blockquote><span>Sentences the system detects as</span>
                        <b>confusing</b>
                        <span> look like this: </span>
                        <span
                          style={{
                            background: "rgba(255, 235, 59, 0.5)",
                            padding: "2px 6px",
                            borderRadius: 6,
                          }}
                        >
                          This is a confusing sentence.
                        </span></blockquote>
                      </div>
                    </div>
                  </div>

          <p style={{ fontSize: 22, lineHeight: 1.6, opacity: 0.95 }}>
            On the other hand, if the sentence is framed in a box like the example shown below, that means your EEG signals indicated the sentence is not confusing for you. 
            </p>

          <div style={{ marginTop: 14, fontSize: 20, lineHeight: 1.6, opacity: 0.95 }}>
                    <div style={{ marginBottom: 8 }}>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div>
                        <blockquote><span>Sentences the system detects as </span>
                        <b>neutral</b>
                        <span> look like this: </span>
                        <span
                          style={{
                            background: "transparent",
                            border: "2px solid rgba(255,255,255,0.9)",
                            padding: "2px 6px",
                            borderRadius: 6,
                          }}
                        >
                          This is a neutral sentence.
                        </span></blockquote>
                      </div>
                    </div>
                  </div>
          <br/>
          If you find you are confused, you can write down your questions in the "Notes" box on the right, regardless of whether the sentence was highlighted or boxed. 
          For example, when you read something confusing, you might want to ask "What does this mean?" or put a reminder for yourself to ask someone for help later. 
          Your notes will help us understand your experience with this online textbook.

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
    const allSurveyAnswered =
      q1 !== "" &&
      q2 !== "" &&
      q3 !== "" &&
      q4 !== "" &&
      q5 !== "" &&
      q6.trim().length > 0 &&
      q7.trim().length > 0;

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
          Before you go, please answer these final questions based on your experience from Phase 2. 
          You might have noticed that the system was not always perfect in detecting whether sentences were confusing or not.
          Please take this into consideration when answering the questions below.
        </p>

        <div style={card}>
          <div style={labelStyle}>
            <b>Q1:</b>
            <br />
            In Phase 2, the system highlighted the sentence yellow if it detected that it was <b>confusing</b> for you. How often did you feel this was correct?
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {[
              { v: "1", label: "1. Almost always" },
              { v: "2", label: "2. About 75% of the time" },
              { v: "3", label: "3. About half of the time" },
              { v: "4", label: "4. About 25% of the time" },
              { v: "5", label: "5. Almost never" },
            ].map((opt) => (
              <label key={opt.v} style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer", fontSize: 18 }}>
                <input
                  type="radio"
                  name="q1"
                  value={opt.v}
                  checked={q1 === opt.v}
                  onChange={(e) => setQ1(e.target.value)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div style={card}>
          <div style={labelStyle}>
            <b>Q2:</b>
            <br />
            In Phase 2, the system framed the sentence in a box if it detected that it was <b>not confusing</b> for you. How often did you feel this was correct?
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {[
              { v: "1", label: "1. Almost always" },
              { v: "2", label: "2. About 75% of the time" },
              { v: "3", label: "3. About half of the time" },
              { v: "4", label: "4. About 25% of the time" },
              { v: "5", label: "5. Almost never" },
            ].map((opt) => (
              <label key={opt.v} style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer", fontSize: 18 }}>
                <input
                  type="radio"
                  name="q2"
                  value={opt.v}
                  checked={q2 === opt.v}
                  onChange={(e) => setQ2(e.target.value)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div style={card}>
          <div style={labelStyle}>
            <b>Q3:</b>
            <br/> If you were studying online, how helpful would it be to have the system automatically highlight sentences that you find confusing? 
            (Sentences that are not confusing would not be highlighted in any way.)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {[
              { v: "1", label: "1. Not at all helpful" },
              { v: "2", label: "2. Slightly helpful" },
              { v: "3", label: "3. Moderately helpful" },
              { v: "4", label: "4. Very helpful" },
            ].map((opt) => (
              <label key={opt.v} style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer", fontSize: 18 }}>
                <input
                  type="radio"
                  name="q3"
                  value={opt.v}
                  checked={q3 === opt.v}
                  onChange={(e) => setQ3(e.target.value)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div style={card}>
          <div style={labelStyle}>
            <b>Q4:</b>
            <br/> Alternatively, how helpful would you find having an online textbook that suggests clarifying questions to you when reading? 
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {[
              { v: "1", label: "1. Not at all helpful" },
              { v: "2", label: "2. Slightly helpful" },
              { v: "3", label: "3. Moderately helpful" },
              { v: "4", label: "4. Very helpful" },
            ].map((opt) => (
              <label key={opt.v} style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer", fontSize: 18 }}>
                <input
                  type="radio"
                  name="q4"
                  value={opt.v}
                  checked={q4 === opt.v}
                  onChange={(e) => setQ4(e.target.value)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div style={card}>
          <div style={labelStyle}>
            <b>Q5:</b>
            <br/>
            If the online textbook can provide additional explanations the moment it detects you are confused with the sentence, how helpful would this be?
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {[
              { v: "1", label: "1. Not at all helpful" },
              { v: "2", label: "2. Slightly helpful" },
              { v: "3", label: "3. Moderately helpful" },
              { v: "4", label: "4. Very helpful" },
            ].map((opt) => (
              <label key={opt.v} style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer", fontSize: 18 }}>
                <input
                  type="radio"
                  name="q5"
                  value={opt.v}
                  checked={q5 === opt.v}
                  onChange={(e) => setQ5(e.target.value)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div style={card}>
          <div style={labelStyle}>
            <b>Q6:</b> In the context of helping you resolve confusion while reading online, are there other kinds of features that would be useful for your studying or learning purposes?
          </div>
          <textarea
            value={q6}
            onChange={(e) => setQ6(e.target.value)}
            rows={5}
            placeholder="Type your answer…"
            style={textareaStyle}
          />
        </div>

        <div style={card}>
          <div style={labelStyle}>
            <b>Q7:</b> In the context of helping you resolve confusion while attending an in-person lecture, are there ways for smart software that detects when you are confused be useful for your studying or learning purposes?
          </div>
          <textarea
            value={q7}
            onChange={(e) => setQ7(e.target.value)}
            rows={5}
            placeholder="Type your answer…"
            style={textareaStyle}
          />
        </div>


        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button
            onClick={submitSurvey}
            disabled={surveySaving || !allSurveyAnswered}
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
  const highlightBg = predIsConfusion ? "rgba(255, 235, 59, 0.5)" : "transparent";
  const highlightBorder = predIsConfusion ? "none" : "2px solid rgba(255,255,255,0.9)";

  return (
    <div style={{ maxWidth: 900, margin: "80px auto", padding: 16, color: "white" }}>
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
                      border: isTarget ? highlightBorder : "none",
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
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(0,0,0,0.35)",
              borderRadius: 12,
              padding: 12,
            }}
          >
            <div style={{ fontSize: 18, opacity: 0.85, marginBottom: 8 }}>Notes</div>
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