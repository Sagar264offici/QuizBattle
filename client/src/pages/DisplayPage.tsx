import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import Footer from "../components/Footer";
import QuestionText from "../components/QuestionText";
import TimerRing from "../components/TimerRing";
import BackgroundFX from "../components/BackgroundFX";
import { fetchJson, type QuizMode } from "../services/api";
import { useRealtime, type QuizStateEvent } from "../services/realtime";

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

interface TopStudent {
  rank: number;
  name: string;
  club: string;
  score: number;
  correctCount: number;
}

interface FastestTap {
  participantName: string;
  club: string;
  responseTimeMs: number;
  responseTimeSec: string;
  questionNumber: number;
  answer: string;
}

export default function DisplayPage({ mode = "live" }: { mode?: QuizMode } = {}) {
  const [status, setStatus] = useState("WAITING");
  const [question, setQuestion] = useState<Question | null>(null);
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null);
  const [countdownEndsAt, setCountdownEndsAt] = useState<string | null>(null);
  const [countdownRemaining, setCountdownRemaining] = useState<number | null>(null);
  const [showGo, setShowGo] = useState(false);
  const [questionEndsAt, setQuestionEndsAt] = useState<string | null>(null);
  const [questionRemaining, setQuestionRemaining] = useState<number | null>(null);
  // Server-authoritative answer window for the current question (15/30/45s).
  const [durationSeconds, setDurationSeconds] = useState(30);

  // Previous question answer — shown on projector while next question is live
  const [prevAnswer, setPrevAnswer] = useState<{ questionNumber: number; correctAnswer: string; optionA: string; optionB: string; optionC: string; optionD: string } | null>(null);

  const [clubScores, setClubScores] = useState({ STACK_PUSH: 0, IT_INNOVATORS: 0 });
  const [topStudents, setTopStudents] = useState<TopStudent[]>([]);
  const [fastestTap, setFastestTap] = useState<FastestTap | null>(null);
  // 🏆 Server-authoritative team winner + standings (see computeTeamResults).
  const [teamWinner, setTeamWinner] = useState<string | null>(null);
  const [teamResults, setTeamResults] = useState<Array<{
    club: string;
    score: number;
    basePoints: number;
    speedBonus: number;
    correctAnswers: number;
    totalCorrectResponseMs: number;
    requiredMembers: number;
    contributedMembers: number;
    eligible: boolean;
  }>>([]);

  // Realtime sync — one event-driven path. The socket pushes every state
  // change (applied locally, zero Redis cost); REST is used only for the
  // initial sync, reconnect recovery, and the slow disconnected fallback.
  // While COUNTDOWN runs, the fallback polls every 1s so the 5-second
  // countdown can never be skipped past on the REST-only path.
  useRealtime({
    mode,
    resync: () => {
      void syncState();
    },
    pollMs: status === "COUNTDOWN" ? 1000 : 30000,
    onState: (payload) => applyRealtimeState(payload),
    onLeaderboard: (payload) => {
      if (payload.clubs) {
        setClubScores({
          STACK_PUSH: payload.clubs.find((c) => c.name === "STACK_PUSH")?.score ?? 0,
          IT_INNOVATORS: payload.clubs.find((c) => c.name === "IT_INNOVATORS")?.score ?? 0,
        });
      }
      if (payload.topStudents) setTopStudents(payload.topStudents);
      if (payload.fastestTap !== undefined) setFastestTap(payload.fastestTap as FastestTap);
      if ((payload as any).teamResults) setTeamResults((payload as any).teamResults);
      if ((payload as any).teamWinner !== undefined) setTeamWinner((payload as any).teamWinner);
    },
    onReveal: (payload) => {
      if (payload.correctAnswer) setCorrectAnswer(payload.correctAnswer);
      setStatus("REVEALED");
    },
  });

  // Apply a pushed quiz:state snapshot locally — mirrors syncState() without
  // any network fetch.
  const applyRealtimeState = (payload: QuizStateEvent) => {
    const session = payload?.session;
    const curQ = (payload?.currentQuestion ?? null) as Question | null;
    if (session) {
      setStatus(session.status ?? "WAITING");
      setCorrectAnswer(session.correctAnswer ?? null);
      // Stale/past countdown protection: a countdown whose authoritative
      // deadline has passed (stale event / late reconnect) never starts a
      // fresh 5→4→3→2→1 — the server has already moved on to LIVE.
      if (session.countdownEndsAt && new Date(session.countdownEndsAt).getTime() <= Date.now()) {
        setCountdownEndsAt(null);
      } else {
        setCountdownEndsAt(session.countdownEndsAt ?? null);
      }
      setQuestionEndsAt(session.questionEndsAt ?? null);
      if (session.durationSeconds) setDurationSeconds(session.durationSeconds);
    }
    setQuestion((current) => (current?.id === curQ?.id ? current : curQ));

    // Track previous question answer for the projector banner.
    const answer = session?.correctAnswer;
    if (answer && curQ && (session?.status === "REVEALED" || session?.status === "WAITING" || session?.status === "LIVE")) {
      setPrevAnswer((prev) => {
        if (session?.status === "REVEALED" && answer) {
          return { questionNumber: curQ.questionNumber, correctAnswer: answer, optionA: curQ.optionA, optionB: curQ.optionB, optionC: curQ.optionC, optionD: curQ.optionD };
        }
        if (prev && curQ.questionNumber !== prev.questionNumber) return prev;
        return prev;
      });
    }
  };

  const syncState = async () => {
    try {
      const [stateData, leaderboardData] = await Promise.all([
        fetchJson<{
          session: {
            status: string;
            currentQuestionId: number | null;
            countdownEndsAt: string | null;
            questionEndsAt: string | null;
            correctAnswer: string | null;
            durationSeconds?: number;
          };
          currentQuestion: Question | null;
        }>("/api/quiz-state", undefined, mode),
        fetchJson<{
          clubs: Array<{ name: string; score: number }>;
          topStudents?: TopStudent[];
          fastestTap?: FastestTap | null;
          teamResults?: Array<{
            club: string;
            score: number;
            basePoints: number;
            speedBonus: number;
            correctAnswers: number;
            totalCorrectResponseMs: number;
            requiredMembers: number;
            contributedMembers: number;
            eligible: boolean;
          }>;
          teamWinner?: string | null;
        }>("/api/leaderboard", undefined, mode),
      ]);
      applyRealtimeState({
        session: stateData.session,
        currentQuestion: stateData.currentQuestion as unknown as Record<string, unknown> | null,
      });
      if (leaderboardData.clubs) {
        setClubScores({
          STACK_PUSH: leaderboardData.clubs.find((c) => c.name === "STACK_PUSH")?.score ?? 0,
          IT_INNOVATORS: leaderboardData.clubs.find((c) => c.name === "IT_INNOVATORS")?.score ?? 0,
        });
      }
      if (leaderboardData.topStudents) setTopStudents(leaderboardData.topStudents);
      if (leaderboardData.fastestTap !== undefined) setFastestTap(leaderboardData.fastestTap);
      if (leaderboardData.teamResults) setTeamResults(leaderboardData.teamResults);
      if (leaderboardData.teamWinner !== undefined) setTeamWinner(leaderboardData.teamWinner);
    } catch (_) {}
  };

  useEffect(() => {
    void syncState();
  }, []);

  // 5s Appearing Countdown tick (5 → 4 → 3 → 2 → 1 → GO!)
  useEffect(() => {
    if (!countdownEndsAt || status !== "COUNTDOWN") { setCountdownRemaining(null); return; }
    const tick = () => {
      const sec = Math.ceil((new Date(countdownEndsAt).getTime() - Date.now()) / 1000);
      if (sec > 0) setCountdownRemaining(sec);
      else {
        setCountdownRemaining(null);
        setCountdownEndsAt(null);
        setShowGo(true);
        setStatus("LIVE");
        setTimeout(() => setShowGo(false), 900);
      }
    };
    tick();
    const timer = setInterval(tick, 100);
    return () => clearInterval(timer);
  }, [countdownEndsAt, status]);

  // 30s Live Question Timer tick
  useEffect(() => {
    if (!questionEndsAt || status !== "LIVE") { setQuestionRemaining(null); return; }
    const tick = () => {
      const sec = Math.max(0, Math.ceil((new Date(questionEndsAt).getTime() - Date.now()) / 1000));
      setQuestionRemaining(sec);
    };
    tick();
    const timer = setInterval(tick, 200);
    return () => clearInterval(timer);
  }, [questionEndsAt, status]);

  const isStackLeading = clubScores.STACK_PUSH > clubScores.IT_INNOVATORS;
  const isInnovatorsLeading = clubScores.IT_INNOVATORS > clubScores.STACK_PUSH;

  // Join link for students — the same one the admin copies on the host page.
  const joinUrl = `${window.location.origin}${mode === "test" ? "/test" : "/student"}`;

  const podiumEmojis = ["🥇", "🥈", "🥉"];
  const podiumColors = ["#fbbf24", "#94a3b8", "#cd7f32"];
  const clubLabel = (c: string) => c === "STACK_PUSH" ? "Stack.push" : "IT Innovators";
  const clubColor = (c: string) => c === "STACK_PUSH" ? "#60a5fa" : "#34d399";

  return (
    <div className="projector-shell">
      <BackgroundFX />
      {/* 5-Second Fullscreen Projector Countdown */}
      {(countdownRemaining !== null && countdownRemaining > 0) || showGo ? (
        <div className="countdown-overlay">
          {showGo ? (
            <div className="countdown-go" style={{ fontSize: "12rem" }}>GO!</div>
          ) : (
            <div className="countdown-number" style={{ fontSize: "12rem" }}>{countdownRemaining}</div>
          )}
          <div className="countdown-label" style={{ fontSize: "2.5rem" }}>
            READY FOR BATTLE — QUESTION {question?.questionNumber || 1}
          </div>
        </div>
      ) : null}

      {/* Main Container */}
      <div className="projector-grid">
        {/* Left Column: Big Stage Question & Options */}
        <div className="projector-question-card">
          {/* Header Bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid var(--border-subtle)", paddingBottom: "18px", flexWrap: "wrap", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <span
                className="brand-badge"
                style={{
                  fontSize: "1rem",
                  padding: "6px 14px",
                  background: mode === "test" ? "#f59e0b" : undefined,
                  color: mode === "test" ? "#030712" : undefined,
                }}
              >
                {mode === "test" ? "TEST MODE — 50 QUESTIONS" : "IT CLUB BATTLE"}
              </span>
              <span style={{ fontSize: "1.4rem", fontWeight: 800, color: "#e2e8f0" }}>
                {question?.roundName || "Round 1"}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
              {status === "LIVE" && (
                <span className="badge badge-live" style={{ fontSize: "1.1rem", padding: "6px 18px", background: "rgba(239, 68, 68, 0.2)", border: "1.5px solid #ef4444", color: "#f87171" }}>
                  <span className="pulse-dot" /> ⏱️ {questionRemaining !== null ? `${questionRemaining}s` : "LIVE"}
                </span>
              )}
              {status === "LOCKED" && <span className="badge badge-locked" style={{ fontSize: "1rem", padding: "6px 16px" }}>LOCKED</span>}
              {status === "REVEALED" && <span className="badge badge-revealed" style={{ fontSize: "1rem", padding: "6px 16px" }}>ANSWER REVEALED</span>}
              {status === "PREPARING" && <span className="badge badge-preparing" style={{ fontSize: "1rem", padding: "6px 16px" }}>HOST IS PREPARING</span>}
              {status === "WAITING" && <span className="badge badge-waiting" style={{ fontSize: "1rem", padding: "6px 16px" }}>WAITING FOR HOST</span>}
              {question && <span className="question-points-pill" style={{ fontSize: "1rem", padding: "6px 14px" }}>+{question.points} {question.points === 1 ? "Pt" : "Pts"}</span>}
            </div>
          </div>

          {/* Question State Display */}
          {question && (status === "LIVE" || status === "LOCKED" || status === "REVEALED") ? (
            <div>
              {/* Cinematic circular countdown (large — projector readable) */}
              {status === "LIVE" && questionRemaining !== null && (
                <div className="projector-timer-row">
                  <TimerRing remaining={questionRemaining} total={durationSeconds} label="SECONDS" size={150} />
                  <div className="projector-timer-digits">
                    <div className={questionRemaining <= 5 ? "timer-ring-status critical" : "timer-ring-status"}>
                      {questionRemaining <= 5 ? "CRITICAL" : "LIVE"}
                    </div>
                    <div className="projector-timer-bar">
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.min(100, Math.max(0, (questionRemaining / durationSeconds) * 100))}%`,
                          background: questionRemaining <= 5 ? "#ef4444" : "#3b82f6",
                          transition: "width 0.2s linear",
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#38bdf8", marginTop: "20px" }}>
                QUESTION {question.questionNumber} OF {mode === "test" ? 50 : 100}
              </div>
              <QuestionText className="projector-question-text" text={question.questionText} />

              <div className="projector-options-grid">
                {(["A", "B", "C", "D"] as const).map((key) => {
                  const optionText = question[`option${key}`];
                  const isCorrect = status === "REVEALED" && correctAnswer === key;
                  return (
                    <div key={key} className={`projector-option-box ${isCorrect ? "correct" : ""}`}>
                      <div className="option-letter" style={{
                        width: "48px", height: "48px", fontSize: "1.5rem",
                        background: isCorrect ? "#10b981" : "rgba(255, 255, 255, 0.1)",
                        color: isCorrect ? "#030712" : "#f8fafc",
                      }}>{key}</div>
                      <div style={{ flex: 1 }}>{optionText}</div>
                      {isCorrect && <span style={{ color: "#10b981", fontSize: "1.8rem" }}>✓</span>}
                    </div>
                  );
                })}
              </div>

              {/* Previous Question Answer Banner — shown while a new question is live */}
              {status === "LIVE" && prevAnswer && question && prevAnswer.questionNumber !== question.questionNumber && (
                <div style={{
                  marginTop: "18px",
                  padding: "14px 18px",
                  borderRadius: "12px",
                  background: "rgba(16, 185, 129, 0.12)",
                  border: "2px solid #10b981",
                }}>
                  <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "#34d399", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px" }}>
                    ✓ PREVIOUS ANSWER — Q{prevAnswer.questionNumber}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ fontSize: "1.6rem", fontWeight: 900, color: "#10b981", fontFamily: "var(--font-mono)" }}>
                      {prevAnswer.correctAnswer}
                    </span>
                    <span style={{ fontSize: "1rem", color: "#e2e8f0", fontWeight: 600 }}>
                      {prevAnswer[`option${prevAnswer.correctAnswer as "A" | "B" | "C" | "D"}`]}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : status === "FINISHED" ? (
            /* 🏆 FINISHED — projector shows the winner podium */
            <div style={{ textAlign: "center", padding: "40px 24px" }}>
              <h1 style={{ fontSize: "2.6rem", fontWeight: 900, letterSpacing: "-1px" }}>
                QUIZ BATTLE FINISHED!
              </h1>
              <p style={{ fontSize: "1.2rem", color: "var(--text-muted)", marginTop: "10px" }}>
                Winner declared — congratulations to all champions!
              </p>

              {/* Champion club banner — server-authoritative: the eligible
                  team with the highest score (see computeTeamResults), never a
                  local score comparison. */}
              {(() => {
                const champion = teamWinner;
                const championColor = champion === "STACK_PUSH" ? "#60a5fa" : "#34d399";
                const championTitle =
                  champion === "TIE"
                    ? "MATCH TIED — TEAM TIE!"
                    : champion
                      ? `${champion === "STACK_PUSH" ? "STACK.PUSH" : "IT INNOVATORS"} — CHAMPION!`
                      : "NO ELIGIBLE TEAM — every club member must contribute";
                return (
                  <div
                    style={{
                      display: "inline-block",
                      marginTop: "22px",
                      padding: "16px 44px",
                      borderRadius: "18px",
                      border: `3px solid ${champion && champion !== "TIE" ? championColor : "#fbbf24"}`,
                      background: champion && champion !== "TIE" ? `${championColor}1f` : "rgba(251, 191, 36, 0.12)",
                    }}
                  >
                    <div style={{ fontSize: "3rem", lineHeight: 1 }}>
                      {champion === "STACK_PUSH" ? "⚡" : champion === "IT_INNOVATORS" ? "🚀" : "🤝"}
                    </div>
                    <div style={{ fontSize: "2rem", fontWeight: 900, color: champion && champion !== "TIE" ? championColor : "#fbbf24", marginTop: "4px" }}>
                      {championTitle}
                    </div>
                    <div style={{ fontSize: "1.15rem", fontWeight: 700, color: "#e2e8f0", marginTop: "6px" }}>
                      ⚡ Stack.push {clubScores.STACK_PUSH} pts &nbsp;vs&nbsp; 🚀 IT Innovators {clubScores.IT_INNOVATORS} pts
                    </div>
                    {teamResults.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "12px", fontSize: "0.95rem", fontWeight: 700 }}>
                        {teamResults.map((t) => (
                          <div key={t.club} style={{ display: "flex", justifyContent: "center", gap: "14px" }}>
                            <span style={{ color: t.club === "STACK_PUSH" ? "#60a5fa" : "#34d399" }}>
                              {t.club === "STACK_PUSH" ? "⚡ STACK.PUSH" : "🚀 IT INNOVATORS"}
                            </span>
                            <span style={{ color: "#cbd5e1" }}>BASE {t.basePoints}</span>
                            <span style={{ color: "#fbbf24" }}>SPEED +{t.speedBonus}</span>
                            <span style={{ color: t.eligible ? "#4ade80" : "#f87171" }}>
                              {t.contributedMembers}/{t.requiredMembers} · {t.eligible ? "ELIGIBLE" : "INELIGIBLE"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Top 3 podium */}
              {topStudents.length > 0 && (
                <div style={{ display: "flex", justifyContent: "center", gap: "20px", marginTop: "30px", flexWrap: "wrap" }}>
                  {topStudents.map((s, idx) => (
                    <div
                      key={s.name + s.club + s.rank}
                      style={{
                        width: 250,
                        padding: "18px 14px",
                        borderRadius: "16px",
                        background: idx === 0 ? "rgba(251, 191, 36, 0.16)" : "rgba(255,255,255,0.04)",
                        border: idx === 0 ? "2px solid #fbbf24" : "1px solid rgba(255,255,255,0.1)",
                      }}
                    >
                      <div style={{ fontSize: "3.2rem", lineHeight: 1 }}>{podiumEmojis[idx]}</div>
                      <div style={{ fontSize: "1.6rem", fontWeight: 900, color: podiumColors[idx], marginTop: "6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.name}
                      </div>
                      <div style={{ fontSize: "1rem", fontWeight: 800, color: clubColor(s.club) }}>
                        {clubLabel(s.club)}
                      </div>
                      <div style={{ fontSize: "2rem", fontWeight: 900, color: "#fbbf24", fontFamily: "var(--font-mono)", marginTop: "6px" }}>
                        {s.score} pts
                      </div>
                      <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>✓ {s.correctCount} correct</div>
                    </div>
                  ))}
                </div>
              )}

              <a
                href={mode === "test" ? "/test/results" : "/results"}
                className="btn btn-warning btn-lg"
                style={{
                  marginTop: "26px",
                  fontSize: "1.3rem",
                  fontWeight: 900,
                  padding: "16px 34px",
                  display: "inline-block",
                  boxShadow: "0 0 30px rgba(245, 158, 11, 0.35)",
                }}
              >
                VIEW FINAL RESULTS — TOP 3 + CERTIFICATES
              </a>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <img
                src="/battle-hero.jpg"
                alt="Battle Logo"
                style={{
                  width: "100%",
                  maxWidth: "340px",
                  height: "auto",
                  objectFit: "contain",
                  borderRadius: "18px",
                  margin: "0 auto 24px",
                  display: "block",
                  border: "3px solid rgba(59, 130, 246, 0.5)",
                  boxShadow: "0 0 40px rgba(59, 130, 246, 0.3)",
                }}
              />
              <h1 style={{ fontSize: "2.4rem", fontWeight: 900, letterSpacing: "-1px" }}>
                {status === "PREPARING"
                  ? "BE PATIENT — HOST IS PREPARING"
                  : "GET READY FOR THE NEXT BATTLE QUESTION"}
              </h1>
              <p style={{ fontSize: "1.2rem", color: "var(--text-muted)", marginTop: "12px" }}>
                {status === "PREPARING"
                  ? "The quiz will begin shortly — keep your devices ready!"
                  : "Host will launch the 5-second countdown shortly"}
              </p>
            </div>
          )}
        </div>

        {/* Right Column: Join QR + Scoreboard + Top 3 + Fastest Tap */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* 📱 SCAN TO JOIN — QR code to the live quiz */}
          <div className="glass-card" style={{ padding: "16px 18px", textAlign: "center", border: "1.5px solid rgba(59, 130, 246, 0.4)", boxShadow: "0 0 25px rgba(59, 130, 246, 0.2)" }}>
            <div style={{ fontSize: "0.8rem", color: "#38bdf8", textTransform: "uppercase", fontWeight: 800, letterSpacing: "1px", marginBottom: "10px" }}>
              Scan to Join the Battle
            </div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <div style={{ background: "#ffffff", padding: "10px", borderRadius: "12px", display: "inline-block" }}>
                <QRCode value={joinUrl} size={148} fgColor="#0f172a" bgColor="#ffffff" style={{ display: "block" }} />
              </div>
            </div>
            <div style={{ marginTop: "10px", fontSize: "0.85rem", fontWeight: 700, color: "#e2e8f0" }}>
              {mode === "test" ? "Test Quiz" : "IT Club Battle"}
            </div>
            <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "2px", wordBreak: "break-all" }}>
              {joinUrl}
            </div>
          </div>

          {/* STACK.PUSH SCORE */}
          <div className="score-card stack" style={{
            padding: "22px 20px",
            boxShadow: isStackLeading ? "0 0 30px rgba(59, 130, 246, 0.4)" : "none",
            borderWidth: isStackLeading ? "3px" : "1.5px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="score-card-title" style={{ fontSize: "1rem" }}>STACK.PUSH</div>
              {isStackLeading && (
                <span style={{ fontSize: "0.8rem", fontWeight: 900, color: "#fbbf24", background: "rgba(245, 158, 11, 0.2)", padding: "3px 8px", borderRadius: "6px" }}>★ LEADER</span>
              )}
            </div>
            <div className="score-card-points" style={{ fontSize: "3.5rem", lineHeight: 1.1, marginTop: "6px" }}>{clubScores.STACK_PUSH}</div>
          </div>

          {/* IT INNOVATORS SCORE */}
          <div className="score-card innovators" style={{
            padding: "22px 20px",
            boxShadow: isInnovatorsLeading ? "0 0 30px rgba(16, 185, 129, 0.4)" : "none",
            borderWidth: isInnovatorsLeading ? "3px" : "1.5px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="score-card-title" style={{ fontSize: "1rem" }}>IT INNOVATORS</div>
              {isInnovatorsLeading && (
                <span style={{ fontSize: "0.8rem", fontWeight: 900, color: "#fbbf24", background: "rgba(245, 158, 11, 0.2)", padding: "3px 8px", borderRadius: "6px" }}>★ LEADER</span>
              )}
            </div>
            <div className="score-card-points" style={{ fontSize: "3.5rem", lineHeight: 1.1, marginTop: "6px" }}>{clubScores.IT_INNOVATORS}</div>
          </div>

          {/* Head-to-head battle track — animated score proportion */}
          <div className="glass-card" style={{ padding: "10px 14px" }}>
            <div className="battle-track" style={{ marginBottom: 0 }}>
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
          </div>

          {/* ⚡ FASTEST-FINGER — speed counts toward the winner ranking */}
          <div className="glass-card" style={{ padding: "10px 16px", textAlign: "center", border: "1.5px solid rgba(251, 191, 36, 0.3)" }}>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.5px" }}>
              Scoring = Base Points + Speed Bonus · 1st/2nd/3rd fastest correct = +3/+2/+1 · Team wins only when every member contributes
            </div>
          </div>

          {/* ⚡ FASTEST TAP */}
          <div className="glass-card" style={{
            padding: "16px 18px",
            background: fastestTap ? "rgba(251, 191, 36, 0.1)" : undefined,
            border: fastestTap ? "2px solid #f59e0b" : undefined,
          }}>
            <div style={{ fontSize: "0.8rem", color: "#fbbf24", textTransform: "uppercase", fontWeight: 800, letterSpacing: "1px", marginBottom: "6px" }}>
              Fastest Correct Tap
            </div>
            {fastestTap ? (
              <div>
                <div style={{ fontSize: "1.3rem", fontWeight: 900, color: "#f8fafc" }}>{fastestTap.participantName}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: 700, color: clubColor(fastestTap.club) }}>
                    {clubLabel(fastestTap.club)}
                  </span>
                  <span style={{ fontSize: "1.1rem", fontWeight: 900, color: "#fbbf24", background: "rgba(251, 191, 36, 0.15)", padding: "2px 10px", borderRadius: "8px" }}>
                    {fastestTap.responseTimeSec}s
                  </span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "4px" }}>
                  Q{fastestTap.questionNumber} · Answer: {fastestTap.answer}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: "0.9rem", color: "#64748b" }}>Waiting for first correct answer...</div>
            )}
          </div>

          {/* 🏆 TOP 3 STUDENTS (All-Time Podium) */}
          <div className="glass-card" style={{ padding: "16px 18px" }}>
            <div style={{ fontSize: "0.8rem", color: "#38bdf8", textTransform: "uppercase", fontWeight: 800, letterSpacing: "1px", marginBottom: "10px" }}>
              Top 3 Students
            </div>
            {topStudents.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {topStudents.map((s, idx) => (
                  <div key={s.name + s.club} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "8px 10px",
                    borderRadius: "10px",
                    background: idx === 0 ? "rgba(251, 191, 36, 0.14)" : "rgba(255, 255, 255, 0.04)",
                    border: idx === 0 ? "1px solid #f59e0b" : "1px solid rgba(255,255,255,0.06)",
                    transition: "all 0.4s ease",
                  }}>
                    <span style={{ fontSize: "1.5rem", width: "32px", textAlign: "center" }}>{podiumEmojis[idx]}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontWeight: 800,
                        fontSize: "1rem",
                        color: podiumColors[idx],
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>{s.name}</div>
                      <div style={{ fontSize: "0.75rem", color: clubColor(s.club), fontWeight: 700 }}>
                        {clubLabel(s.club)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 900, fontSize: "1.2rem", color: "#f8fafc" }}>{s.score}</div>
                      <div style={{ fontSize: "0.65rem", color: "#64748b" }}>{s.correctCount} correct</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: "0.9rem", color: "#64748b" }}>No scores yet...</div>
            )}
          </div>

          {/* Match Status */}
          <div className="glass-card" style={{ padding: "14px 18px", textAlign: "center" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Live Match Status</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 800, marginTop: "4px", color: isStackLeading ? "#60a5fa" : isInnovatorsLeading ? "#34d399" : "#fbbf24" }}>
              {isStackLeading
                ? `Stack.push leads by ${clubScores.STACK_PUSH - clubScores.IT_INNOVATORS} pts`
                : isInnovatorsLeading
                  ? `IT Innovators leads by ${clubScores.IT_INNOVATORS - clubScores.STACK_PUSH} pts`
                  : "Match is Tied!"}
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
