// src/pages/Calm.js
import React from "react";
import { Link } from "react-router-dom";
import { useNeurosity } from "../services/neurosity";
import { Nav } from "../components/Nav";

export function Calm() {
  const { user } = useNeurosity();

  return (
    <main 
      className="main-container" 
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px" }}
    >
      
      <h2>EduBCI</h2>

      {user ? <Nav /> : null}

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
        <p style={{ margin: 0 }}>Select a page:</p>

        <div style={{ display: "flex", gap: 12 }}>
          <Link to="/devices"><button>Devices</button></Link>
          <Link to="/experiment"><button>Reading Experiment</button></Link>
        </div>
      </div>

    </main>
  );
}
