// src/App.js
import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";

import { ProvideNeurosity, useNeurosity, neurosity } from "./services/neurosity";
import { Devices } from "./pages/Devices";
import { Loading } from "./components/Loading";
import { Login } from "./pages/Login";
import { Logout } from "./pages/Logout";
import { ReadingExperiment } from "./pages/ReadingExperiment";
import { Admin } from "./pages/Admin";
import { Database } from "./pages/Database";
import { Simulation } from "./pages/Simulation";

function RequireAuth({ children }) {
  const { user, loadingUser } = useNeurosity();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loadingUser && !user) navigate("/login");
  }, [user, loadingUser, navigate]);

  if (loadingUser) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export function App() {
  useEffect(() => {
    return () => {
      neurosity.disconnect();
    };
  }, []);

  return (
    <ProvideNeurosity>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/admin" replace />} />
          <Route path="/admin" element={<RequireAuth><Admin /></RequireAuth>} />
          <Route path="/participant" element={<RequireAuth><ReadingExperiment /></RequireAuth>} />
          <Route path="/admin/simulation" element={<RequireAuth><Simulation /></RequireAuth>} />
          <Route path="/login" element={<Login />} />
          <Route path="/logout" element={<Logout />} />
          <Route path="/admin/database" element={<RequireAuth><Database /></RequireAuth>} />
        </Routes>
      </BrowserRouter>
    </ProvideNeurosity>
  );
}
