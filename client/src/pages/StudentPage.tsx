import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Footer from "../components/Footer";
import { fetchJson, isSessionExpired, isParticipantKicked, type QuizMode } from "../services/api";
import { socket } from "../socket";

interface Participant {
  id: number;
  name: string;
  club: "STACK_PUSH" | "IT_INNOVATORS";
  score: number;
  sessionToken: string;
  bonusPoints?: number;
  fastestStreak?: number;
  correctResponseMs?: number;
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
    return raw ? (JSON.parse(raw) as CachedAnswer) : null;
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
  } catch (_) {
    return null;
  }
}

export default function StudentPage({ mode = "live" }: { mode?: QuizMode } = {}) {
  const navigate = useNavigate();
  const [sessionToken, setSessionToken] = useState<string>(() => {
    return localStorage.getItem("quizbattle-session") || "";
  });
  const [participant, setParticipantState] = useState<Participant | null>(() => {
    const token = localStorage.getItem("quizbattle-session");
    return token ? loadCachedParticipant() : null;
  });
  const [isSessionLoading, setIsSessionLoading] = useState<boolean>(() => {
    const token = localStorage.getItem("quizbattle-session");
    return !!token && !loadCachedParticipant();
  });

  const setParticipant = (p: Participant | null) => {
    setParticipantState((current) => {
      if (
        current &&
        p &&
        current.id === p.id &&
        current.name === p.name &&
        current.club === p.club &&
        current.score === p.score &&
        current.sessionToken === p.sessionToken
      )
        return current;
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
  const [regClub, setRegClub] = useState<"STACK_PUSH" | "IT_INNOVATORS" | "">("");
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState("");

  // Student portal gate — the host must open the portal before anyone can join.
  // Defaults to OPEN while we don't know yet, so the form never blocks on a
  // failed status check; the server is authoritative and rejects if closed.
  const [portalOpen, setPortalOpen] = useState(true);

  // Quiz state
  const [status, setStatus] = useState<string>("WAITING");
  const [question, setQuestion] = useState<Question | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null);
  const [sessionEndedMessage, setSessionEndedMessage] = useState<string | null>(null);

  // Timers: 5s Appearing Countdown & 30s Question Timer
  const [countdownEndsAt, setCountdownEndsAt] = useState<string | null>(null);
  const [countdownRemaining, setCountdownRemaining] = useState<number | null>(null);
  const [showGo, setShowGo] = useState(false);
  const [questionEndsAt, setQuestionEndsAt] = useState<string | null>(null);
  const [questionRemaining, setQuestionRemaining] = useState<number | null>(null);
  // Server-authoritative answer window for the current question (15/30/45s).
  const [durationSeconds, setDurationSeconds] = useState(30);

  // Connection health: last successful sync drives the subtle connecting banner
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [connectionStale, setConnectionStale] = useState(false);

  // TEST QUIZ warning modal (bilingual, shown BEFORE entering test mode)
  const [showTestWarning, setShowTestWarning] = useState(false);

  // 🛡️ TEST QUIZ anti-AI secure screen — fullscreen + tab-switch detection +
  // copy/paste lockdown while a test question is LIVE.
  const [securityViolations, setSecurityViolations] = useState(0);
  const [showSecurityAlert, setShowSecurityAlert] = useState(false);
  const [bonusToast, setBonusToast] = useState<number>(0);

  // Live Club Scores
  const [clubScores, setClubScores] = useState({
    STACK_PUSH: 0,
    IT_INNOVATORS: 0,
  });

  // A question is only shown after the host actually starts it. On first
  // login / reload a leftover or stale question NEVER appears — the student
  // stays on "WAITING FOR HOST TO START" until a countdown start is observed.
  const [quizStarted, setQuizStarted] = useState(false);
  const observedIdleRef = useRef(false);

  const lastQuestionIdRef = useRef<number | null>(null);
  const sessionRequestRef = useRef(0);
  const sessionRequestInFlightRef = useRef(false);

  // Called when the server reports this student's session is no longer valid
  // (401 + SESSION_EXPIRED / PARTICIPANT_KICKED). Clears local storage and
  // in-memory state, stops polling, and returns the student to the Join screen
  // with a clear, server-driven message.
  const handleSessionEnded = (message: string) => {
    localStorage.removeItem("quizbattle-session");
    localStorage.removeItem("quizbattle-participant");
    saveCachedAnswer(null);
    sessionRequestRef.current += 1;
    setSessionToken("");
    setParticipant(null);
    setStatus("WAITING");
    setQuestion(null);
    setSelectedAnswer(null);
    setHasSubmitted(false);
    setCorrectAnswer(null);
    setCountdownEndsAt(null);
    setQuestionEndsAt(null);
    setIsSessionLoading(false);
    setConnectionStale(false);
    setQuizStarted(false);
    observedIdleRef.current = false;
    setSessionEndedMessage(message);
  };

  // Individual removal by the host — distinct message so the student knows they
  // were kicked specifically (not a global logout).
  const handleKicked = () => {
    handleSessionEnded("You were removed by the host.");
  };

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
        questionEndsAt: string | null;
        durationSeconds?: number;
        correctAnswer: string | null;
        userSubmission?: any;
        clubs?: Array<{ name: string; score: number }>;
      }>(`/api/participants/session?token=${encodeURIComponent(tok)}`, undefined, mode);

      if (requestId !== sessionRequestRef.current) return;

      setLastSyncedAt(Date.now());
      setConnectionStale(false);

      if (data.participant) {
        setParticipant(data.participant);
        setIsSessionLoading(false);
      }
      if (data.sessionStatus) {
        setStatus(data.sessionStatus);
        // A question may only be shown after the host actually starts it.
        // First login / reload never shows a leftover question — the student
        // stays on "WAITING FOR HOST TO START" until they observe a countdown
        // start (or a quick-start after an idle state).
        if (data.sessionStatus === "PREPARING" || data.sessionStatus === "WAITING") {
          observedIdleRef.current = true;
        }
        if (
          data.sessionStatus === "COUNTDOWN" ||
          (data.sessionStatus === "LIVE" && observedIdleRef.current)
        ) {
          setQuizStarted(true);
        }
      }
      setCountdownEndsAt(data.countdownEndsAt);
      setQuestionEndsAt(data.questionEndsAt);
      setCorrectAnswer(data.correctAnswer);
      if (data.durationSeconds) setDurationSeconds(data.durationSeconds);

      // Check if question changed
      if (data.currentQuestion && data.currentQuestion.id !== lastQuestionIdRef.current) {
        lastQuestionIdRef.current = data.currentQuestion.id;
        const cached = loadCachedAnswer();
        setSelectedAnswer(cached?.questionId === data.currentQuestion.id ? cached.answer : null);
      }

      setQuestion((current) => (current?.id === data.currentQuestion?.id ? current : data.currentQuestion));
      const cachedAnswer = loadCachedAnswer();
      const answerForCurrentQuestion =
        data.currentQuestion && cachedAnswer?.questionId === data.currentQuestion.id ? cachedAnswer : null;

      setHasSubmitted(Boolean(data.hasSubmitted));
      if (data.userSubmission?.answer) {
        setSelectedAnswer(data.userSubmission.answer);
        if (data.currentQuestion) {
          saveCachedAnswer({ questionId: data.currentQuestion.id, answer: data.userSubmission.answer, submitted: true });
        }
      } else if (answerForCurrentQuestion) {
        setSelectedAnswer(answerForCurrentQuestion.answer);
      }
      if (data.clubs) {
        setClubScores({
          STACK_PUSH: data.clubs.find((club) => club.name === "STACK_PUSH")?.score ?? 0,
          IT_INNOVATORS: data.clubs.find((club) => club.name === "IT_INNOVATORS")?.score ?? 0,
        });
      }
    } catch (err) {
      if (isSessionExpired(err)) {
        handleSessionEnded(
          mode === "test" ? "Your test session was ended by the host." : "Your session was ended by the host.",
        );
        return;
      }
      if (isParticipantKicked(err)) {
        handleKicked();
        return;
      }
      if (requestId === sessionRequestRef.current) {
        setIsSessionLoading(false);
        // A failed poll means we simply don't know the current state — show a
        // connection banner rather than guessing/faking quiz state.
        setConnectionStale(true);
      }
    } finally {
      if (requestId === sessionRequestRef.current) sessionRequestInFlightRef.current = false;
    }
  };

  const syncLeaderboard = async () => {
    try {
      const data = await fetchJson<{ clubs: Array<{ name: string; score: number }> }>("/api/leaderboard", undefined, mode);
      if (data.clubs) {
        setClubScores({
          STACK_PUSH: data.clubs.find((c) => c.name === "STACK_PUSH")?.score ?? 0,
          IT_INNOVATORS: data.clubs.find((c) => c.name === "IT_INNOVATORS")?.score ?? 0,
        });
      }
    } catch (_) {}
  };

  useEffect(() => {
    if (sessionToken) {
      syncSession(sessionToken);
      syncLeaderboard();
    }

    // Poll faster while a question is actually running (countdown/live) so
    // status changes arrive sooner on mobile; idle states poll slower to keep
    // Redis traffic low. The countdown/GO reveal itself is client-timed, so
    // the question still appears at the exact same moment on every device.
    const pollMs = status === "LIVE" || status === "COUNTDOWN" ? 700 : 1200;
    const interval = setInterval(() => {
      if (sessionToken) syncSession(sessionToken);
    }, pollMs);

    socket.on("quiz:state", () => {
      if (sessionToken) syncSession(sessionToken);
      syncLeaderboard();
    });

    return () => {
      clearInterval(interval);
      socket.off("quiz:state");
    };
  }, [sessionToken, status]);

  // While the join form is shown, watch the portal status so students see
  // "portal closed — wait for the host" instead of guessing.
  useEffect(() => {
    if (participant) return;
    let cancelled = false;
    const checkPortal = async () => {
      try {
        const data = await fetchJson<{ session?: { portalOpen?: boolean } }>("/api/quiz-state", undefined, mode);
        if (!cancelled && data.session) {
          setPortalOpen((cur) => (cur === (data.session!.portalOpen !== false) ? cur : data.session!.portalOpen !== false));
        }
      } catch (_) {}
    };
    checkPortal();
    const interval = setInterval(checkPortal, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [participant, mode]);

  // Connection-stale indicator: if the server hasn't confirmed state within the
  // last few poll cycles, surface it clearly instead of showing stale quiz data.
  useEffect(() => {
    if (!sessionToken || !participant) {
      setConnectionStale(false);
      return;
    }
    const interval = setInterval(() => {
      if (lastSyncedAt && Date.now() - lastSyncedAt > 6000) {
        setConnectionStale(true);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [sessionToken, participant, lastSyncedAt]);

  // 🛡️ TEST MODE — ANTI-AI SECURE SCREEN
  // While a test question is LIVE the screen is locked: fullscreen is forced,
  // switching tabs/apps is detected and flagged, and copy/paste/context-menu /
  // text-selection are blocked. This is client-side deterrence — the server
  // remains the sole authority on scoring and never trusts the client.
  useEffect(() => {
    if (mode !== "test" || !participant) return;

    const flagViolation = () => {
      const isLiveQuestion = status === "LIVE" && !hasSubmitted;
      if (!isLiveQuestion) return;
      setSecurityViolations((v) => v + 1);
      setShowSecurityAlert(true);
      window.setTimeout(() => setShowSecurityAlert(false), 4000);
    };

    const onVisibility = () => {
      if (document.hidden) flagViolation();
    };
    const onBlur = () => flagViolation();
    const onCopy = (e: ClipboardEvent) => e.preventDefault();
    const onPaste = (e: ClipboardEvent) => e.preventDefault();
    const onCut = (e: ClipboardEvent) => e.preventDefault();
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    const onSelectStart = (e: Event) => e.preventDefault();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("copy", onCopy, true);
    document.addEventListener("cut", onCut, true);
    document.addEventListener("paste", onPaste, true);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("selectstart", onSelectStart);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("copy", onCopy, true);
      document.removeEventListener("cut", onCut, true);
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("selectstart", onSelectStart);
    };
  }, [mode, participant, status, hasSubmitted]);

  // 🛡️ TEST MODE — force fullscreen the moment a test question goes LIVE so
  // students cannot peek at other apps. Best-effort: some browsers require a
  // user gesture, so this is a deterrent, not a guarantee.
  useEffect(() => {
    if (mode !== "test" || status !== "LIVE" || !participant) return;
    const el = document.documentElement as HTMLElement & {
      requestFullscreen?: () => Promise<void>;
      webkitRequestFullscreen?: () => Promise<void>;
    };
    if (!document.fullscreenElement) {
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      req?.call(el).catch(() => {});
    }
  }, [mode, status, participant]);

  // 5-Second Question Appearing Countdown (5 → 4 → 3 → 2 → 1 → GO!)
  // The server's countdownEndsAt is the single source of truth for when the
  // question actually starts; this tick is purely cosmetic.
  useEffect(() => {
    if (!countdownEndsAt || status !== "COUNTDOWN") {
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
        setShowGo(true);
        // Reveal the preloaded question the instant the countdown ends — the
        // question was already delivered during COUNTDOWN, so every device
        // shows it at the exact same moment with zero extra network wait.
        setStatus("LIVE");
        // Immediately refetch so the server-side status catches up
        // (COUNTDOWN -> LIVE) instead of waiting for the next poll.
        if (sessionToken) void syncSession(sessionToken, true);
        setTimeout(() => setShowGo(false), 900);
      }
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 100);
    return () => clearInterval(timer);
  }, [countdownEndsAt, status, sessionToken]);

  // 30-Second Live Question Countdown timer tick logic
  useEffect(() => {
    if (!questionEndsAt || status !== "LIVE") {
      setQuestionRemaining(null);
      return;
    }

    const updateQTimer = () => {
      const remainingMs = new Date(questionEndsAt).getTime() - Date.now();
      const sec = Math.max(0, Math.ceil(remainingMs / 1000));
      setQuestionRemaining(sec);
      if (sec <= 0) {
        setStatus("LOCKED");
      }
    };

    updateQTimer();
    const timer = setInterval(updateQTimer, 100);
    return () => clearInterval(timer);
  }, [questionEndsAt, status]);

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
      }, mode);

      localStorage.setItem("quizbattle-session", res.participant.sessionToken);
      setSessionToken(res.participant.sessionToken);
      setSessionEndedMessage(null);
      setParticipant(res.participant);
      syncSession(res.participant.sessionToken, true);
    } catch (err: any) {
      setRegError(err.message || "Registration failed");
    } finally {
      setRegLoading(false);
    }
  };

  // Handle answer submission. The lock-in is OPTIMISTIC: the student's tap
  // gives instant "✓ Locked in" feedback (critical on slow mobile networks)
  // while the POST runs in the background. If the server rejects it, we
  // revert and show the real error.
  const handleSubmitAnswer = async () => {
    if (!selectedAnswer || !question || !sessionToken || hasSubmitted || submitting || status !== "LIVE") return;

    setSubmitting(true);
    setErrorMessage("");
    setHasSubmitted(true);
    saveCachedAnswer({ questionId: question.id, answer: selectedAnswer, submitted: true });

    try {
      const res = await fetchJson<{
        ok: boolean;
        submission: any;
        participantScore?: number;
        bonusAwarded?: number;
        fastestStreak?: number;
      }>("/api/questions/submit", {
        method: "POST",
        body: JSON.stringify({
          token: sessionToken,
          questionId: question.id,
          answer: selectedAnswer,
        }),
      }, mode);

      sessionRequestRef.current += 1;
      if (participant && res.participantScore !== undefined) {
        setParticipant({
          ...participant,
          score: res.participantScore,
          bonusPoints: participant.bonusPoints ?? 0,
          fastestStreak: res.fastestStreak ?? participant.fastestStreak ?? 0,
        });
      }
      // 🔥 FASTEST-STREAK BONUS toast — 3 correct + fastest answers in a row!
      if (res.bonusAwarded && res.bonusAwarded > 0) {
        setBonusToast(res.bonusAwarded);
        window.setTimeout(() => setBonusToast(0), 4000);
      }
      syncLeaderboard();
      syncSession(sessionToken, true);
    } catch (err: any) {
      // Revert the optimistic lock-in — the server never accepted it.
      setHasSubmitted(false);
      saveCachedAnswer(null);
      if (isSessionExpired(err)) {
        handleSessionEnded(
          mode === "test" ? "Your test session was ended by the host." : "Your session was ended by the host.",
        );
      } else if (isParticipantKicked(err)) {
        handleKicked();
      } else {
        setErrorMessage(err.message || "Failed to submit answer");
        syncSession(sessionToken, true);
      }
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
      setQuizStarted(false);
      observedIdleRef.current = false;
      setSessionEndedMessage(null);
    }
  };

  // --- 1. LOADING STATE ---
  if (isSessionLoading) {
    return (
      <div className="app-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center", color: "var(--text-muted)" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "12px" }}>⚡</div>
          <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>Connecting to Battle Arena...</div>
        </div>
        <Footer />
      </div>
    );
  }

  // --- 2. RENDER JOIN / REGISTRATION FORM WITH BATTLE HERO BANNER ---
  if (!participant) {
    return (
      <div className="app-shell">
        <div className="container-sm" style={{ marginTop: "30px", marginBottom: "40px" }}>
          <div className="glass-card" style={{ padding: "24px" }}>
            {sessionEndedMessage && (
              <div
                style={{
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1.5px solid #ef4444",
                  borderRadius: "12px",
                  padding: "14px 16px",
                  marginBottom: "16px",
                  textAlign: "center",
                  color: "#fca5a5",
                  fontWeight: 800,
                }}
              >
                ⚠️ {sessionEndedMessage}
              </div>
            )}

            {mode === "test" && (
              <div
                style={{
                  background: "rgba(245, 158, 11, 0.15)",
                  border: "1.5px solid #f59e0b",
                  borderRadius: "12px",
                  padding: "10px 14px",
                  marginBottom: "16px",
                  textAlign: "center",
                }}
              >
                <span style={{ fontWeight: 900, color: "#fcd34d", fontSize: "0.95rem", letterSpacing: "0.5px" }}>
                  🧪 TEST MODE — 60 QUESTIONS · 3 ROUNDS — NOT THE LIVE COLLEGE QUIZ
                </span>
              </div>
            )}

            {!portalOpen && (
              <div
                style={{
                  background: "rgba(245, 158, 11, 0.12)",
                  border: "1.5px solid #f59e0b",
                  borderRadius: "12px",
                  padding: "14px 16px",
                  marginBottom: "16px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontWeight: 900, color: "#fcd34d", fontSize: "1rem", letterSpacing: "0.5px" }}>
                  🔴 THE PORTAL IS CLOSED
                </div>
                <div style={{ color: "#fde68a", fontSize: "0.85rem", marginTop: "4px" }}>
                  The host hasn't opened registration yet. Please wait — as soon as they open the portal,
                  you'll be able to join right here.
                </div>
              </div>
            )}

            {/* Epic Battle Banner Image */}
            <div style={{ textAlign: "center", marginBottom: "20px" }}>
              <div
                style={{
                  position: "relative",
                  borderRadius: "16px",
                  overflow: "hidden",
                  border: "2px solid rgba(59, 130, 246, 0.4)",
                  boxShadow: "0 0 30px rgba(59, 130, 246, 0.25)",
                  marginBottom: "16px",
                }}
              >
                <img
                  src="/battle-hero.jpg"
                  alt="Quiz Battle Arena"
                  style={{
                    width: "100%",
                    maxHeight: "280px",
                    objectFit: "contain",
                    display: "block",
                    background: "rgba(0,0,0,0.3)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: "linear-gradient(to top, rgba(3, 7, 18, 0.95), transparent)",
                    padding: "16px 12px 8px",
                  }}
                >
                  <span
                    className="brand-badge"
                    style={{
                      background: "linear-gradient(135deg, #2563eb, #06b6d4)",
                      color: "#ffffff",
                      fontWeight: 900,
                      letterSpacing: "1.5px",
                      fontSize: "0.85rem",
                      boxShadow: "0 0 15px rgba(37, 99, 235, 0.5)",
                    }}
                  >
                    ⚡ ARE YOU READY FOR BATTLE? ⚡
                  </span>
                </div>
              </div>

              <div className="glossy-badge" style={{ display: "inline-block", marginBottom: "8px" }}>
                ⚡ TECHNICAL BATTLE ⚡
              </div>
              <h1 className="brand-title battle-title" style={{ fontSize: "1.9rem", margin: "6px 0 4px" }}>
                {mode === "test" ? "IT Club Championship — TEST MODE" : "IT Club Championship"}
              </h1>
              <div className="vs-divider">
                <span className="vs-side vs-stack">⚡ Stack.push</span>
                <span className="vs-badge">VS</span>
                <span className="vs-side vs-innovators">🚀 IT Innovators</span>
              </div>
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: "6px" }}>
                {mode === "test" ? "60-Question Tech Battle — 3 Rounds · Speed + Accuracy = Victory" : "Live Tech Battle — Speed + Accuracy = Victory"}
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
                disabled={regLoading || !regName.trim() || !regClub || !portalOpen}
                style={{ fontSize: "1.05rem", padding: "14px" }}
              >
                {regLoading
                  ? "Entering Battle Arena..."
                  : !portalOpen
                    ? "⏳ WAITING FOR HOST TO OPEN PORTAL..."
                    : mode === "test"
                      ? "ENTER TEST QUIZ →"
                      : "ENTER LIVE QUIZ →"}
              </button>

              {/* TEST QUIZ access — visible but deliberately gated behind a warning */}
              {mode === "live" && (
                <button
                  type="button"
                  className="btn btn-test-quiz btn-block"
                  onClick={() => setShowTestWarning(true)}
                  style={{ marginTop: "12px", padding: "12px", fontSize: "0.95rem" }}
                >
                  🧪 TEST QUIZ / टेस्ट क्विज़
                </button>
              )}

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

            {/* TEST QUIZ bilingual warning — shown BEFORE any test-mode entry */}
            {showTestWarning && (
              <div className="modal-backdrop" onClick={() => setShowTestWarning(false)}>
                <div
                  className="modal-card test-warning-modal"
                  onClick={(e) => e.stopPropagation()}
                  role="dialog"
                  aria-modal="true"
                  aria-label="Test quiz warning"
                >
                  <div className="test-warning-title">🧪 TEST QUIZ / टेस्ट क्विज़</div>
                  <div className="test-warning-sub">
                    ⚠️ FOR CONNECTION CHECKING ONLY
                    <br />
                    ⚠️ केवल कनेक्शन जाँचने के लिए
                  </div>
                  <div className="test-warning-body">
                    <p>
                      This is ONLY for checking the connection and testing the QuizBattle system.
                    </p>
                    <p style={{ marginTop: "8px" }}>
                      DO NOT OPEN THIS UNLESS THE HOST/ORGANIZER HAS TOLD YOU TO.
                    </p>
                    <p style={{ marginTop: "8px", fontWeight: 700, color: "#fbbf24" }}>
                      🎯 The test battle has 60 questions in 3 rounds — R1: 15s · R2: 30s · R3: 45s.
                      Winners are decided by correct answers AND speed, with 🔥 bonus points for 3
                      fastest-in-a-row. Anti-AI secure mode is ON.
                    </p>
                    <hr style={{ border: "none", borderTop: "1px solid var(--border-subtle)", margin: "14px 0" }} />
                    <p>यह केवल कनेक्शन जाँचने और QuizBattle सिस्टम का परीक्षण करने के लिए है।</p>
                    <p style={{ marginTop: "8px" }}>जब तक होस्ट/ऑर्गनाइज़र आपको न कहे, इसे न खोलें।</p>
                  </div>
                  <div className="modal-actions">
                    <button className="btn btn-secondary" onClick={() => setShowTestWarning(false)}>
                      वापस जाएँ · Go Back
                    </button>
                    <button
                      className="btn btn-warning"
                      onClick={() => {
                        setShowTestWarning(false);
                        navigate("/test");
                      }}
                    >
                      टेस्ट क्विज़ में जाएँ · Enter Test Quiz
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // --- 3. RENDER LIVE STUDENT QUIZ INTERFACE ---
  const isClubStack = participant.club === "STACK_PUSH";

  // The question may only be shown once the host has actually started one.
  // On first login (or reload) a leftover/stale question never appears.
  const questionVisible =
    quizStarted && question !== null && (status === "LIVE" || status === "LOCKED" || status === "REVEALED");
  const badgeStatus = quizStarted || status === "FINISHED" ? status : "WAITING";

  return (
    <div className="app-shell">
      {/* 5-Second Question Appearing Countdown Overlay (5 → 4 → 3 → 2 → 1 → GO!) */}
      {(countdownRemaining !== null && countdownRemaining > 0) || showGo ? (
        <div className="countdown-overlay">
          {showGo ? (
            <div className="countdown-go">GO!</div>
          ) : (
            <div className="countdown-number">{countdownRemaining}</div>
          )}
          <div className="countdown-label">⚡ GET READY FOR QUESTION {question?.questionNumber || 1}! ⚡</div>
        </div>
      ) : null}

      {/* Connection health — never fake quiz state; show the truth instead */}
      {connectionStale && sessionToken && (
        <div className="connection-banner">
          <span className="pulse-dot" /> Reconnecting… if this persists, check your internet connection.
        </div>
      )}

      {/* 🔥 FASTEST-STREAK BONUS toast — 3 correct + fastest answers in a row */}
      {bonusToast > 0 && (
        <div className="bonus-toast">
          🔥 BONUS +{bonusToast} PTS — 3 FASTEST CORRECT IN A ROW!
        </div>
      )}

      {/* 🛡️ TEST MODE anti-AI alert — detected tab/app switch during a live question */}
      {showSecurityAlert && mode === "test" && (
        <div className="security-alert">
          ⚠️ LEAVING THE TEST SCREEN DETECTED ({securityViolations}) — AI/EXTERNAL HELP IS NOT ALLOWED!
        </div>
      )}

      <div className="container" style={{ maxWidth: 860, margin: "0 auto" }}>
        {mode === "test" && (
          <div
            style={{
              background: "rgba(245, 158, 11, 0.18)",
              border: "2px solid #f59e0b",
              borderRadius: "12px",
              padding: "10px 16px",
              marginBottom: "14px",
              textAlign: "center",
            }}
          >
            <span style={{ fontWeight: 900, color: "#fcd34d", letterSpacing: "1px" }}>
              🧪 TEST MODE — 60 QUESTIONS · 3 ROUNDS — NOT THE LIVE COLLEGE QUIZ
            </span>
          </div>
        )}
        {/* Top Header Card */}
        <div className="glass-card" style={{ marginBottom: "18px", padding: "16px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span
                  style={{
                    display: "inline-block",
                    padding: "4px 10px",
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
                <span style={{ fontSize: "1.15rem", fontWeight: 800 }}>{participant.name}</span>
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
                {(participant.bonusPoints || 0) > 0 && (
                  <div style={{ fontSize: "0.7rem", fontWeight: 800, color: "#fb923c", marginTop: "2px" }}>
                    🔥 +{participant.bonusPoints} bonus{(participant.fastestStreak || 0) >= 3 ? ` · ${participant.fastestStreak}-streak` : ""}
                  </div>
                )}
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
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {badgeStatus === "LIVE" && <span className="badge badge-live"><span className="pulse-dot" /> LIVE</span>}
              {badgeStatus === "COUNTDOWN" && <span className="badge badge-countdown"><span className="pulse-dot" /> 5s TIMER</span>}
              {badgeStatus === "PREPARING" && <span className="badge badge-preparing">HOST IS PREPARING</span>}
              {badgeStatus === "WAITING" && <span className="badge badge-waiting">WAITING FOR HOST</span>}
              {badgeStatus === "LOCKED" && <span className="badge badge-locked">LOCKED</span>}
              {badgeStatus === "REVEALED" && <span className="badge badge-revealed">REVEALED</span>}
              {badgeStatus === "FINISHED" && <span className="badge badge-finished">QUIZ COMPLETED</span>}
            </div>

            {question && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span className="question-round-title">{question.roundName}</span>
                <span className="question-points-pill">+{question.points} {question.points === 1 ? "Pt" : "Pts"}</span>
              </div>
            )}
          </div>

          {/* ACTIVE QUESTION STATE (LIVE / LOCKED / REVEALED) */}
          {questionVisible ? (
            <div className="student-question-container" style={{ marginTop: "18px" }}>
              {/* 🛡️ TEST MODE secure badge — shown while a test question is live */}
              {mode === "test" && status === "LIVE" && (
                <div className="secure-mode-badge">
                  🛡️ SECURE TEST MODE — NO COPY · NO TAB-SWITCH · FULLSCREEN
                </div>
              )}

              {/* 30-Second Live Question Timer Bar */}
              {status === "LIVE" && questionRemaining !== null && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    background: questionRemaining <= 5 ? "rgba(239, 68, 68, 0.2)" : "rgba(30, 41, 59, 0.75)",
                    border: `1.5px solid ${questionRemaining <= 5 ? "#ef4444" : "#3b82f6"}`,
                    borderRadius: "10px",
                    padding: "8px 14px",
                    marginBottom: "14px",
                    boxShadow: questionRemaining <= 5 ? "0 0 15px rgba(239, 68, 68, 0.4)" : "none",
                  }}
                >
                  <div
                    style={{
                      fontSize: "1.2rem",
                      fontWeight: 900,
                      fontFamily: "var(--font-mono)",
                      color: questionRemaining <= 5 ? "#f87171" : "#38bdf8",
                      minWidth: "65px",
                    }}
                  >
                    ⏱️ {questionRemaining}s
                  </div>
                  <div style={{ flex: 1, background: "rgba(255,255,255,0.1)", borderRadius: "999px", height: "8px", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.min(100, Math.max(0, (questionRemaining / durationSeconds) * 100))}%`,
                        background: questionRemaining <= 5 ? "#ef4444" : "linear-gradient(90deg, #3b82f6, #10b981)",
                        transition: "width 0.1s linear",
                      }}
                    />
                  </div>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)" }}>
                    {questionRemaining <= 5 ? "HURRY!" : `${durationSeconds}s Limit`}
                  </span>
                </div>
              )}

              {/* Question Text Box */}
              <div className="question-text-box">
                <div className="question-num-tag">Question {question.questionNumber} of {mode === "test" ? 60 : 100}</div>
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
              <div className="submit-bar" style={{ marginTop: "16px" }}>
                {status === "LIVE" && !hasSubmitted && (
                  <button
                    className="btn btn-success btn-block btn-lg"
                    onClick={handleSubmitAnswer}
                    disabled={!selectedAnswer || submitting}
                    style={{ padding: "16px", fontSize: "1.1rem" }}
                  >
                    {submitting ? "Submitting..." : selectedAnswer ? `⚔️ LOCK IN OPTION ${selectedAnswer} →` : "Select an Option Above to Submit"}
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
                    ✓ Option {selectedAnswer} Locked in! Waiting for host to reveal...
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
                    🔒 {durationSeconds} Seconds are up! Answers locked by host.
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
          ) : status === "PREPARING" && quizStarted ? (
            /* POLISHED HOST-PREPARATION WAITING SCREEN */
            <div className="status-state-card preparing-state">
              <div className="preparing-animation" aria-hidden="true">
                <span className="float-shape shape-1">✦</span>
                <span className="float-shape shape-2">⚡</span>
                <span className="float-shape shape-3">🚀</span>
                <span className="float-shape shape-4">?</span>
                <div className="pulse-ring" />
                <div className="preparing-clock">⏳</div>
              </div>
              <h2 className="preparing-title">Be Patient ✨</h2>
              <p className="preparing-sub">Host is preparing everything.</p>
              <p className="preparing-sub2">Your quiz will begin shortly.</p>
              <div className="animated-dots" aria-label="waiting">
                <span />
                <span />
                <span />
              </div>
            </div>
          ) : (
            /* WAITING (between questions) OR FINISHED STATE */
            <div className="status-state-card" style={{ padding: "36px 20px" }}>
              <div className="status-icon-bubble">
                {status === "FINISHED" ? "🏆" : "⚡"}
              </div>
              <h2 style={{ fontSize: "1.5rem", fontWeight: 800, marginTop: "10px" }}>
                {status === "FINISHED"
                  ? "QUIZ BATTLE FINISHED!"
                  : quizStarted
                    ? "Waiting for Host to Start Question..."
                    : "Waiting for Host to Start..."}
              </h2>
              <p style={{ color: "var(--text-muted)", maxWidth: 480, margin: "8px auto 0" }}>
                {status === "FINISHED"
                  ? "Thank you for participating! Check the big projector screen for final results."
                  : quizStarted
                    ? "As soon as the host launches the question, a 5-second countdown will appear followed by a timer to answer!"
                    : "The host will start the quiz from their dashboard. When a question starts, it will appear here automatically."}
              </p>
              {status === "FINISHED" && (
                <a
                  href={mode === "test" ? "/test/results" : "/results"}
                  className="btn btn-warning btn-lg"
                  style={{ marginTop: "18px", fontWeight: 900, fontSize: "1rem" }}
                >
                  🏆 View Final Results & Certificates
                </a>
              )}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
