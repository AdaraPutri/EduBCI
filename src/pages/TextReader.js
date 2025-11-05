import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export function TextReader() {
  const [text, setText] = useState("");
  const [chunks, setChunks] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [highlights, setHighlights] = useState([]);
  const navigate = useNavigate();

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target.result;
      const words = content.split(/\s+/);
      const chunked = [];
      for (let i = 0; i < words.length; i += 100) {
        chunked.push(words.slice(i, i + 100).join(" "));
      }
      setText(content);
      setChunks(chunked);
      setCurrentIndex(0);
    };
    reader.readAsText(file);
  };

  const handleHighlight = () => {
    const selection = window.getSelection().toString();
    if (!selection) return;
    const highlight = {
      page: currentIndex + 1,
      text: selection,
      time: new Date().toLocaleTimeString(),
    };
    setHighlights([...highlights, highlight]);
    window.getSelection().removeAllRanges();
  };

  return (
    <main className="main-container">
      <h2>Text Reader Demo</h2>
      {!text && (
        <>
          <p>Upload a .txt file to start reading.</p>
          <input type="file" accept=".txt" onChange={handleFileUpload} />
          <button onClick={() => navigate("/")}>Back to Login</button>
        </>
      )}
      {text && (
        <>
          <div
            id="textDisplay"
            style={{
              border: "1px solid gray",
              padding: "15px",
              minHeight: "150px",
              marginBottom: "10px",
              whiteSpace: "pre-wrap",
            }}
          >
            {chunks[currentIndex]}
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={() =>
                setCurrentIndex((prev) => Math.max(0, prev - 1))
              }
            >
              Previous
            </button>
            <button
              onClick={() =>
                setCurrentIndex((prev) =>
                  Math.min(chunks.length - 1, prev + 1)
                )
              }
            >
              Next
            </button>
            <button onClick={() => window.location.reload()}>Upload different file</button>
            <button onClick={() => navigate("/login")}>Back to Login</button>
            <button onClick={handleHighlight}>Highlight</button>
          </div>
          <div style={{ marginTop: "20px" }}>
            <h4>Highlights:</h4>
            <ul>
              {highlights.map((h, i) => (
                <li key={i}>
                  [Page {h.page}] "{h.text}" — {h.time}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </main>
  );
}
