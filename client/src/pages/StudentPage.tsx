import React, { useEffect, useState, useRef } from "react";
import { fetchJson } from "../services/api";
import { socket } from "../socket";

interface Participant {
  id: number;
  name: string;
  club: "STACK_PUSH" | "IT_INNOVATORS";
  score: number;
  sessionToken: string;
}

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
  correctAnswer?: string;
}

export default function StudentPage() {
  const [sessionToken, setSessionToken] = useState<string>(() => {
    return localStorage.getItem("quizbattle-session") || "";
  });
  const [participant, setParticipant] = useState<Participant | null>(null);
  
  // Registration form
  const [regName, setRegName] = useState("");
  const [regClub, setRegClub] = useState<"STACK_PUSH" | "IT_INNOVATORS" | "">("");
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState("");

  // Quiz state
  const [status, setStatus] = useState<string>("WAITING");
  const [question, setQuestion] = useState<Question | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null);
  
  // 3-Second Countdown timer
  const [countdownEndsAt, setCountdownEndsAt] = useState<string | null>(null);
  const [countdownRemaining, setCountdownRemaining] = useState<number | null>(null);

  // Live Club Scores
  const [clubScores, setClubScores] = useState({
    STACK_PUSH: 0,
    IT_INNOVATORS: 0,
  });

  const lastQuestionIdRef = useRef<number | null>(null);

  // Sync session and participant data
  const syncSession = async () => {
    if (!sessionToken) return;
    try {
      const data = await fetchJson<{
        participant: Participant;
        hasSubmitted: boolean;
        currentQuestion: Question | null;
        sessionStatus: string;
        countdownEndsAt: string | null;
        correctAnswer: string | null;
        userSubmission?: any;
      }>(`/api/participants/session?token=${encodeURIComponent(sessionToken)}`);

      if (data.participant) {
        setParticipant(data.participant);
      }
      if (data.sessionStatus) {
        setStatus(data.sessionStatus);
      }
      setCountdownEndsAt(data.countdownEndsAt);
      setCorrectAnswer(data.correctAnswer);

      // Check if question changed
      if (data.currentQuestion?.id !== lastQuestionIdRef.current) {
        lastQuestionIdRef.current = data.currentQuestion?.id ?? null;
        setSelectedAnswer(null);
      }

      setQuestion(data.currentQuestion);
      setHasSubmitted(data.hasSubmitted);
      if (data.userSubmission) {
        setSelectedAnswer(data.userSubmission.answer);
      }
    } catch (_) {
      // Keep local state on transient network/serverless polling glitch
    }
  };

  // Sync leaderboard scores
  const syncLeaderboard = async () => {
    try {
      const data = await fetchJson<{ clubs: Array<{ name: string; score: number }> }>("/api/leaderboard");
      if (data.clubs) {
        setClubScores({
          STACK_PUSH: data.clubs.find((c) => c.name === "STACK_PUSH")?.score ?? 0,
          IT_INNOVATORS: data.clubs.find((c) => c.name === "IT_INNOVATORS")?.score ?? 0,
        });
      }
    } catch (_) {}
  };

  // Initial and regular polling (every 1 second for ultra-fast response for 50+ students)
  useEffect(() => {
    syncSession();
    syncLeaderboard();

    const interval = setInterval(() => {
      syncSession();
      syncLeaderboard();
    }, 1000);

    // Socket events for instantaneous push when supported
    socket.on("quiz:state", () => {
      syncSession();
      syncLeaderboard();
    });
    socket.on("leaderboard:update", () => {
      syncLeaderboard();
    });

    return () => {
      clearInterval(interval);
      socket.off("quiz:state");
      socket.off("leaderboard:update");
    };
  }, [sessionToken]);

  // Countdown timer tick logic
  useEffect(() => {
    if (!countdownEndsAt) {
      setCountdownRemaining(null);
      return;
    }

    const updateCountdown = () => {
      const remainingMs = new Date(countdownEndsAt).getTime() - Date.now();
      const sec = Math.ceil(remainingMs / 1000);
      if (sec > 0) {
        setCountdownRemaining(sec);
      } else {
        setCountdownRemaining(null);
        setCountdownEndsAt(null);
        setStatus("LIVE");
      }
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 100);
    return () => clearInterval(timer);
  }, [countdownEndsAt]);

  // Handle participant registration
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError("");

    if (!regName.trim()) {
      setRegError("Please enter your full name");
      return;
    }
    if (!regClub) {
      setRegError("Please select your club");
      return;
    }

    setRegLoading(true);
    try {
      const res = await fetchJson<{
        ok: boolean;
        participant: Participant;
      }>("/api/participants/register", {
        method: "POST",
        body: JSON.stringify({
          name: regName.trim(),
          club: regClub,
        }),
      });

      localStorage.setItem("quizbattle-session", res.participant.sessionToken);
      setSessionToken(res.participant.sessionToken);
      setParticipant(res.participant);
    } catch (err: any) {
      setRegError(err.message || "Registration failed");
    } finally {
      setRegLoading(false);
    }
  };

  // Handle answer submission
  const handleSubmitAnswer = async () => {
    if (!selectedAnswer || !question || !sessionToken || hasSubmitted || submitting) return;

    setSubmitting(true);
    setErrorMessage("");

    try {
      const res = await fetchJson<{
        ok: boolean;
        submission: any;
        participantScore: number;
      }>("/api/questions/submit", {
        method: "POST",
        body: JSON.stringify({
          token: sessionToken,
          questionId: question.id,
          answer: selectedAnswer,
        }),
      });

      setHasSubmitted(true);
      if (participant && res.participantScore !== undefined) {
        setParticipant({ ...participant, score: res.participantScore });
      }
      syncLeaderboard();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to submit answer");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    if (confirm("Are you sure you want to exit or switch your student profile?")) {
      localStorage.removeItem("quizbattle-session");
      setSessionToken("");
      setParticipant(null);
    }
  };

  // --- 1. RENDER JOIN / REGISTRATION FORM ---
  if (!participant) {
    return (
      <div className="app-shell">
        <div className="container-sm" style={{ marginTop: "40px" }}>
          <div className="glass-card">
            <div style={{ textAlign: "center", marginBottom: "24px" }}>
              <span className="brand-badge">QUIZ BATTLE</span>
              <h1 className="brand-title" style={{ fontSize: "1.8rem", marginTop: "8px" }}>
                IT Club Championship
              </h1>
              <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", marginTop: "6px" }}>
                Join the live competition on your mobile or laptop
              </p>
            </div>

            <form onSubmit={handleRegister}>
              <div className="form-group">
                <label className="form-label">Your Full Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Sagar Pathak"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label">Select Your Club</label>
                <div className="club-selector">
                  <div
                    className={`club-card stack ${regClub === "STACK_PUSH" ? "selected" : ""}`}
                    onClick={() => setRegClub("STACK_PUSH")}
                  >
                    <div className="club-icon">⚡</div>
                    <div className="club-name">Stack.push</div>
                    <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Blue Club</span>
                  </div>

                  <div
                    className={`club-card innovators ${regClub === "IT_INNOVATORS" ? "selected" : ""}`}
                    onClick={() => setRegClub("IT_INNOVATORS")}
                  >
                    <div className="club-icon">🚀</div>
                    <div className="club-name">IT Innovators</div>
                    <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Green Club</span>
                  </div>
                </div>
              </div>

              {regError && (
                <div style={{ color: "#fca5a5", fontSize: "0.875rem", fontWeight: 700, marginBottom: "16px", textAlign: "center" }}>
                  ⚠️ {regError}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary btn-block btn-lg"
                disabled={regLoading || !regName.trim() || !regClub}
              >
                {regLoading ? "Joining..." : "ENTER LIVE QUIZ →"}
              </button>

              <div style={{ marginTop: "20px", textAlign: "center", paddingTop: "14px", borderTop: "1px solid var(--border-subtle)" }}>
                <a
                  href="/host"
                  style={{
                    color: "var(--text-dim)",
                    fontSize: "0.85rem",
                    textDecoration: "none",
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  ⚙️ Host / Teacher Dashboard Login →
                </a>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // --- 2. RENDER LIVE STUDENT QUIZ INTERFACE ---
  const isClubStack = participant.club === "STACK_PUSH";

  return (
    <div className="app-shell">
      {/* 3-Second Animated Countdown Overlay */}
      {countdownRemaining !== null && countdownRemaining > 0 && (
        <div className="countdown-overlay">
          <div className="countdown-number">{countdownRemaining}</div>
          <div className="countdown-label">Next Question Starting...</div>
        </div>
      )}

      <div className="container" style={{ maxWidth: 860, margin: "0 auto" }}>
        {/* Top Header Card */}
        <div className="glass-card" style={{ marginBottom: "18px", padding: "16px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span
                  style={{
                    display: "inline-block",
                    padding: "3px 8px",
                    borderRadius: "6px",
                    fontSize: "0.75rem",
                    fontWeight: 800,
                    background: isClubStack ? "rgba(59, 130, 246, 0.2)" : "rgba(16, 185, 129, 0.2)",
                    color: isClubStack ? "#60a5fa" : "#34d399",
                    border: `1px solid ${isClubStack ? "#3b82f6" : "#10b981"}`,
                  }}
                >
                  {isClubStack ? "⚡ STACK.PUSH" : "🚀 IT INNOVATORS"}
                </span>
                <span style={{ fontSize: "1.1rem", fontWeight: 800 }}>{participant.name}</span>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Your Score
                </div>
                <div style={{ fontSize: "1.5rem", fontWeight: 900, color: "#fbbf24", fontFamily: "var(--font-mono)", lineHeight: 1 }}>
                  {participant.score} pts
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="btn btn-secondary btn-sm"
                title="Switch participant or club"
                style={{ padding: "6px 10px", fontSize: "0.75rem" }}
              >
                Switch
              </button>
            </div>
          </div>
        </div>

        {/* Live Club Scores Bar */}
        <div className="score-banner" style={{ marginBottom: "18px" }}>
          <div className="score-card stack">
            <div className="score-card-title">⚡ Stack.push</div>
            <div className="score-card-points">{clubScores.STACK_PUSH}</div>
          </div>
          <div className="score-card innovators">
            <div className="score-card-title">🚀 IT Innovators</div>
            <div className="score-card-points">{clubScores.IT_INNOVATORS}</div>
          </div>
        </div>

        {/* Main Quiz Area */}
        <div className="glass-card">
          {/* Status Header */}
          <div className="question-header-bar">
            <div>
              {status === "LIVE" && <span className="badge badge-live"><span className="pulse-dot" /> LIVE</span>}
              {status === "COUNTDOWN" && <span className="badge badge-countdown"><span className="pulse-dot" /> STARTING</span>}
              {status === "WAITING" && <span className="badge badge-waiting">WAITING FOR HOST</span>}
              {status === "LOCKED" && <span className="badge badge-locked">LOCKED</span>}
              {status === "REVEALED" && <span className="badge badge-revealed">REVEALED</span>}
              {status === "FINISHED" && <span className="badge badge-finished">QUIZ COMPLETED</span>}
            </div>

            {question && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span className="question-round-title">{question.roundName}</span>
                <span className="question-points-pill">+{question.points} {question.points === 1 ? "Point" : "Points"}</span>
              </div>
            )}
          </div>

          {/* ACTIVE QUESTION STATE (LIVE / LOCKED / REVEALED) */}
          {question && (status === "LIVE" || status === "LOCKED" || status === "REVEALED") ? (
            <div className="student-question-container" style={{ marginTop: "18px" }}>
              {/* Question Text Box */}
              <div className="question-text-box">
                <div className="question-num-tag">Question {question.questionNumber} of 100</div>
                <div className="question-main-text">{question.questionText}</div>
              </div>

              {/* Multiple Choice Options (A, B, C, D) */}
              <div className="options-grid">
                {(["A", "B", "C", "D"] as const).map((key) => {
                  const optionText = question[`option${key}`];
                  const isSelected = selectedAnswer === key;
                  const isCorrect = status === "REVEALED" && correctAnswer === key;
                  const isWrongSelected = status === "REVEALED" && isSelected && correctAnswer !== key;

                  let optionClass = "option-tile";
                  if (isSelected) optionClass += " selected";
                  if (isCorrect) optionClass += " correct";
                  if (isWrongSelected) optionClass += " incorrect";

                  return (
                    <button
                      key={key}
                      className={optionClass}
                      onClick={() => {
                        if (status === "LIVE" && !hasSubmitted) {
                          setSelectedAnswer(key);
                        }
                      }}
                      disabled={status !== "LIVE" || hasSubmitted}
                    >
                      <div className="option-letter">{key}</div>
                      <div className="option-label">{optionText}</div>
                    </button>
                  );
                })}
              </div>

              {/* Action / Feedback */}
              <div style={{ marginTop: "10px" }}>
                {status === "LIVE" && !hasSubmitted && (
                  <button
                    className="btn btn-success btn-block btn-lg"
                    onClick={handleSubmitAnswer}
                    disabled={!selectedAnswer || submitting}
                  >
                    {submitting ? "Submitting..." : selectedAnswer ? `LOCK IN OPTION ${selectedAnswer} →` : "Select an Option to Submit"}
                  </button>
                )}

                {hasSubmitted && status !== "REVEALED" && (
                  <div
                    style={{
                      background: "rgba(16, 185, 129, 0.15)",
                      border: "1.5px solid #10b981",
                      borderRadius: "12px",
                      padding: "16px",
                      textAlign: "center",
                      color: "#86efac",
                      fontWeight: 800,
                    }}
                  >
                    ✓ Option {selectedAnswer} Submitted! Waiting for host to reveal results...
                  </div>
                )}

                {status === "LOCKED" && !hasSubmitted && (
                  <div
                    style={{
                      background: "rgba(245, 158, 11, 0.15)",
                      border: "1.5px solid #f59e0b",
                      borderRadius: "12px",
                      padding: "16px",
                      textAlign: "center",
                      color: "#fcd34d",
                      fontWeight: 800,
                    }}
                  >
                    🔒 Time's up! Answers locked by host.
                  </div>
                )}

                {status === "REVEALED" && (
                  <div
                    style={{
                      background:
                        selectedAnswer === correctAnswer
                          ? "rgba(16, 185, 129, 0.2)"
                          : "rgba(239, 68, 68, 0.2)",
                      border: `2px solid ${selectedAnswer === correctAnswer ? "#10b981" : "#ef4444"}`,
                      borderRadius: "12px",
                      padding: "18px",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ fontSize: "1.2rem", fontWeight: 800, color: selectedAnswer === correctAnswer ? "#86efac" : "#fca5a5" }}>
                      {selectedAnswer === correctAnswer
                        ? `🎉 CORRECT! +${question.points} Points Earned!`
                        : selectedAnswer
                          ? `❌ Incorrect! Correct Answer was Option ${correctAnswer}`
                          : `Correct Answer: Option ${correctAnswer}`}
                    </div>
                  </div>
                )}

                {errorMessage && (
                  <div style={{ color: "#fca5a5", marginTop: "12px", textAlign: "center", fontWeight: 700 }}>
                    ⚠️ {errorMessage}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* WAITING OR FINISHED STATE */
            <div className="status-state-card">
              <div className="status-icon-bubble">
                {status === "FINISHED" ? "🏆" : "⏳"}
              </div>
              <h2 style={{ fontSize: "1.5rem", fontWeight: 800 }}>
                {status === "FINISHED" ? "QUIZ BATTLE FINISHED!" : "Waiting for Host..."}
              </h2>
              <p style={{ color: "var(--text-muted)", maxWidth: 460 }}>
                {status === "FINISHED"
                  ? "Thank you for participating! Check the big screen for final winner announcements."
                  : "The host is preparing the next question. As soon as the host starts, a 3-second timer will appear and the question will show here!"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
