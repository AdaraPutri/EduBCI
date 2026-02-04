// src/pages/Admin.js
import React from "react";
import { Link } from "react-router-dom";
import { useNeurosity } from "../services/neurosity";
import { Nav } from "../components/Nav";

export function Admin() {
  const { user, selectedDevice, status } = useNeurosity();
  const deviceState = status?.state ?? (status?.connected ? "connected" : "unknown");

  const outlineBtnStyle = {
    fontSize: 25,
    padding: "12px 14px",
    borderRadius: 12,
    border: "2px solid white",
    background: "transparent",
    color: "white",
    cursor: "pointer",
    fontWeight: 600,
  };

  return (
    <main
      className="main-container"
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}
    >
      <h2>Hello, Admin!</h2>
      {user ? <Nav /> : null}

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", gap: 12 }}>
          <Link to="/admin/devices">
            <button style={outlineBtnStyle}>View Database</button>
          </Link>
          <Link to="/admin/experiment">
            <button style={outlineBtnStyle}>Experiment Setup</button>
          </Link>
        </div>
      </div>
    </main>
  );
}