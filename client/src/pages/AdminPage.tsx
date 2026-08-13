import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { fetchJson, setAdminPassword, getAdminPassword, clearAdminPassword } from "../services/api";

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

interface ClubScore {
  name: string;
  score: number;
}

interface QuizSession {
  status: string;
  currentQuestionId: number;
  currentQuestion: Question | null;
  questionStartedAt: string | null;
  countdownEndsAt: string | null;
  correctAnswer: string | null;
}

interface AdminSummary {
  session: QuizSession;
  currentQuestionId: number;
  clubs: ClubScore[];
}

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    const stored = sessionStorage.getItem("quizbattle-admin-pw");
    return !!stored;
  });
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Stable refs — we update these without causing re-renders on every poll
  const summaryRef = useRef<AdminSummary | null>(null);
  const questionsRef = useRef<Question[]>([]);

  // Only these cause re-renders (the minimal set needed for display)
  const [status, setStatus] = useState("WAITING");
  const [currentQNum, setCurrentQNum] = useState(1);
  const [clubs, setClubs] = useState<ClubScore[]>([
    { name: "STACK_PUSH", score: 0 },
    { name: "IT_INNOVATORS", score: 0 },
  ]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedQuestionNumber, setSelectedQuestionNumber] = useState(1);
  const [roundFilter, setRoundFilter] = useState("all");
  const [actionLoading, setActionLoading] = useState(false);
  const [notification, setNotification] = useState("");
  const [lastUpdated, setLastUpdated] = useState(0);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(""), 4000);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      setAdminPassword(password);
      const res = await fetchJson<{ ok: boolean; token?: string }>("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        sessionStorage.setItem("quizbattle-admin-pw", password);
        setIsAuthenticated(true);
      }
    } catch (err: any) {
      clearAdminPassword();
      setAuthError(err.message || "Invalid admin password");
    } finally {
      setAuthLoading(false);
    }
  };

  const refreshData = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const sumData = await fetchJson<AdminSummary>("/api/admin/summary");

      // Smart diffing: only trigger re-renders if something actually changed
      const prev = summaryRef.current;
      const statusChanged = !prev || prev.session?.status !== sumData.session?.status;
      const qChanged = !prev || prev.session?.currentQuestionId !== sumData.session?.currentQuestionId;
      const clubsChanged = !prev || JSON.stringify(prev.clubs) !== JSON.stringify(sumData.clubs);

      summaryRef.current = sumData;

      if (statusChanged) setStatus(sumData.session?.status || "WAITING");
      if (qChanged) setCurrentQNum(sumData.session?.currentQuestionId || 1);
      if (clubsChanged) setClubs(sumData.clubs || []);
      if (statusChanged || qChanged || clubsChanged) setLastUpdated(Date.now());
    } catch (_) {
      // Silently ignore poll errors to prevent blinking
    }
  }, [isAuthenticated]);

  // Load questions once on mount (they never change)
  useEffect(() => {
    if (!isAuthenticated) return;
    fetchJson<Question[]>("/api/admin/questions").then(q => {
      questionsRef.current = q;
      setQuestions(q);
    }).catch(() => {});
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    refreshData();
    const interval = setInterval(refreshData, 2000);
    return () => clearInterval(interval);
  }, [isAuthenticated, refreshData]);

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
    navigator.clipboard.writeText(`${window.location.origin}/student`);
    showNotification("📋 Student link copied!");
  };

  // Derived from stable ref + render-triggering state
  const activeQuestion = useMemo(() => {
    return questions.find(q => q.questionNumber === currentQNum) || questions[0] || null;
  }, [questions, currentQNum]);

  const previewQuestion = useMemo(() => {
    return questions.find(q => q.questionNumber === selectedQuestionNumber) || activeQuestion;
  }, [questions, selectedQuestionNumber, activeQuestion]);

  const stackScore = clubs.find(c => c.name === "STACK_PUSH")?.score ?? 0;
  const innovScore = clubs.find(c => c.name === "IT_INNOVATORS")?.score ?? 0;

  // --- LOGIN FORM ---
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
                  onChange={e => setPassword(e.target.value)}
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

  // --- ADMIN DASHBOARD ---
  return (
    <div className="app-shell">
      <div className="container">
        {/* Notification Toast */}
        {notification && (
          <div style={{
            position: "fixed", top: "20px", right: "20px",
            background: "#10b981", color: "#030712",
            padding: "12px 20px", borderRadius: "10px", fontWeight: 800,
            boxShadow: "0 10px 25px rgba(0,0,0,0.5)", zIndex: 200,
          }}>
            {notification}
          </div>
        )}

        {/* Header */}
        <div className="admin-header-bar">
          <div className="quiz-brand" style={{ margin: 0 }}>
            <span className="brand-badge" style={{ background: "#2563eb" }}>HOST HUB</span>
            <span className="brand-title">QuizBattle Command Center</span>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button className="btn btn-secondary btn-sm" onClick={copyStudentLink}>
              📋 Copy Student Link
            </button>
            <a href="/display" target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
              📺 Projector Screen ↗
            </a>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                clearAdminPassword();
                sessionStorage.removeItem("quizbattle-admin-pw");
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
            <div className="score-card-title" style={{ color: "var(--text-muted)" }}>Status</div>
            <div style={{ marginTop: "6px" }}>
              {status === "LIVE" && <span className="badge badge-live"><span className="pulse-dot" /> LIVE</span>}
              {status === "COUNTDOWN" && <span className="badge badge-countdown"><span className="pulse-dot" /> 3s TIMER</span>}
              {status === "WAITING" && <span className="badge badge-waiting">WAITING</span>}
              {status === "LOCKED" && <span className="badge badge-locked">LOCKED</span>}
              {status === "REVEALED" && <span className="badge badge-revealed">REVEALED</span>}
              {status === "FINISHED" && <span className="badge badge-finished">FINISHED</span>}
            </div>
          </div>

          <div className="score-card">
            <div className="score-card-title" style={{ color: "var(--text-muted)" }}>Active Question</div>
            <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#f8fafc", fontFamily: "var(--font-mono)", marginTop: "2px" }}>
              Q{currentQNum}
            </div>
          </div>

          <div className="score-card stack">
            <div className="score-card-title">⚡ Stack.push</div>
            <div className="score-card-points" style={{ fontSize: "1.8rem", marginTop: "2px" }}>{stackScore}</div>
          </div>

          <div className="score-card innovators">
            <div className="score-card-title">🚀 IT Innovators</div>
            <div className="score-card-points" style={{ fontSize: "1.8rem", marginTop: "2px" }}>{innovScore}</div>
          </div>
        </div>

        <div className="admin-layout-grid">
          {/* LEFT: Controls */}
          <div>
            <div className="admin-actions-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "#38bdf8", textTransform: "uppercase" }}>
                    {activeQuestion?.roundName || "Round 1"}
                  </span>
                  <h2 style={{ fontSize: "1.4rem", fontWeight: 800, marginTop: "2px" }}>
                    Active Question #{currentQNum} (+{activeQuestion?.points || 1} pts)
                  </h2>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => runHostAction("/api/admin/prev-question", {}, "◀ Previous question")}
                    disabled={actionLoading || currentQNum <= 1}
                  >◀ Prev</button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => runHostAction("/api/admin/next-question", {}, "▶ Next question")}
                    disabled={actionLoading}
                  >Next ▶</button>
                </div>
              </div>

              {/* Active Question Preview */}
              {activeQuestion && (
                <div style={{ background: "rgba(15,23,42,0.7)", borderRadius: "10px", padding: "14px", marginTop: "14px", border: "1px solid var(--border-subtle)" }}>
                  <div style={{ fontSize: "1.05rem", fontWeight: 700 }}>{activeQuestion.questionText}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "10px", fontSize: "0.85rem" }}>
                    {(["A", "B", "C", "D"] as const).map(key => (
                      <div
                        key={key}
                        style={{
                          color: activeQuestion.correctAnswer === key ? "#4ade80" : "#cbd5e1",
                          fontWeight: activeQuestion.correctAnswer === key ? 800 : 500,
                        }}
                      >
                        <strong>{key})</strong> {activeQuestion[`option${key}` as keyof Question] as string}
                        {activeQuestion.correctAnswer === key && " ✓"}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Main Action Buttons */}
              <div className="action-buttons-row">
                <button
                  className="btn btn-success btn-lg"
                  style={{ flex: "1 1 200px" }}
                  onClick={() => runHostAction("/api/admin/start-countdown", { questionNumber: currentQNum }, "⏱️ Countdown started!")}
                  disabled={actionLoading || status === "LIVE" || status === "COUNTDOWN"}
                >
                  ⏱️ START (3s Timer)
                </button>

                <button
                  className="btn btn-warning"
                  style={{ flex: "1 1 140px" }}
                  onClick={() => runHostAction("/api/admin/lock-answers", {}, "🔒 Answers Locked")}
                  disabled={actionLoading || status !== "LIVE"}
                >
                  🔒 LOCK ANSWERS
                </button>

                <button
                  className="btn btn-primary"
                  style={{ flex: "1 1 150px" }}
                  onClick={() => runHostAction("/api/admin/reveal-answer", {}, "👁️ Answer Revealed!")}
                  disabled={actionLoading || (status !== "LOCKED" && status !== "LIVE")}
                >
                  👁️ REVEAL ANSWER
                </button>

                <button
                  className="btn btn-secondary"
                  style={{ flex: "1 1 140px" }}
                  onClick={() => runHostAction("/api/admin/next-question", {}, "➡️ Next Question")}
                  disabled={actionLoading}
                >
                  ➡️ NEXT QUESTION
                </button>
              </div>

              {/* Teacher Testing Zone */}
              <div className="danger-zone-box">
                <div className="danger-zone-title">⚡ Teacher Testing & Clear Center</div>
                <p style={{ fontSize: "0.8rem", color: "#cbd5e1", marginBottom: "12px" }}>
                  Reset scores anytime before or after demonstrating to your teacher.
                </p>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    className="btn btn-warning btn-sm"
                    onClick={() => {
                      if (confirm("Reset all scores and responses? (Students stay joined)")) {
                        runHostAction("/api/admin/reset-scores", {}, "🔄 Scores reset!");
                      }
                    }}
                    disabled={actionLoading}
                  >
                    🔄 Clear Scores (Keep Students)
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => {
                      if (confirm("COMPLETE FRESH WIPE — all data cleared?")) {
                        runHostAction("/api/admin/reset-all-fresh", {}, "✨ Everything cleared.");
                      }
                    }}
                    disabled={actionLoading}
                  >
                    ⚠️ Complete Fresh Wipe
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => {
                      if (confirm("End the quiz and show final scores?")) {
                        runHostAction("/api/admin/end-quiz", {}, "🏁 Quiz ended!");
                      }
                    }}
                    disabled={actionLoading}
                  >
                    🏁 End Quiz
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Question Browser */}
          <div>
            <div className="glass-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 800 }}>Question Browser</h3>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>100 Questions</span>
              </div>

              <div className="round-filter-tabs">
                {[
                  { label: "All (100)", value: "all" },
                  { label: "R1: Basics", value: "1" },
                  { label: "R2: Web", value: "2" },
                  { label: "R3: Coding", value: "3" },
                  { label: "R4: AI/Cyber", value: "4" },
                  { label: "R5: Hack", value: "5" },
                ].map(({ label, value }) => (
                  <button
                    key={value}
                    className={`filter-tab-btn ${roundFilter === value ? "active" : ""}`}
                    onClick={() => setRoundFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="questions-chip-grid">
                {questions
                  .filter(q => roundFilter === "all" || String(q.roundId) === roundFilter)
                  .map(q => {
                    const isActive = currentQNum === q.questionNumber;
                    const isSelected = selectedQuestionNumber === q.questionNumber;
                    return (
                      <div
                        key={q.id}
                        className={`question-chip ${isActive ? "active" : ""}`}
                        style={{ border: isSelected && !isActive ? "2px solid #60a5fa" : undefined }}
                        onClick={() => setSelectedQuestionNumber(q.questionNumber)}
                        title={`Q${q.questionNumber}: ${q.questionText.slice(0, 60)}`}
                      >
                        Q{q.questionNumber}
                        <div style={{ fontSize: "0.65rem", opacity: 0.8 }}>{q.points}p</div>
                      </div>
                    );
                  })}
              </div>

              {previewQuestion && (
                <div style={{ marginTop: "16px", padding: "14px", background: "rgba(15,23,42,0.8)", borderRadius: "10px", border: "1px solid var(--border-subtle)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "#38bdf8" }}>
                      {previewQuestion.roundName}
                    </span>
                    <span className="question-points-pill">+{previewQuestion.points} pts</span>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: "0.95rem", marginBottom: "12px" }}>
                    Q{previewQuestion.questionNumber}. {previewQuestion.questionText}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", fontSize: "0.82rem", marginBottom: "12px" }}>
                    {(["A", "B", "C", "D"] as const).map(key => (
                      <div
                        key={key}
                        style={{
                          color: previewQuestion.correctAnswer === key ? "#4ade80" : "#94a3b8",
                          fontWeight: previewQuestion.correctAnswer === key ? 800 : 400,
                        }}
                      >
                        <strong>{key})</strong> {previewQuestion[`option${key}` as keyof Question] as string}
                        {previewQuestion.correctAnswer === key && " ✓"}
                      </div>
                    ))}
                  </div>
                  <button
                    className="btn btn-primary btn-block btn-sm"
                    onClick={() => runHostAction(
                      "/api/admin/select-question",
                      { questionNumber: previewQuestion.questionNumber },
                      `Switched to Q${previewQuestion.questionNumber}`,
                    )}
                    disabled={actionLoading || currentQNum === previewQuestion.questionNumber}
                  >
                    {currentQNum === previewQuestion.questionNumber
                      ? "Currently Active"
                      : `Activate Q${previewQuestion.questionNumber}`}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
