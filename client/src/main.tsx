import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import AdminPage from "./pages/AdminPage";
import DisplayPage from "./pages/DisplayPage";
import StudentPage from "./pages/StudentPage";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<StudentPage />} />
        <Route path="/student" element={<StudentPage />} />
        <Route path="/join" element={<StudentPage />} />
        <Route path="/quiz" element={<StudentPage />} />
        <Route path="/host" element={<AdminPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/display" element={<DisplayPage />} />
        <Route path="*" element={<StudentPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
