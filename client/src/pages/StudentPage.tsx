import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Footer from "../components/Footer";
import QuestionText from "../components/QuestionText";
import TimerRing from "../components/TimerRing";
import BackgroundFX from "../components/BackgroundFX";
import CinematicControls from "../components/CinematicControls";
import { fetchJson, isSessionExpired, isParticipantKicked, type QuizMode } from "../services/api";
import { useRealtime, type QuizStateEvent } from "../services/realtime";
import { sfx } from "../lib/sound";

interface Participant {
  id: number;
  name: string;
  club: "STACK_PUSH" | "IT_INNOVATORS";
  score: number;
  sessionToken: string;
  basePoints?: number;
  speedBonusPoints?: number;
  correctResponseMs?: number;
}

interface TeamResult {
  club: string;
  score: number;
  basePoints: number;
  speedBonus: number;
  correctAnswers: number;
  totalCorrectResponseMs: number;
  requiredMembers: number;
  contributedMembers: number;
  eligible: boolean;
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
  // While true, the live question is BLANKED: a screenshot of the app switcher
  // or a backgrounded tab shows nothing (anti-AI / anti-screen-read).
  const [screenHidden, setScreenHidden] = useState(false);
  // ⚡ Fastest-finger speed-bonus toast — shown when this student's answer
  // earned a speed bonus (1st/2nd/3rd fastest correct).
  const [speedToast, setSpeedToast] = useState<{ rank: number; bonus: number } | null>(null);
  const speedToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 🏆 Server-authoritative team winner — computed server-side from the
  // eligible-team algorithm (see computeTeamResults), never derived locally.
  const [teamWinner, setTeamWinner] = useState<string | null>(null);
  const [teamResults, setTeamResults] = useState<TeamResult[]>([]);

  // Live Club Scores
  const [clubScores, setClubScores] = useState({
    STACK_PUSH: 0,
    IT_INNOVATORS: 0,
  });

  // Live participant count — driven by realtime events, never polled.
  const [participantsCount, setParticipantsCount] = useState(0);
  // Subtle participant activity toast (+1 / disconnected) — event-driven.
  const [participantToast, setParticipantToast] = useState<string | null>(null);
  const participantToastRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showParticipantToast = (msg: string) => {
    setParticipantToast(msg);
    if (participantToastRef.current) clearTimeout(participantToastRef.current);
    participantToastRef.current = setTimeout(() => setParticipantToast(null), 2600);
  };

  // 🏆 Winners (top 3) — fetched when the quiz finishes so students see the
  // podium right on their phone the moment the winner is declared.
  const [topStudents, setTopStudents] = useState<Array<{
    rank: number;
    name: string;
    club: string;
    score: number;
    correctCount: number;
  }>>([]);

  // A question is only shown after the host actually starts it. On first
  // login / reload a leftover or stale question NEVER appears — the student
  // stays on "WAITING FOR HOST TO START" until a countdown start is observed.
  const [quizStarted, setQuizStarted] = useState(false);

  // Cinematic question intro — a fast ROUND → QUESTION reveal overlay when a
  // new question begins. Short (≈1.2s) so the question stays readable fast.
  const [questionIntro, setQuestionIntro] = useState<{ roundName: string; questionNumber: number } | null>(null);
  const introTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const observedIdleRef = useRef(false);
  const lastQuestionIdRef = useRef<number | null>(null);
  const sessionRequestRef = useRef(0);
  const sessionRequestInFlightRef = useRef(false);
  // Tracks the last observed server status so the top-3 widget only refreshes
  // when an answer is revealed (cheap: no per-submit leaderboard calls).
  const prevStatusRef = useRef<string | null>(null);

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

  // Stale/past countdown protection. The server's countdownEndsAt is the single
  // authoritative source: a reconnecting student resumes mid-countdown from the
  // absolute timestamp (never restarts at 5), and an event whose deadline has
  // already passed (stale question / late reconnect) never starts a fresh
  // 5→4→3→2→1 — the server has already moved on to LIVE.
  const applyCountdownEndsAt = (value: string | null) => {
    if (value && new Date(value).getTime() <= Date.now()) {
      setCountdownEndsAt(null);
      return;
    }
    setCountdownEndsAt(value);
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
        // Refresh the top-3 widget only when the answer is revealed — club
        // scores already ride along on this poll (data.clubs), so per-submit
        // leaderboard calls would be pure extra Redis cost.
        const prevStatus = prevStatusRef.current;
        prevStatusRef.current = data.sessionStatus;
        if (data.sessionStatus === "REVEALED" && prevStatus !== "REVEALED") {
          syncLeaderboard();
        }
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
      applyCountdownEndsAt(data.countdownEndsAt);
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
      const data = await fetchJson<{
        clubs: Array<{ name: string; score: number }>;
        topStudents?: Array<{ rank: number; name: string; club: string; score: number; correctCount: number }>;
        teamResults?: TeamResult[];
        teamWinner?: string | null;
      }>("/api/leaderboard", undefined, mode);
      if (data.clubs) {
        setClubScores({
          STACK_PUSH: data.clubs.find((c) => c.name === "STACK_PUSH")?.score ?? 0,
          IT_INNOVATORS: data.clubs.find((c) => c.name === "IT_INNOVATORS")?.score ?? 0,
        });
      }
      if (data.topStudents) setTopStudents(data.topStudents);
      if (data.teamResults) setTeamResults(data.teamResults);
      if (data.teamWinner !== undefined) setTeamWinner(data.teamWinner);
    } catch (_) {}
  };

  // Realtime synchronization — single path. The socket delivers every state
  // change as an event (applied locally, no refetch); REST is used only for
  // the initial sync, reconnect recovery, and the slow disconnected fallback
  // (Vercel/outages). No per-second polling anywhere.
  useRealtime({
    mode,
    // Initial sync + reconnect recovery + fallback heartbeat. The student
    // portal (join form) only needs the portal-open flag, so it resyncs the
    // lightweight quiz-state endpoint instead of the session poll.
    resync: () => {
      if (sessionToken) {
        syncSession(sessionToken);
        syncLeaderboard();
      } else {
        void checkPortal();
      }
    },
    // Disconnected fallback cadence (unchanged from the old poll cadence so
    // Vercel behaves exactly as before); connected mode uses the 30s
    // heartbeat safety net instead.
    // The 5-second countdown is short — poll every 1s while it runs so the
    // REST fallback (Vercel / disconnected socket) can never skip past it and
    // land the student directly on LIVE without seeing 5→4→3→2→1→GO.
    pollMs:
      status === "LOCKED" ? 3000 :
      status === "COUNTDOWN" ? 1000 :
      status === "LIVE" ? 10000 :
      status === "WAITING" || status === "REVEALED" ? 8000 :
      15000,
    onState: (payload) => applyRealtimeState(payload),
    onLeaderboard: (payload) => {
      if (payload.clubs) {
        setClubScores({
          STACK_PUSH: payload.clubs.find((c) => c.name === "STACK_PUSH")?.score ?? 0,
          IT_INNOVATORS: payload.clubs.find((c) => c.name === "IT_INNOVATORS")?.score ?? 0,
        });
      }
      if (payload.topStudents) setTopStudents(payload.topStudents);
    },
    onJoined: (p) => {
      if (p.participantsCount !== undefined) setParticipantsCount(p.participantsCount);
      if (p.name) {
        showParticipantToast(`+1 PARTICIPANT — ${p.name}`);
        sfx.participantJoined();
      }
    },
    onLeft: (p) => {
      if (p.participantsCount !== undefined) setParticipantsCount(p.participantsCount);
      if (p.name) showParticipantToast(`PARTICIPANT DISCONNECTED — ${p.name}`);
    },
  });

  // Apply a pushed quiz:state snapshot to local state — mirrors the relevant
  // parts of syncSession() without any network fetch.
  const applyRealtimeState = (payload: QuizStateEvent) => {
    const session = payload?.session;
    if (!session) return;
    setLastSyncedAt(Date.now());
    setConnectionStale(false);

    const newStatus = session.status ?? "WAITING";
    // Refresh the top-3 widget only when the answer is revealed.
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = newStatus;
    if (newStatus === "REVEALED" && prevStatus !== "REVEALED") syncLeaderboard();
    if (newStatus === "FINISHED" && prevStatus !== "FINISHED") syncLeaderboard();

    setStatus(newStatus);
    // A question may only be shown after the host actually starts it.
    if (newStatus === "PREPARING" || newStatus === "WAITING") observedIdleRef.current = true;
    if (newStatus === "COUNTDOWN" || (newStatus === "LIVE" && observedIdleRef.current)) setQuizStarted(true);

    // Cinematic intro + sound when a fresh question starts (COUNTDOWN).
    if (newStatus === "COUNTDOWN" && session.currentQuestionId) {
      const q = (payload.currentQuestion ?? null) as Question | null;
      if (q && q.id !== lastQuestionIdRef.current) {
        setQuestionIntro({ roundName: q.roundName, questionNumber: q.questionNumber });
        sfx.questionStart();
        if (introTimerRef.current) clearTimeout(introTimerRef.current);
        introTimerRef.current = setTimeout(() => setQuestionIntro(null), 1400);
      }
    }

    applyCountdownEndsAt(session.countdownEndsAt ?? null);
    setQuestionEndsAt(session.questionEndsAt ?? null);
    setCorrectAnswer(session.correctAnswer ?? null);
    if (session.durationSeconds) setDurationSeconds(session.durationSeconds);
    if (session.portalOpen !== undefined) setPortalOpen(session.portalOpen);

    // Question change: restore the locally cached answer for the new question
    // and clear the previous question's submission state.
    const q = (payload.currentQuestion ?? null) as Question | null;
    if (q && q.id !== lastQuestionIdRef.current) {
      lastQuestionIdRef.current = q.id;
      const cached = loadCachedAnswer();
      setSelectedAnswer(cached?.questionId === q.id ? cached.answer : null);
      setHasSubmitted(false);
    }
    setQuestion((current) => (current?.id === q?.id ? current : q));

    if (payload.clubs) {
      setClubScores({
        STACK_PUSH: payload.clubs.find((c) => c.name === "STACK_PUSH")?.score ?? 0,
        IT_INNOVATORS: payload.clubs.find((c) => c.name === "IT_INNOVATORS")?.score ?? 0,
      });
    }
    if (payload.participantsCount !== undefined) setParticipantsCount(payload.participantsCount);
    // Sound cues on state transitions (opt-in; silent by default).
    if (newStatus === "REVEALED") {
      const mine = selectedAnswer;
      if (mine && session.correctAnswer) sfx[mine === session.correctAnswer ? "correct" : "wrong"]();
    }
    if (newStatus === "FINISHED") sfx.finished();
  };



  // While the join form is shown, watch the portal status so students see
  // "portal closed — wait for the host" instead of guessing. Event-driven via
  // the realtime layer (quiz:state carries portalOpen); this direct check is
  // only used as the initial fetch / disconnected fallback.
  const checkPortal = async () => {
    try {
      const data = await fetchJson<{ session?: { portalOpen?: boolean } }>("/api/quiz-state", undefined, mode);
      if (data.session) {
        setPortalOpen((cur) => (cur === (data.session!.portalOpen !== false) ? cur : data.session!.portalOpen !== false));
      }
    } catch (_) {}
  };

  // Connection-stale indicator: if the server hasn't confirmed state within the
  // last few poll cycles, surface it clearly instead of showing stale quiz data.
  // The threshold comfortably exceeds the slowest poll cadence (LIVE polls
  // every 10s by design), so a healthy device never shows a false alarm.
  useEffect(() => {
    if (!sessionToken || !participant) {
      setConnectionStale(false);
      return;
    }
    const interval = setInterval(() => {
      if (lastSyncedAt && Date.now() - lastSyncedAt > 16000) {
        setConnectionStale(true);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [sessionToken, participant, lastSyncedAt]);

  // 🛡️ ANTI-AI SECURE SCREEN (live + test)
  // While a question is LIVE the screen is locked: fullscreen is forced,
  // switching tabs/apps is detected and flagged, and copy/paste/context-menu /
  // text-selection are blocked. This is client-side deterrence — the server
  // remains the sole authority on scoring and never trusts the client. A
  // name watermark overlays the question so any screenshot/photo is traceable.
  useEffect(() => {
    if (!participant) return;

    const flagViolation = () => {
      const isLiveQuestion = status === "LIVE" && !hasSubmitted;
      if (!isLiveQuestion) return;
      setSecurityViolations((v) => v + 1);
      setShowSecurityAlert(true);
      window.setTimeout(() => setShowSecurityAlert(false), 4000);
    };

    const onVisibility = () => {
      if (document.hidden) {
        setScreenHidden(true);
        flagViolation();
      } else {
        setScreenHidden(false);
      }
    };
    const onBlur = () => {
      setScreenHidden(true);
      flagViolation();
    };
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

  // 🛡️ force fullscreen the moment a question goes LIVE so students cannot
  // peek at other apps. Best-effort: some browsers require a user gesture, so
  // this is a deterrent, not a guarantee.
  useEffect(() => {
    if (status !== "LIVE" || !participant) return;
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
    sfx.answerLock();

    try {
      const res = await fetchJson<{
        ok: boolean;
        submission: any;
        participantScore?: number;
        basePoints?: number;
        speedBonusPoints?: number;
        speedRank?: number;
        speedBonus?: number;
        earnedPoints?: number;
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
          basePoints: res.basePoints ?? participant.basePoints ?? 0,
          speedBonusPoints: res.speedBonusPoints ?? participant.speedBonusPoints ?? 0,
        });
      }
      // ⚡ Fastest-finger feedback — only when this answer earned a speed bonus
      // (1st/2nd/3rd fastest correct). Wrong answers and rank 4+ show nothing.
      if (res.speedBonus && res.speedBonus > 0 && res.speedRank && res.speedRank > 0) {
        setSpeedToast({ rank: res.speedRank, bonus: res.speedBonus });
        if (speedToastTimerRef.current) clearTimeout(speedToastTimerRef.current);
        speedToastTimerRef.current = setTimeout(() => setSpeedToast(null), 4000);
      }
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
        <BackgroundFX />
        <CinematicControls compact />
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
        <BackgroundFX />
        <CinematicControls compact />
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
                  TEST MODE — 50 QUESTIONS · 3 ROUNDS — NOT THE LIVE COLLEGE QUIZ
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
                  border: "2px solid #3b82f6",
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
                    background: "rgba(3, 7, 18, 0.85)",
                    padding: "16px 12px 8px",
                  }}
                >
                  <span
                    className="brand-badge"
                    style={{
                      background: "#2563eb",
                      color: "#ffffff",
                      fontWeight: 900,
                      letterSpacing: "1.5px",
                      fontSize: "0.85rem",
                    }}
                  >
                    ARE YOU READY FOR BATTLE?
                  </span>
                </div>
              </div>

              <div className="glossy-badge" style={{ display: "inline-block", marginBottom: "8px" }}>
                TECHNICAL BATTLE
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
                {mode === "test" ? "50-Question Tech Battle — 3 Rounds · Speed + Accuracy = Victory" : "Live Tech Battle — Speed + Accuracy = Victory"}
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
                      The test battle has 50 questions in 3 rounds — 15s (Round 1) / 45s
                      (Rounds 2–3). Scoring = base points + speed bonus: the 1st/2nd/3rd
                      fastest correct answer earns +3/+2/+1. A club can only win when EVERY
                      member contributes at least once. Anti-AI secure mode is ON.
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
      <BackgroundFX />
      <CinematicControls compact />

      {/* Cinematic question intro — ROUND → QUESTION reveal. Plays during the
          first second of the 5s countdown (countdownRemaining 5 or null for the
          first tick), so the full 4→3→2→1 is still visible after it fades. */}
      {questionIntro && (countdownRemaining === null || countdownRemaining >= 5) && (
        <div className="question-intro-overlay" key={questionIntro.questionNumber}>
          <div className="intro-round">{questionIntro.roundName}</div>
          <div className="intro-question">QUESTION {questionIntro.questionNumber}</div>
        </div>
      )}

      {/* 5-Second Question Appearing Countdown Overlay (5 → 4 → 3 → 2 → 1 → GO!) */}
      {(countdownRemaining !== null && countdownRemaining > 0) || showGo ? (
        <div className="countdown-overlay">
          {showGo ? (
            <div className="countdown-go">GO!</div>
          ) : (
            <div className="countdown-number">{countdownRemaining}</div>
          )}
          <div className="countdown-label">GET READY FOR QUESTION {question?.questionNumber || 1}</div>
        </div>
      ) : null}

      {/* Connection health — never fake quiz state; show the truth instead */}
      {connectionStale && sessionToken && (
        <div className="connection-banner">
          <span className="pulse-dot" /> Reconnecting… if this persists, check your internet connection.
        </div>
      )}

      {/* ⚡ Fastest-finger speed-bonus toast — 1st/2nd/3rd fastest correct */}
      {speedToast && (
        <div className="bonus-toast">
          ⚡ {speedToast.rank === 1 ? "FASTEST" : speedToast.rank === 2 ? "2ND FASTEST" : "3RD FASTEST"} +{speedToast.bonus} SPEED BONUS
        </div>
      )}

      {/* Participant activity toast — live join/leave feedback */}
      {participantToast && (
        <div className="participant-toast">
          <span className="pulse-dot" /> {participantToast}
        </div>
      )}

      {/* 🛡️ anti-AI alert — detected tab/app switch during a live question */}
      {showSecurityAlert && (
        <div className="security-alert">
          ⚠️ LEAVING THE QUIZ SCREEN DETECTED ({securityViolations}) — AI/EXTERNAL HELP IS NOT ALLOWED!
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
              TEST MODE — 50 QUESTIONS · 3 ROUNDS — NOT THE LIVE COLLEGE QUIZ
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
                {(participant.basePoints || 0) > 0 || (participant.speedBonusPoints || 0) > 0 ? (
                  <div style={{ fontSize: "0.7rem", fontWeight: 800, color: "#fb923c", marginTop: "2px" }}>
                    BASE {participant.basePoints || 0} · ⚡ SPEED +{participant.speedBonusPoints || 0}
                  </div>
                ) : null}
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
          {/* Live participants — event-driven count, never polled */}
          <div className="live-participants-pill">
            <span className="pulse-dot" /> LIVE PARTICIPANTS
            <span className="live-count">{participantsCount} ONLINE</span>
          </div>
        </div>

        {/* Club vs Club battle bar — animated head-to-head score */}
        <div className="club-battle-bar" style={{ marginBottom: "18px" }}>
          <div className="battle-club stack">
            <span className="battle-club-name">⚡ Stack.push</span>
            <span className="battle-club-score">{clubScores.STACK_PUSH}</span>
          </div>
          <div className="battle-track">
            <div
              className="battle-fill stack-fill"
              style={{
                width: `${(() => {
                  const total = clubScores.STACK_PUSH + clubScores.IT_INNOVATORS;
                  return total === 0 ? 50 : Math.round((clubScores.STACK_PUSH / total) * 100);
                })()}%`,
              }}
            />
            <div className="battle-vs">VS</div>
          </div>
          <div className="battle-club innovators">
            <span className="battle-club-name">🚀 IT Innovators</span>
            <span className="battle-club-score">{clubScores.IT_INNOVATORS}</span>
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
              {/* 🛡️ secure badge — shown while a question is live */}
              {status === "LIVE" && (
                <div className="secure-mode-badge">
                  SECURE MODE — NO COPY · NO TAB-SWITCH · FULLSCREEN · WATERMARKED
                </div>
              )}

              {/* 🛡️ BLANKED while the app is hidden — screenshots of the app
                  switcher / a backgrounded tab show nothing, so AI screen
                  readers cannot harvest the question. Returns instantly when
                  the student comes back. */}
              {screenHidden && status === "LIVE" && !hasSubmitted && (
                <div className="screen-hidden-blank">
                  <div className="screen-hidden-inner">
                    <div style={{ fontSize: "2.4rem" }}>🔒</div>
                    <div className="screen-hidden-title">YOU LEFT THE QUIZ SCREEN</div>
                    <div className="screen-hidden-sub">
                      {participant ? `${participant.name} — ` : ""}staying on the quiz screen is mandatory.
                      <br />
                      The question was hidden. Return to this tab to continue.
                    </div>
                  </div>
                </div>
              )}

              {/* Cinematic circular countdown — runs client-side from the
                  server's authoritative questionEndsAt. Zero Redis traffic. */}
              {status === "LIVE" && questionRemaining !== null && (
                <div className="timer-ring-row">
                  <TimerRing remaining={questionRemaining} total={durationSeconds} label="SECONDS" />
                  <div className="timer-ring-side">
                    <div className="timer-ring-status">
                      {questionRemaining <= 5 ? "CRITICAL" : questionRemaining <= durationSeconds * 0.25 ? "HURRY" : "LIVE"}
                    </div>
                    <div className="timer-ring-hint">
                      {questionRemaining <= 5 ? "Final seconds — lock in now!" : `Answer within ${durationSeconds}s to score`}
                    </div>
                  </div>
                </div>
              )}

              {/* Question Text Box */}
              <div className="question-text-box">
                <div className="question-num-tag">Question {question.questionNumber} of {mode === "test" ? 50 : 100}</div>
                <QuestionText className="question-main-text" text={question.questionText} />
              </div>

              {/* 🛡️ Anti-cheat name watermark — makes any screenshot/photo
                  of this phone traceable to the student (both modes). */}
              {status === "LIVE" && !hasSubmitted && participant && (
                <div className="screen-watermark" aria-hidden="true">
                  {`${participant.name} · ${participant.club === "STACK_PUSH" ? "⚡ Stack.push" : "🚀 IT Innovators"}`}
                </div>
              )}

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
                          sfx.answerSelect();
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
                    {submitting ? "Submitting..." : selectedAnswer ? `LOCK IN OPTION ${selectedAnswer} →` : "Select an Option Above to Submit"}
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
                    {durationSeconds} Seconds are up! Answers locked by host.
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
                        ? `CORRECT! +${question.points} Points Earned!`
                        : selectedAnswer
                          ? `Incorrect! Correct Answer was Option ${correctAnswer}`
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
              <h2 className="preparing-title">Be Patient</h2>
              <p className="preparing-sub">Host is preparing everything.</p>
              <p className="preparing-sub2">Your quiz will begin shortly.</p>
              <div className="animated-dots" aria-label="waiting">
                <span />
                <span />
                <span />
              </div>
            </div>
          ) : status === "FINISHED" ? (
            /* 🏆 FINISHED — winners declared, shown right on the student's phone */
            <div className="status-state-card" style={{ padding: "30px 18px" }}>
              <div className="status-icon-bubble">🏆</div>
              <h2 style={{ fontSize: "1.5rem", fontWeight: 900, marginTop: "10px" }}>
                QUIZ BATTLE FINISHED!
              </h2>
              <p style={{ color: "var(--text-muted)", margin: "8px auto 0" }}>
                The winner has been declared — here are your champions 🎉
              </p>

              {/* Winning club banner — server-authoritative (eligible team with
                  the highest score; never derived from local score comparison) */}
              {(() => {
                const champion = teamWinner;
                const championColor = champion === "STACK_PUSH" ? "#60a5fa" : "#34d399";
                const championTitle =
                  champion === "TIE"
                    ? "🤝 TEAM TIE — both clubs finished exactly equal!"
                    : champion
                      ? `🏆 ${champion === "STACK_PUSH" ? "⚡ Stack.push" : "🚀 IT Innovators"} is the CHAMPION CLUB!`
                      : "No eligible team — every club member must contribute at least once.";
                return (
                  <div
                    style={{
                      marginTop: "16px",
                      padding: "12px 14px",
                      borderRadius: "12px",
                      border: `2px solid ${champion && champion !== "TIE" ? championColor : "#fbbf24"}`,
                      background: champion && champion !== "TIE" ? `${championColor}1f` : "rgba(251, 191, 36, 0.1)",
                    }}
                  >
                    <div style={{ fontWeight: 900, fontSize: "1.05rem", color: champion && champion !== "TIE" ? championColor : "#fbbf24" }}>
                      {championTitle}
                    </div>
                    {teamResults.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "10px" }}>
                        {teamResults.map((t) => (
                          <div
                            key={t.club}
                            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", fontSize: "0.8rem", fontWeight: 700 }}
                          >
                            <span style={{ color: t.club === "STACK_PUSH" ? "#60a5fa" : "#34d399", whiteSpace: "nowrap" }}>
                              {t.club === "STACK_PUSH" ? "⚡ Stack.push" : "🚀 IT Innovators"}
                            </span>
                            <span style={{ color: "var(--text-muted)", flex: 1, textAlign: "right", fontSize: "0.72rem" }}>
                              BASE {t.basePoints} · ⚡ SPEED +{t.speedBonus} · CONTRIBUTORS {t.contributedMembers}/{t.requiredMembers} · {t.eligible ? "ELIGIBLE" : "INELIGIBLE"}
                            </span>
                            <span style={{ fontWeight: 900, color: "#fbbf24", fontFamily: "var(--font-mono)" }}>{t.score}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Top 3 podium */}
              {topStudents.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "16px" }}>
                  {topStudents.map((s, idx) => (
                    <div
                      key={s.name + s.club + s.rank}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "10px 12px",
                        borderRadius: "12px",
                        background: idx === 0 ? "rgba(251, 191, 36, 0.14)" : "rgba(255,255,255,0.04)",
                        border: idx === 0 ? "1.5px solid #f59e0b" : "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <span style={{ fontSize: "1.8rem" }}>{["🥇", "🥈", "🥉"][idx]}</span>
                      <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
                        <div style={{ fontWeight: 900, fontSize: "1.05rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {s.name}
                        </div>
                        <div style={{ fontSize: "0.78rem", fontWeight: 700, color: s.club === "STACK_PUSH" ? "#60a5fa" : "#34d399" }}>
                          {s.club === "STACK_PUSH" ? "⚡ Stack.push" : "🚀 IT Innovators"} · {s.score} pts · ✓ {s.correctCount}
                        </div>
                      </div>
                      <span style={{ fontSize: "0.8rem", fontWeight: 900, color: ["#fbbf24", "#cbd5e1", "#d48c54"][idx] }}>
                        {["1st", "2nd", "3rd"][idx]}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Student's own standing — certificates are admin-only, shared by the host */}
              <div style={{ marginTop: "14px", fontSize: "0.95rem", fontWeight: 800, color: "#fbbf24" }}>
                Your score: {participant.score} pts
                {topStudents.some((t) => t.name === participant.name)
                  ? " — you're on the podium! 🎉"
                  : " — thanks for battling!"}
              </div>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "14px" }}>
                Certificate winners are announced by the host.
              </p>
            </div>
          ) : (
            /* WAITING (between questions) */
            <div className="status-state-card" style={{ padding: "36px 20px" }}>
              <div className="status-icon-bubble">⚡</div>
              <h2 style={{ fontSize: "1.5rem", fontWeight: 800, marginTop: "10px" }}>
                {quizStarted ? "Waiting for Host to Start Question..." : "Waiting for Host to Start..."}
              </h2>
              <p style={{ color: "var(--text-muted)", maxWidth: 480, margin: "8px auto 0" }}>
                {quizStarted
                  ? "As soon as the host launches the question, a 5-second countdown will appear followed by a timer to answer!"
                  : "The host will start the quiz from their dashboard. When a question starts, it will appear here automatically."}
              </p>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
