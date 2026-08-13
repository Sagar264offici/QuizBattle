import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import AdminLoginPage from "./pages/AdminLoginPage";
import AdminPage from "./pages/AdminPage";
import DisplayPage from "./pages/DisplayPage";
import JoinPage from "./pages/JoinPage";
import QuizPage from "./pages/QuizPage";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/join" element={<JoinPage />} />
        <Route path="/quiz" element={<QuizPage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/display" element={<DisplayPage />} />
        <Route path="*" element={<JoinPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
