import React from "react";
import { useSearchParams } from "react-router-dom";

export function Simulation() {
  const [searchParams] = useSearchParams();
  const pid = searchParams.get("participantId") || "";

  return (
    <div style={{ maxWidth: 900, margin: "80px auto", padding: 16, color: "white" }}>
      <h2>Simulation</h2>
      <p>Participant: <b>{pid}</b></p>
      <p style={{ opacity: 0.8 }}>Simulation view coming soon.</p>
    </div>
  );
}
