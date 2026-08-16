import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import AdminPage from "./pages/AdminPage";
import DisplayPage from "./pages/DisplayPage";
import MembersPage from "./pages/MembersPage";
import ResultsPage from "./pages/ResultsPage";
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
        {/* Test mode (60-question battle — 3 rounds, fully isolated from the live quiz) */}
        <Route path="/test" element={<StudentPage mode="test" />} />
        <Route path="/host" element={<AdminPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/test" element={<AdminPage mode="test" />} />
        <Route path="/host/test" element={<AdminPage mode="test" />} />
        {/* Participant/member details pages */}
        <Route path="/admin/members" element={<MembersPage mode="live" />} />
        <Route path="/host/members" element={<MembersPage mode="live" />} />
        <Route path="/admin/test/members" element={<MembersPage mode="test" />} />
        <Route path="/host/test/members" element={<MembersPage mode="test" />} />
        <Route path="/display" element={<DisplayPage />} />
        <Route path="/test/display" element={<DisplayPage mode="test" />} />
        {/* Final results + top-3 PNG certificates */}
        <Route path="/results" element={<ResultsPage />} />
        <Route path="/admin/results" element={<ResultsPage />} />
        <Route path="/test/results" element={<ResultsPage mode="test" />} />
        <Route path="/admin/test/results" element={<ResultsPage mode="test" />} />
        <Route path="*" element={<StudentPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
