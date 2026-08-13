import React, { useEffect, useState, useMemo } from "react";
import { fetchJson } from "../services/api";
import { socket } from "../socket";

interface Question {
  id: number;
  questionNumber: number;
  roundId: number;
  roundName: string;
  points: number;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: string;
}

interface Submission {
  id: number;
  participantId: number;
  participantName: string;
  club: "STACK_PUSH" | "IT_INNOVATORS";
  questionId: number;
  questionNumber: number;
  answer: string;
  isCorrect: boolean;
  pointsAwarded: number;
  responseTimeMs: number;
  submittedAt: string;
}

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return sessionStorage.getItem("quizbattle-admin-auth") === "true";
  });
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Dashboard Data
  const [summary, setSummary] = useState<any>({});
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedQuestionNumber, setSelectedQuestionNumber] = useState<number>(1);
  const [roundFilter, setRoundFilter] = useState<string>("all");
  const [actionLoading, setActionLoading] = useState(false);
  const [notification, setNotification] = useState<string>("");

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(""), 4000);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    try {
      await fetchJson("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      sessionStorage.setItem("quizbattle-admin-auth", "true");
      setIsAuthenticated(true);
    } catch (err: any) {
      setAuthError(err.message || "Invalid admin password");
    } finally {
      setAuthLoading(false);
    }
  };

  const refreshData = async () => {
    if (!isAuthenticated) return;
    try {
      const [sumData, qData] = await Promise.all([
        fetchJson<any>("/api/admin/summary"),
        fetchJson<Question[]>("/api/admin/questions"),
      ]);
      setSummary(sumData);
      setQuestions(qData);
    } catch (err) {
      console.error("Admin refresh error:", err);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      refreshData();
      const interval = setInterval(refreshData, 1500);

      socket.on("participant:joined", refreshData);
      socket.on("participant:submitted", refreshData);
      socket.on("quiz:state", refreshData);

      return () => {
        clearInterval(interval);
        socket.off("participant:joined");
        socket.off("participant:submitted");
        socket.off("quiz:state");
      };
    }
  }, [isAuthenticated]);

  const runHostAction = async (endpoint: string, payload?: any, successMsg?: string) => {
    setActionLoading(true);
    try {
      await fetchJson(endpoint, {
        method: "POST",
        body: JSON.stringify(payload || {}),
      });
      await refreshData();
      if (successMsg) showNotification(successMsg);
    } catch (err: any) {
      alert(err.message || "Action failed");
    } finally {
      setActionLoading(false);
    }
  };

  const copyStudentLink = () => {
    const url = `${window.location.origin}/student`;
    navigator.clipboard.writeText(url);
    showNotification("📋 Student link copied to clipboard!");
  };

  // Selected Question object
  const activeQuestion = useMemo(() => {
    const currentQId = summary.currentQuestionId ?? 1;
    return questions.find((q) => q.questionNumber === currentQId) || questions[0];
  }, [summary.currentQuestionId, questions]);

  const previewQuestion = useMemo(() => {
    return questions.find((q) => q.questionNumber === selectedQuestionNumber) || activeQuestion;
  }, [questions, selectedQuestionNumber, activeQuestion]);

  // --- 1. RENDER ADMIN LOGIN ---
  if (!isAuthenticated) {
    return (
      <div className="app-shell">
        <div className="container-sm" style={{ marginTop: "60px" }}>
          <div className="glass-card">
            <div style={{ textAlign: "center", marginBottom: "24px" }}>
              <span className="brand-badge">HOST CONTROL</span>
              <h1 className="brand-title" style={{ fontSize: "1.8rem", marginTop: "8px" }}>
                Admin & Teacher Login
              </h1>
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: "4px" }}>
                Access live quiz controls and scoring
              </p>
            </div>

            <form onSubmit={handleLogin}>
              <div className="form-group">
                <label className="form-label">Host Password</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Enter the password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
              </div>

              {authError && (
                <div style={{ color: "#fca5a5", fontSize: "0.875rem", fontWeight: 700, marginBottom: "16px", textAlign: "center" }}>
                  ⚠️ {authError}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary btn-block btn-lg"
                disabled={authLoading || !password}
              >
                {authLoading ? "Logging in..." : "ACCESS HOST DASHBOARD →"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // --- 2. RENDER ADMIN DASHBOARD ---
  const currentStatus = summary.session?.status || "WAITING";
  const submissions: Submission[] = summary.currentSubmissions || [];

  return (
    <div className="app-shell">
      <div className="container">
        {/* Notification Toast */}
        {notification && (
          <div
            style={{
              position: "fixed",
              top: "20px",
              right: "20px",
              background: "#10b981",
              color: "#030712",
              padding: "12px 20px",
              borderRadius: "10px",
              fontWeight: 800,
              boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
              zIndex: 200,
              animation: "fadeIn 0.2s ease-out",
            }}
          >
            {notification}
          </div>
        )}

        {/* Top Header */}
        <div className="admin-header-bar">
          <div className="quiz-brand" style={{ margin: 0 }}>
            <span className="brand-badge" style={{ background: "#2563eb" }}>HOST HUB</span>
            <span className="brand-title">QuizBattle Command Center</span>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button className="btn btn-secondary btn-sm" onClick={copyStudentLink}>
              📋 Copy Student Link
            </button>
            <a
              href="/display"
              target="_blank"
              rel="noreferrer"
              className="btn btn-primary btn-sm"
            >
              📺 Open Projector Screen ↗
            </a>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                sessionStorage.removeItem("quizbattle-admin-auth");
                setIsAuthenticated(false);
              }}
            >
              Log Out
            </button>
          </div>
        </div>

        {/* Live Metrics Row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px", marginBottom: "20px" }}>
          <div className="score-card">
            <div className="score-card-title" style={{ color: "var(--text-muted)" }}>Current Status</div>
            <div style={{ marginTop: "6px" }}>
              {currentStatus === "LIVE" && <span className="badge badge-live"><span className="pulse-dot" /> LIVE</span>}
              {currentStatus === "COUNTDOWN" && <span className="badge badge-countdown"><span className="pulse-dot" /> 3s TIMER</span>}
              {currentStatus === "WAITING" && <span className="badge badge-waiting">WAITING</span>}
              {currentStatus === "LOCKED" && <span className="badge badge-locked">LOCKED</span>}
              {currentStatus === "REVEALED" && <span className="badge badge-revealed">REVEALED</span>}
              {currentStatus === "FINISHED" && <span className="badge badge-finished">FINISHED</span>}
            </div>
          </div>

          <div className="score-card">
            <div className="score-card-title" style={{ color: "var(--text-muted)" }}>Students Registered</div>
            <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#f8fafc", fontFamily: "var(--font-mono)", marginTop: "2px" }}>
              {summary.participantsCount ?? 0}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "2px" }}>
              🔵 {summary.stackCount ?? 0} Stack | 🟢 {summary.innovatorsCount ?? 0} Innovators
            </div>
          </div>

          <div className="score-card">
            <div className="score-card-title" style={{ color: "var(--text-muted)" }}>Answers Received</div>
            <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#38bdf8", fontFamily: "var(--font-mono)", marginTop: "2px" }}>
              {summary.answersReceived ?? 0} / {summary.participantsCount ?? 0}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "2px" }}>
              {summary.answersPending ?? 0} pending response
            </div>
          </div>

          <div className="score-card stack">
            <div className="score-card-title">⚡ Stack.push</div>
            <div className="score-card-points" style={{ fontSize: "1.8rem", marginTop: "2px" }}>
              {summary.clubs?.find((c: any) => c.name === "STACK_PUSH")?.score ?? 0}
            </div>
          </div>

          <div className="score-card innovators">
            <div className="score-card-title">🚀 IT Innovators</div>
            <div className="score-card-points" style={{ fontSize: "1.8rem", marginTop: "2px" }}>
              {summary.clubs?.find((c: any) => c.name === "IT_INNOVATORS")?.score ?? 0}
            </div>
          </div>
        </div>

        {/* Main Grid: Left Controls, Right Question Selector & Submissions */}
        <div className="admin-layout-grid">
          {/* LEFT: Active Question & Host Action Controls */}
          <div>
            {/* Action Bar Card */}
            <div className="admin-actions-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "#38bdf8", textTransform: "uppercase" }}>
                    {activeQuestion?.roundName || "Round 1"}
                  </span>
                  <h2 style={{ fontSize: "1.4rem", fontWeight: 800, marginTop: "2px" }}>
                    Active Question #{activeQuestion?.questionNumber || 1} (+{activeQuestion?.points || 1} pts)
                  </h2>
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => runHostAction("/api/admin/prev-question", {}, "Moved to previous question")}
                    disabled={actionLoading || (activeQuestion?.questionNumber || 1) <= 1}
                  >
                    ◀ Prev
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => runHostAction("/api/admin/next-question", {}, "Moved to next question")}
                    disabled={actionLoading}
                  >
                    Next ▶
                  </button>
                </div>
              </div>

              {/* Active Question Preview text */}
              {activeQuestion && (
                <div style={{ background: "rgba(15, 23, 42, 0.7)", borderRadius: "10px", padding: "14px", marginTop: "14px", border: "1px solid var(--border-subtle)" }}>
                  <div style={{ fontSize: "1.05rem", fontWeight: 700 }}>{activeQuestion.questionText}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "10px", fontSize: "0.85rem" }}>
                    <div style={{ color: activeQuestion.correctAnswer === "A" ? "#4ade80" : "#cbd5e1", fontWeight: activeQuestion.correctAnswer === "A" ? 800 : 500 }}>
                      <strong>A)</strong> {activeQuestion.optionA} {activeQuestion.correctAnswer === "A" && "✓ (Correct)"}
                    </div>
                    <div style={{ color: activeQuestion.correctAnswer === "B" ? "#4ade80" : "#cbd5e1", fontWeight: activeQuestion.correctAnswer === "B" ? 800 : 500 }}>
                      <strong>B)</strong> {activeQuestion.optionB} {activeQuestion.correctAnswer === "B" && "✓ (Correct)"}
                    </div>
                    <div style={{ color: activeQuestion.correctAnswer === "C" ? "#4ade80" : "#cbd5e1", fontWeight: activeQuestion.correctAnswer === "C" ? 800 : 500 }}>
                      <strong>C)</strong> {activeQuestion.optionC} {activeQuestion.correctAnswer === "C" && "✓ (Correct)"}
                    </div>
                    <div style={{ color: activeQuestion.correctAnswer === "D" ? "#4ade80" : "#cbd5e1", fontWeight: activeQuestion.correctAnswer === "D" ? 800 : 500 }}>
                      <strong>D)</strong> {activeQuestion.optionD} {activeQuestion.correctAnswer === "D" && "✓ (Correct)"}
                    </div>
                  </div>
                </div>
              )}

              {/* Big Action Buttons */}
              <div className="action-buttons-row">
                <button
                  className="btn btn-success btn-lg"
                  style={{ flex: "1 1 200px" }}
                  onClick={() => runHostAction("/api/admin/start-countdown", { questionId: activeQuestion?.id }, "⏱️ 3-Second Countdown Started!")}
                  disabled={actionLoading || currentStatus === "LIVE" || currentStatus === "COUNTDOWN"}
                >
                  ⏱️ START (3s Timer)
                </button>

                <button
                  className="btn btn-warning"
                  style={{ flex: "1 1 140px" }}
                  onClick={() => runHostAction("/api/admin/lock-answers", {}, "🔒 Answers Locked")}
                  disabled={actionLoading || currentStatus !== "LIVE"}
                >
                  🔒 LOCK ANSWERS
                </button>

                <button
                  className="btn btn-primary"
                  style={{ flex: "1 1 150px" }}
                  onClick={() => runHostAction("/api/admin/reveal-answer", {}, "👁️ Answer Revealed to all!")}
                  disabled={actionLoading || (currentStatus !== "LOCKED" && currentStatus !== "LIVE")}
                >
                  👁️ REVEAL ANSWER
                </button>

                <button
                  className="btn btn-secondary"
                  style={{ flex: "1 1 140px" }}
                  onClick={() => runHostAction("/api/admin/next-question", {}, "➡️ Advanced to Next Question")}
                  disabled={actionLoading}
                >
                  ➡️ NEXT QUESTION
                </button>
              </div>

              {/* TEST & CLEAR CENTER FOR TEACHER TESTING */}
              <div className="danger-zone-box">
                <div className="danger-zone-title">
                  <span>⚡ Teacher Testing & Clear Center</span>
                </div>
                <p style={{ fontSize: "0.8rem", color: "#cbd5e1", marginBottom: "12px" }}>
                  Reset scores anytime before or after demonstrating to your teacher.
                </p>

                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    className="btn btn-warning btn-sm"
                    onClick={() => {
                      if (confirm("Reset all responses and set scores to 0? (Students remain joined)")) {
                        runHostAction("/api/admin/reset-scores", {}, "🔄 Scores & responses reset! Ready for re-test.");
                      }
                    }}
                    disabled={actionLoading}
                    title="Clears all answers so teacher/students can test again immediately"
                  >
                    🔄 Clear Responses & Scores (Keep Students)
                  </button>

                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      runHostAction("/api/admin/reset-current-question", {}, "Reset active question submissions.");
                    }}
                    disabled={actionLoading}
                  >
                    Reset Current Question
                  </button>

                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => {
                      if (confirm("Are you sure you want a COMPLETE FRESH WIPE? All participants, scores, and submissions will be cleared.")) {
                        runHostAction("/api/admin/reset-all-fresh", {}, "✨ Everything cleared fresh back to Question 1.");
                      }
                    }}
                    disabled={actionLoading}
                  >
                    ⚠️ Complete Fresh Wipe (All Data)
                  </button>
                </div>
              </div>
            </div>

            {/* Live Submissions Feed for Current Question */}
            <div className="glass-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 800 }}>
                  Live Responses Feed (Q{activeQuestion?.questionNumber})
                </h3>
                <span className="badge badge-waiting">{submissions.length} Answers</span>
              </div>

              {submissions.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px", color: "var(--text-muted)", fontSize: "0.9rem" }}>
                  No answers submitted yet for this question. When students click an option, their response will appear here in real-time.
                </div>
              ) : (
                <div className="submissions-table-container">
                  <table className="submissions-table">
                    <thead>
                      <tr>
                        <th>Participant</th>
                        <th>Club</th>
                        <th>Option</th>
                        <th>Speed</th>
                        <th>Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {submissions.map((sub) => (
                        <tr key={sub.id}>
                          <td style={{ fontWeight: 700 }}>{sub.participantName}</td>
                          <td>
                            <span
                              style={{
                                fontSize: "0.75rem",
                                fontWeight: 800,
                                color: sub.club === "STACK_PUSH" ? "#60a5fa" : "#34d399",
                              }}
                            >
                              {sub.club === "STACK_PUSH" ? "Stack.push" : "IT Innovators"}
                            </span>
                          </td>
                          <td style={{ fontWeight: 800, fontFamily: "var(--font-mono)" }}>
                            {sub.answer}
                          </td>
                          <td style={{ color: "var(--text-muted)", fontSize: "0.8rem", fontFamily: "var(--font-mono)" }}>
                            {(sub.responseTimeMs / 1000).toFixed(2)}s
                          </td>
                          <td>
                            {currentStatus === "REVEALED" ? (
                              sub.isCorrect ? (
                                <span style={{ color: "#4ade80", fontWeight: 800 }}>✓ +{sub.pointsAwarded} pts</span>
                              ) : (
                                <span style={{ color: "#f87171", fontWeight: 700 }}>✕ 0 pts</span>
                              )
                            ) : (
                              <span style={{ color: "#38bdf8" }}>Submitted</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: 100-Question Selector & Browser */}
          <div>
            <div className="glass-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 800 }}>Question Browser</h3>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>100 Questions</span>
              </div>

              {/* Round Filter Tabs */}
              <div className="round-filter-tabs">
                <button
                  className={`filter-tab-btn ${roundFilter === "all" ? "active" : ""}`}
                  onClick={() => setRoundFilter("all")}
                >
                  All (100)
                </button>
                <button
                  className={`filter-tab-btn ${roundFilter === "1" ? "active" : ""}`}
                  onClick={() => setRoundFilter("1")}
                >
                  R1: Basics (1-20)
                </button>
                <button
                  className={`filter-tab-btn ${roundFilter === "2" ? "active" : ""}`}
                  onClick={() => setRoundFilter("2")}
                >
                  R2: Web (21-40)
                </button>
                <button
                  className={`filter-tab-btn ${roundFilter === "3" ? "active" : ""}`}
                  onClick={() => setRoundFilter("3")}
                >
                  R3: Coding (41-60)
                </button>
                <button
                  className={`filter-tab-btn ${roundFilter === "4" ? "active" : ""}`}
                  onClick={() => setRoundFilter("4")}
                >
                  R4: AI/Cyber (61-80)
                </button>
                <button
                  className={`filter-tab-btn ${roundFilter === "5" ? "active" : ""}`}
                  onClick={() => setRoundFilter("5")}
                >
                  R5: Hack (81-100)
                </button>
              </div>

              {/* Questions 1-100 Grid */}
              <div className="questions-chip-grid">
                {questions
                  .filter((q) => roundFilter === "all" || String(q.roundId) === roundFilter)
                  .map((q) => {
                    const isActive = (activeQuestion?.questionNumber || 1) === q.questionNumber;
                    const isSelected = selectedQuestionNumber === q.questionNumber;
                    return (
                      <div
                        key={q.id}
                        className={`question-chip ${isActive ? "active" : ""}`}
                        style={{
                          border: isSelected && !isActive ? "2px solid #60a5fa" : undefined,
                        }}
                        onClick={() => setSelectedQuestionNumber(q.questionNumber)}
                        title={`Q${q.questionNumber}: ${q.questionText.slice(0, 50)}...`}
                      >
                        Q{q.questionNumber}
                        <div style={{ fontSize: "0.65rem", opacity: 0.8 }}>{q.points}p</div>
                      </div>
                    );
                  })}
              </div>

              {/* Question Inspector Card */}
              {previewQuestion && (
                <div style={{ marginTop: "16px", padding: "14px", background: "rgba(15, 23, 42, 0.8)", borderRadius: "10px", border: "1px solid var(--border-subtle)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "#38bdf8" }}>
                      {previewQuestion.roundName}
                    </span>
                    <span className="question-points-pill">+{previewQuestion.points} pts</span>
                  </div>

                  <div style={{ fontWeight: 800, fontSize: "0.95rem", marginBottom: "10px" }}>
                    Q{previewQuestion.questionNumber}. {previewQuestion.questionText}
                  </div>

                  <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                    <button
                      className="btn btn-primary btn-block btn-sm"
                      onClick={() => {
                        runHostAction(
                          "/api/admin/select-question",
                          { questionNumber: previewQuestion.questionNumber },
                          `Switched active question to Q${previewQuestion.questionNumber}`,
                        );
                      }}
                      disabled={actionLoading || activeQuestion?.questionNumber === previewQuestion.questionNumber}
                    >
                      {activeQuestion?.questionNumber === previewQuestion.questionNumber
                        ? "Currently Active"
                        : `Activate Q${previewQuestion.questionNumber} Now`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
