import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { fetchJson, setAdminPassword, clearAdminPassword, type QuizMode } from "../services/api";

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

interface Participant {
  id: number;
  name: string;
  club: "STACK_PUSH" | "IT_INNOVATORS";
  score: number;
  correctCount: number;
  attemptCount: number;
  joinedAt: string;
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

interface QuizSession {
  status: string;
  currentQuestionId: number;
  currentQuestion: Question | null;
  questionStartedAt: string | null;
  countdownEndsAt: string | null;
  questionEndsAt: string | null;
  durationSeconds?: number;
  correctAnswer: string | null;
}

interface AdminSummary {
  session: QuizSession;
  currentQuestionId: number;
  clubs: ClubScore[];
  participants: Participant[];
  participantsCount: number;
  stackParticipants: Participant[];
  innovatorsParticipants: Participant[];
  stackCount: number;
  innovatorsCount: number;
  currentSubmissions: Submission[];
  answersReceived: number;
  answersPending: number;
}

export default function AdminPage({ mode = "live" }: { mode?: QuizMode } = {}) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    const stored = sessionStorage.getItem("quizbattle-admin-pw");
    if (stored) {
      setAdminPassword(stored);
      return true;
    }
    return false;
  });
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Stable refs — we update these without causing re-renders on every poll
  const summaryRef = useRef<AdminSummary | null>(null);
  const questionsRef = useRef<Question[]>([]);

  // States
  const [status, setStatus] = useState("WAITING");
  const [currentQNum, setCurrentQNum] = useState(1);
  const [clubs, setClubs] = useState<ClubScore[]>([
    { name: "STACK_PUSH", score: 0 },
    { name: "IT_INNOVATORS", score: 0 },
  ]);
  const [stackParticipants, setStackParticipants] = useState<Participant[]>([]);
  const [innovatorsParticipants, setInnovatorsParticipants] = useState<Participant[]>([]);
  const [participantsCount, setParticipantsCount] = useState(0);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedQuestionNumber, setSelectedQuestionNumber] = useState(1);
  const [roundFilter, setRoundFilter] = useState("all");
  const [actionLoading, setActionLoading] = useState(false);
  const [notification, setNotification] = useState("");

  // 30s Live Question Timer
  const [questionEndsAt, setQuestionEndsAt] = useState<string | null>(null);
  const [questionRemaining, setQuestionRemaining] = useState<number | null>(null);

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
      }, "live");
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
      const sumData = await fetchJson<AdminSummary>("/api/admin/summary", undefined, mode);

      const prev = summaryRef.current;
      summaryRef.current = sumData;

      if (!prev || prev.session?.status !== sumData.session?.status) {
        setStatus(sumData.session?.status || "WAITING");
      }
      if (!prev || prev.session?.currentQuestionId !== sumData.session?.currentQuestionId) {
        setCurrentQNum(sumData.session?.currentQuestionId || 1);
      }
      if (!prev || JSON.stringify(prev.clubs) !== JSON.stringify(sumData.clubs)) {
        setClubs(sumData.clubs || []);
      }
      setQuestionEndsAt(sumData.session?.questionEndsAt || null);
      setStackParticipants(sumData.stackParticipants || []);
      setInnovatorsParticipants(sumData.innovatorsParticipants || []);
      setParticipantsCount(sumData.participantsCount || 0);
      setSubmissions(sumData.currentSubmissions || []);
    } catch (_) {}
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchJson<Question[]>("/api/admin/questions", undefined, mode)
      .then((q) => {
        questionsRef.current = q;
        setQuestions(q);
      })
      .catch(() => {});
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    refreshData();
    const interval = setInterval(refreshData, 1500);
    return () => clearInterval(interval);
  }, [isAuthenticated, refreshData]);

  // 30s Live Question Timer countdown
  useEffect(() => {
    if (!questionEndsAt || status !== "LIVE") {
      setQuestionRemaining(null);
      return;
    }

    const updateQTimer = () => {
      const remainingMs = new Date(questionEndsAt).getTime() - Date.now();
      const sec = Math.max(0, Math.ceil(remainingMs / 1000));
      setQuestionRemaining(sec);
    };

    updateQTimer();
    const timer = setInterval(updateQTimer, 200);
    return () => clearInterval(timer);
  }, [questionEndsAt, status]);

  const runHostAction = async (endpoint: string, payload?: any, successMsg?: string) => {
    setActionLoading(true);
    try {
      await fetchJson(endpoint, {
        method: "POST",
        body: JSON.stringify(payload || {}),
      }, mode);
      await refreshData();
      if (successMsg) showNotification(successMsg);
    } catch (err: any) {
      alert(err.message || "Action failed");
    } finally {
      setActionLoading(false);
    }
  };

  const copyStudentLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}${mode === "test" ? "/test" : "/student"}`);
    showNotification(mode === "test" ? "📋 Test-mode student link copied to clipboard!" : "📋 Student link copied to clipboard!");
  };

  const activeQuestion = useMemo(() => {
    return questions.find((q) => q.questionNumber === currentQNum) || questions[0] || null;
  }, [questions, currentQNum]);

  const previewQuestion = useMemo(() => {
    return questions.find((q) => q.questionNumber === selectedQuestionNumber) || activeQuestion;
  }, [questions, selectedQuestionNumber, activeQuestion]);

  const stackScore = clubs.find((c) => c.name === "STACK_PUSH")?.score ?? 0;
  const innovScore = clubs.find((c) => c.name === "IT_INNOVATORS")?.score ?? 0;

  // --- 1. ADMIN LOGIN ---
  if (!isAuthenticated) {
    return (
      <div className="app-shell">
        <div className="container-sm" style={{ marginTop: "40px" }}>
          <div className="glass-card" style={{ padding: "24px" }}>
            <div style={{ textAlign: "center", marginBottom: "20px" }}>
              <div
                style={{
                  position: "relative",
                  borderRadius: "16px",
                  overflow: "hidden",
                  border: "2px solid rgba(59, 130, 246, 0.4)",
                  boxShadow: "0 0 25px rgba(59, 130, 246, 0.3)",
                  marginBottom: "16px",
                }}
              >
                <img
                  src="/battle-hero.jpg"
                  alt="Host Command Center"
                  style={{ width: "100%", maxHeight: "180px", objectFit: "cover", display: "block" }}
                />
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: "linear-gradient(to top, rgba(3, 7, 18, 0.95), transparent)",
                    padding: "12px 10px 6px",
                  }}
                >
                  <span className="brand-badge" style={{ background: "#2563eb", color: "#fff", fontWeight: 900 }}>
                    HOST COMMAND CENTER
                  </span>
                </div>
              </div>

              <h1 className="brand-title" style={{ fontSize: "1.75rem", margin: "4px 0" }}>
                Admin & Teacher Login
              </h1>
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                Access live quiz control, scoring & participant rosters
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

  // --- 2. ADMIN DASHBOARD ---
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
            }}
          >
            {notification}
          </div>
        )}

        {/* Header */}
        <div className="admin-header-bar">
          <div className="quiz-brand" style={{ margin: 0 }}>
            <span className="brand-badge" style={{ background: mode === "test" ? "#f59e0b" : "#2563eb" }}>
              {mode === "test" ? "TEST HUB" : "HOST HUB"}
            </span>
            <span className="brand-title">
              {mode === "test" ? "QuizBattle Command Center — TEST MODE" : "QuizBattle Command Center"}
            </span>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {mode === "live" && (
              <a href="/admin/test" className="btn btn-warning btn-sm">
                🧪 Open Test Mode
              </a>
            )}
            {mode === "test" && (
              <a href="/admin" className="btn btn-secondary btn-sm">
                ↩ Back to Live Admin
              </a>
            )}
            <button className="btn btn-secondary btn-sm" onClick={copyStudentLink}>
              📋 Copy Student Link
            </button>
            <a href={mode === "test" ? "/test/display" : "/display"} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
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

        {mode === "test" && (
          <div
            style={{
              background: "rgba(245, 158, 11, 0.18)",
              border: "2px solid #f59e0b",
              borderRadius: "12px",
              padding: "12px 16px",
              marginBottom: "20px",
              textAlign: "center",
            }}
          >
            <span style={{ fontWeight: 900, color: "#fcd34d", fontSize: "1rem", letterSpacing: "1px" }}>
              🧪 TEST MODE — 20 QUESTIONS — NOT THE LIVE COLLEGE QUIZ
            </span>
          </div>
        )}

        {/* Live Metrics Row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "14px", marginBottom: "20px" }}>
          <div className="score-card">
            <div className="score-card-title" style={{ color: "var(--text-muted)" }}>Status</div>
            <div style={{ marginTop: "6px" }}>
              {status === "LIVE" && <span className="badge badge-live"><span className="pulse-dot" /> LIVE {questionRemaining !== null ? `(${questionRemaining}s)` : ""}</span>}
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

          <div className="score-card">
            <div className="score-card-title" style={{ color: "var(--text-muted)" }}>Students Joined</div>
            <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#38bdf8", fontFamily: "var(--font-mono)", marginTop: "2px" }}>
              {participantsCount}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "2px" }}>
              🔵 {stackParticipants.length} Stack | 🟢 {innovatorsParticipants.length} Innovators
            </div>
          </div>

          <div className="score-card">
            <div className="score-card-title" style={{ color: "var(--text-muted)" }}>Submissions (Q{currentQNum})</div>
            <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#a78bfa", fontFamily: "var(--font-mono)", marginTop: "2px" }}>
              {submissions.length} / {participantsCount}
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
          {/* LEFT: Controls & Submissions */}
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
                  >
                    ◀ Prev
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => runHostAction("/api/admin/next-question", {}, "▶ Next question")}
                    disabled={actionLoading}
                  >
                    Next ▶
                  </button>
                </div>
              </div>

              {/* 30s Live Timer Progress bar */}
              {status === "LIVE" && questionRemaining !== null && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    background: questionRemaining <= 5 ? "rgba(239, 68, 68, 0.25)" : "rgba(30, 41, 59, 0.75)",
                    border: `1.5px solid ${questionRemaining <= 5 ? "#ef4444" : "#3b82f6"}`,
                    borderRadius: "10px",
                    padding: "8px 14px",
                    marginTop: "12px",
                  }}
                >
                  <span style={{ fontSize: "1.1rem", fontWeight: 900, fontFamily: "var(--font-mono)", color: questionRemaining <= 5 ? "#f87171" : "#38bdf8" }}>
                    ⏱️ {questionRemaining}s Live
                  </span>
                  <div style={{ flex: 1, background: "rgba(255,255,255,0.1)", borderRadius: "999px", height: "8px", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.min(100, Math.max(0, (questionRemaining / 30) * 100))}%`,
                        background: questionRemaining <= 5 ? "#ef4444" : "linear-gradient(90deg, #3b82f6, #10b981)",
                        transition: "width 0.2s linear",
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Active Question Preview */}
              {activeQuestion && (
                <div style={{ background: "rgba(15,23,42,0.7)", borderRadius: "10px", padding: "14px", marginTop: "14px", border: "1px solid var(--border-subtle)" }}>
                  <div style={{ fontSize: "1.05rem", fontWeight: 700 }}>{activeQuestion.questionText}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "10px", fontSize: "0.85rem" }}>
                    {(["A", "B", "C", "D"] as const).map((key) => (
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
                  onClick={() => runHostAction("/api/admin/start-countdown", { questionNumber: currentQNum }, "⏱️ 3-Second Countdown Started!")}
                  disabled={actionLoading || status === "LIVE" || status === "COUNTDOWN"}
                >
                  ⏱️ START QUESTION (3s Timer)
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
                  onClick={() => runHostAction("/api/admin/reveal-answer", {}, "👁️ Answer Revealed to all!")}
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
                        runHostAction("/api/admin/reset-scores", {}, "🔄 Scores & responses reset! Ready for next test.");
                      }
                    }}
                    disabled={actionLoading}
                  >
                    🔄 Clear Responses & Scores (Keep Students)
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => {
                      if (confirm(`COMPLETE FRESH WIPE — all ${mode === "test" ? "test" : "live"} data and participants cleared?`)) {
                        runHostAction("/api/admin/reset-all-fresh", {}, "✨ Everything cleared fresh.");
                      }
                    }}
                    disabled={actionLoading}
                  >
                    ⚠️ Complete Fresh Wipe ({mode === "test" ? "Test Mode" : "Live Mode"})
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

              {/* Student Session Controls */}
              <div className="danger-zone-box" style={{ marginTop: "14px" }}>
                <div className="danger-zone-title">🚪 Student Session Controls</div>
                <p style={{ fontSize: "0.8rem", color: "#cbd5e1", marginBottom: "12px" }}>
                  {mode === "test"
                    ? "Immediately log out every test student. Old test sessions become invalid on the server."
                    : "Immediately log out every student currently in the quiz. Old student sessions become invalid on the server — the quiz and question database are NOT affected."}
                </p>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => {
                    const msg =
                      mode === "test"
                        ? "Are you sure you want to log out all test students?"
                        : "Are you sure you want to log out all students?";
                    if (confirm(msg)) {
                      runHostAction(
                        "/api/admin/logout-all-students",
                        {},
                        mode === "test" ? "🚪 All test students logged out." : "🚪 All students logged out.",
                      );
                    }
                  }}
                  disabled={actionLoading}
                  style={{ fontWeight: 900 }}
                >
                  {mode === "test" ? "🚪 Log Out All Test Students" : "🚪 Log Out All Students"}
                </button>
              </div>
            </div>

            {/* LIVE SUBMISSIONS TABLE FOR CURRENT QUESTION */}
            <div className="glass-card" style={{ marginTop: "18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 800 }}>
                  Live Responses Feed (Q{currentQNum})
                </h3>
                <span className="badge badge-waiting">{submissions.length} / {participantsCount} Submitted</span>
              </div>

              {submissions.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px", color: "var(--text-muted)", fontSize: "0.9rem" }}>
                  No answers submitted yet for Question #{currentQNum}. When students select an option, their response will appear here in real-time.
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
                              {sub.club === "STACK_PUSH" ? "⚡ Stack.push" : "🚀 IT Innovators"}
                            </span>
                          </td>
                          <td style={{ fontWeight: 800, fontFamily: "var(--font-mono)" }}>
                            {sub.answer}
                          </td>
                          <td style={{ color: "var(--text-muted)", fontSize: "0.8rem", fontFamily: "var(--font-mono)" }}>
                            {(sub.responseTimeMs / 1000).toFixed(2)}s
                          </td>
                          <td>
                            {status === "REVEALED" ? (
                              sub.isCorrect ? (
                                <span style={{ color: "#4ade80", fontWeight: 800 }}>✓ +{sub.pointsAwarded} pts</span>
                              ) : (
                                <span style={{ color: "#f87171", fontWeight: 700 }}>✕ 0 pts</span>
                              )
                            ) : (
                              <span style={{ color: "#38bdf8" }}>✓ Locked</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* LIVE REGISTERED PARTICIPANTS ROSTER */}
            <div className="glass-card" style={{ marginTop: "18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 800 }}>
                  👥 Live Joined Students Roster ({participantsCount})
                </h3>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                {/* Stack.push Roster */}
                <div style={{ background: "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(59, 130, 246, 0.3)", borderRadius: "10px", padding: "14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <span style={{ fontWeight: 800, color: "#60a5fa" }}>⚡ Stack.push ({stackParticipants.length})</span>
                    <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "#fbbf24" }}>{stackScore} pts</span>
                  </div>
                  {stackParticipants.length === 0 ? (
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "12px" }}>
                      No students joined Stack.push yet
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "200px", overflowY: "auto" }}>
                      {stackParticipants.map((p) => (
                        <div
                          key={p.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            background: "rgba(15, 23, 42, 0.6)",
                            padding: "6px 10px",
                            borderRadius: "6px",
                            fontSize: "0.85rem",
                          }}
                        >
                          <span style={{ fontWeight: 700 }}>{p.name}</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 800, color: "#fbbf24" }}>{p.score} pts</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* IT Innovators Roster */}
                <div style={{ background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "10px", padding: "14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <span style={{ fontWeight: 800, color: "#34d399" }}>🚀 IT Innovators ({innovatorsParticipants.length})</span>
                    <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "#fbbf24" }}>{innovScore} pts</span>
                  </div>
                  {innovatorsParticipants.length === 0 ? (
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", padding: "12px" }}>
                      No students joined IT Innovators yet
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "200px", overflowY: "auto" }}>
                      {innovatorsParticipants.map((p) => (
                        <div
                          key={p.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            background: "rgba(15, 23, 42, 0.6)",
                            padding: "6px 10px",
                            borderRadius: "6px",
                            fontSize: "0.85rem",
                          }}
                        >
                          <span style={{ fontWeight: 700 }}>{p.name}</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 800, color: "#fbbf24" }}>{p.score} pts</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Question Browser */}
          <div>
            <div className="glass-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 800 }}>Question Browser</h3>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{mode === "test" ? "20 Questions" : "100 Questions"}</span>
              </div>

              <div className="round-filter-tabs">
                {[
                  { label: mode === "test" ? "All (20)" : "All (100)", value: "all" },
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
                  .filter((q) => roundFilter === "all" || String(q.roundId) === roundFilter)
                  .map((q) => {
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
                    {(["A", "B", "C", "D"] as const).map((key) => (
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
                    onClick={() =>
                      runHostAction(
                        "/api/admin/select-question",
                        { questionNumber: previewQuestion.questionNumber },
                        `Switched to Q${previewQuestion.questionNumber}`,
                      )
                    }
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
