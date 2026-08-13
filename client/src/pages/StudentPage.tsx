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

interface CachedAnswer {
  questionId: number;
  answer: string;
  submitted: boolean;
}

const ANSWER_CACHE_KEY = "quizbattle-current-answer";

function loadCachedAnswer(): CachedAnswer | null {
  try {
    const raw = localStorage.getItem(ANSWER_CACHE_KEY);
    return raw ? JSON.parse(raw) as CachedAnswer : null;
  } catch (_) {
    return null;
  }
}

function saveCachedAnswer(answer: CachedAnswer | null) {
  if (answer) localStorage.setItem(ANSWER_CACHE_KEY, JSON.stringify(answer));
  else localStorage.removeItem(ANSWER_CACHE_KEY);
}

function loadCachedParticipant(): Participant | null {
  try {
    const raw = localStorage.getItem("quizbattle-participant");
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

export default function StudentPage() {
  const [sessionToken, setSessionToken] = useState<string>(() => {
    return localStorage.getItem("quizbattle-session") || "";
  });
  // Hydrate participant from cache so user never sees join form on refresh
  const [participant, setParticipantState] = useState<Participant | null>(() => {
    const token = localStorage.getItem("quizbattle-session");
    return token ? loadCachedParticipant() : null;
  });
  const [isSessionLoading, setIsSessionLoading] = useState<boolean>(() => {
    // If we have a token but no cached participant, show loader instead of form
    const token = localStorage.getItem("quizbattle-session");
    return !!token && !loadCachedParticipant();
  });

  // Wrapper that also persists to localStorage
  const setParticipant = (p: Participant | null) => {
    setParticipantState((current) => {
      if (
        current && p &&
        current.id === p.id &&
        current.name === p.name &&
        current.club === p.club &&
        current.score === p.score &&
        current.sessionToken === p.sessionToken
      ) return current;
      return p;
    });
    if (p) {
      localStorage.setItem("quizbattle-participant", JSON.stringify(p));
    } else {
      localStorage.removeItem("quizbattle-participant");
    }
  };

  // Registration form
  const [regName, setRegName] = useState("");
  const [regClub, setRegClub] = useState<"STACK_PUSH" | "IT_INNOVATORS" | "">("")
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
  const sessionRequestRef = useRef(0);
  const sessionRequestInFlightRef = useRef(false);
  const leaderboardRequestRef = useRef(0);

  // Sync session and participant data
  const syncSession = async (token?: string, force = false) => {
    const tok = token ?? sessionToken;
    if (!tok || (sessionRequestInFlightRef.current && !force)) return;
    const requestId = ++sessionRequestRef.current;
    sessionRequestInFlightRef.current = true;
    try {
      const data = await fetchJson<{
        participant: Participant;
        hasSubmitted: boolean;
        currentQuestion: Question | null;
        sessionStatus: string;
        countdownEndsAt: string | null;
        correctAnswer: string | null;
        userSubmission?: any;
        clubs?: Array<{ name: string; score: number }>;
      }>(`/api/participants/session?token=${encodeURIComponent(tok)}`);

      // A late response from an older poll must never overwrite a newer state.
      if (requestId !== sessionRequestRef.current) return;

      if (data.participant) {
        setParticipant(data.participant);
        setIsSessionLoading(false);
      }
      if (data.sessionStatus) {
        setStatus(data.sessionStatus);
      }
      setCountdownEndsAt(data.countdownEndsAt);
      setCorrectAnswer(data.correctAnswer);

      // Check if question changed
      if (data.currentQuestion && data.currentQuestion.id !== lastQuestionIdRef.current) {
        lastQuestionIdRef.current = data.currentQuestion.id;
        const cached = loadCachedAnswer();
        setSelectedAnswer(cached?.questionId === data.currentQuestion.id ? cached.answer : null);
      }

      setQuestion((current) => current?.id === data.currentQuestion?.id ? current : data.currentQuestion);
      const cachedAnswer = loadCachedAnswer();
      const answerForCurrentQuestion = data.currentQuestion && cachedAnswer?.questionId === data.currentQuestion.id
        ? cachedAnswer
        : null;
      // A successful API response is authoritative. This also lets a host reset
      // a question; failed polls never reach this branch and keep local state.
      setHasSubmitted(Boolean(data.hasSubmitted));
      if (data.userSubmission?.answer) {
        setSelectedAnswer(data.userSubmission.answer);
        if (data.currentQuestion) {
          saveCachedAnswer({ questionId: data.currentQuestion.id, answer: data.userSubmission.answer, submitted: true });
        }
      } else if (answerForCurrentQuestion) {
        setSelectedAnswer(answerForCurrentQuestion.answer);
        if (answerForCurrentQuestion.submitted) {
          saveCachedAnswer({ ...answerForCurrentQuestion, submitted: false });
        }
      }
      if (data.clubs) {
        const nextScores = {
          STACK_PUSH: data.clubs.find((club) => club.name === "STACK_PUSH")?.score ?? 0,
          IT_INNOVATORS: data.clubs.find((club) => club.name === "IT_INNOVATORS")?.score ?? 0,
        };
        setClubScores((current) =>
          current.STACK_PUSH === nextScores.STACK_PUSH && current.IT_INNOVATORS === nextScores.IT_INNOVATORS
            ? current
            : nextScores,
        );
      }
    } catch (_) {
      // Keep local cached state on transient network/serverless polling glitch
      if (requestId === sessionRequestRef.current) setIsSessionLoading(false);
    } finally {
      if (requestId === sessionRequestRef.current) sessionRequestInFlightRef.current = false;
    }
  };

  // Sync leaderboard scores
  const syncLeaderboard = async () => {
    const requestId = ++leaderboardRequestRef.current;
    try {
      const data = await fetchJson<{ clubs: Array<{ name: string; score: number }> }>("/api/leaderboard");
      if (requestId !== leaderboardRequestRef.current) return;
      if (data.clubs) {
        const nextScores = {
          STACK_PUSH: data.clubs.find((c) => c.name === "STACK_PUSH")?.score ?? 0,
          IT_INNOVATORS: data.clubs.find((c) => c.name === "IT_INNOVATORS")?.score ?? 0,
        };
        setClubScores((current) =>
          current.STACK_PUSH === nextScores.STACK_PUSH && current.IT_INNOVATORS === nextScores.IT_INNOVATORS
            ? current
            : nextScores,
        );
      }
    } catch (_) {}
  };

  // Session responses include club scores, so each student makes only one poll.
  useEffect(() => {
    if (sessionToken) {
      syncSession(sessionToken);
      syncLeaderboard();
    }

    const interval = setInterval(() => {
      if (sessionToken) syncSession(sessionToken);
    }, 2000);

    // Socket events for instantaneous push when supported
    socket.on("quiz:state", () => {
      if (sessionToken) syncSession(sessionToken);
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
      syncSession(res.participant.sessionToken, true);
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
      saveCachedAnswer({ questionId: question.id, answer: selectedAnswer, submitted: true });
      // Invalidate a poll that started before this answer was accepted.
      sessionRequestRef.current += 1;
      if (participant && res.participantScore !== undefined) {
        setParticipant({ ...participant, score: res.participantScore });
      }
      syncLeaderboard();
      syncSession(sessionToken, true);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to submit answer");
      // A request can reach the server even if the response was interrupted.
      syncSession(sessionToken, true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    if (confirm("Are you sure you want to exit or switch your student profile?")) {
      localStorage.removeItem("quizbattle-session");
      saveCachedAnswer(null);
      setSessionToken("");
      setParticipant(null);
    }
  };

  // --- 1. LOADING STATE (has token but participant not yet resolved) ---
  if (isSessionLoading) {
    return (
      <div className="app-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center", color: "var(--text-muted)" }}>
          <div style={{ fontSize: "2rem", marginBottom: "12px" }}>⏳</div>
          <div>Connecting to quiz...</div>
        </div>
      </div>
    );
  }

  // --- 2. RENDER JOIN / REGISTRATION FORM ---
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
                          saveCachedAnswer({ questionId: question.id, answer: key, submitted: false });
                          setErrorMessage("");
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
