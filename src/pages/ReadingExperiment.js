import React, { useState, useEffect} from "react";
import {PARAGRAPHS} from "../data/paragraphs";  

export function ReadingExperiment() {
    // setting up variables to collect
    const [participantId, setParticipantId] = useState("");
    const [started, setStarted] = useState(false);
    const [blockIndex, setBlockIndex] = useState(0);
    const [paragraphIndex, setParagraphIndex] = useState(0);
    const [sentenceIndex, setSentenceIndex] = useState(0);
    const [sentenceStart, setSentenceStart] = useState(null); // time
    const [events, setEvents] = useState([]); // collected labels by participants
    const [inBreak, setInBreak] = useState(false);

    const current = PARAGRAPHS[paragraphIndex];

    // only try to access the sentence if everything exists (otherwise would fail if current is undefined)
    const currentSentence = current && current.sentences ? current.sentences[sentenceIndex] : null;

    // start timer when a new sentence appears
    useEffect(() => {
        if (started && !inBreak && currentSentence){
            // run only when experiment is started and not in break, and there is a current sentence
            setSentenceStart(Date.now());
        }
    }, [started, inBreak, currentSentence]);

    // handle key presses for marking events (1, 2, 3)
    useEffect(() => {
        function onKeyDown(e) {
            if (!started || inBreak || !currentSentence) return; // ignore if not started, in break, or no current sentence
            if (!["1", "2", "3"].includes(e.key)) return; // ignore other keys

            const labelMap = {"1": "neutral", "2": "low confusion", "3": "high confusion"};
            const label = labelMap[e.key]; // map key to label
            const now = Date.now();
            
            const newEvent = {
                participant_id: participantId,
                block_id: blockIndex + 1,
                paragraph_id: current.paragraphId,
                paragraph_type: current.type,
                sentence_id: sentenceIndex + 1,
                t_sentence_start: sentenceStart,
                t_sentence_end: now,
                key_label: label,
                t_key_press: now
            };
            
            // append new event to events array
            setEvents((prev) => [...prev, newEvent]);
            advanceSentence();
        }

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [started, inBreak, currentSentence, sentenceStart, blockIndex, paragraphIndex, sentenceIndex, participantId]);

    function advanceSentence() {
        const isLastSentence = sentenceIndex + 1 >= current.sentences.length;
        const isLastParagraph = paragraphIndex + 1 >= PARAGRAPHS.length;

        if (!isLastSentence) {
        setSentenceIndex((i) => i + 1);
        return;
        }

        if (isLastParagraph) {
        setSentenceIndex(0);
        setInBreak(false);
        return;
        }

        // move to next paragraph with a break
        setInBreak(true);
        setTimeout(() => {
        setParagraphIndex((p) => p + 1);
        setSentenceIndex(0);
        setInBreak(false);
        }, 15000); // 15 second break
    }

    function startExperiment() {
        if (!participantId.trim()) return;
        setStarted(true);
        setSentenceStart(Date.now());
    }

    function downloadCSV() {
        const header = [
        "participant_id",
        "block_id",
        "paragraph_id",
        "paragraph_type",
        "sentence_id",
        "t_sentence_start",
        "t_sentence_end",
        "key_label",
        "t_key_press"
        ];
        const rows = events.map((e) =>
        [
            e.participant_id,
            e.block_id,
            e.paragraph_id,
            e.paragraph_type,
            e.sentence_id,
            e.t_sentence_start,
            e.t_sentence_end,
            e.key_label,
            e.t_key_press
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

    if (!currentSentence) {
        return (
        <div>
            <p>Experiment finished.</p>
            <button onClick={downloadCSV}>Download label CSV</button>
        </div>
        );
    }

    return (
        <div>
        <h3>Block {blockIndex + 1}</h3>
        <p>{currentSentence}</p>
        <p>Press 1 = neutral, 2 = low confusion, 3 = high confusion</p>
        <button onClick={downloadCSV}>Download label CSV</button>
        </div>
    );
    }
