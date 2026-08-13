import { useEffect, useState } from "react";
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

export default function DisplayPage() {
  const [status, setStatus] = useState("WAITING");
  const [question, setQuestion] = useState<Question | null>(null);
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null);
  const [countdownEndsAt, setCountdownEndsAt] = useState<string | null>(null);
  const [countdownRemaining, setCountdownRemaining] = useState<number | null>(null);
  const [questionEndsAt, setQuestionEndsAt] = useState<string | null>(null);
  const [questionRemaining, setQuestionRemaining] = useState<number | null>(null);

  const [clubScores, setClubScores] = useState({ STACK_PUSH: 0, IT_INNOVATORS: 0 });
  const [topStudents, setTopStudents] = useState<TopStudent[]>([]);
  const [fastestTap, setFastestTap] = useState<FastestTap | null>(null);

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
          };
          currentQuestion: Question | null;
        }>("/api/quiz-state"),
        fetchJson<{
          clubs: Array<{ name: string; score: number }>;
          topStudents?: TopStudent[];
          fastestTap?: FastestTap | null;
        }>("/api/leaderboard"),
      ]);

      setStatus(stateData.session.status);
      setQuestion(stateData.currentQuestion);
      setCorrectAnswer(stateData.session.correctAnswer);
      setCountdownEndsAt(stateData.session.countdownEndsAt);
      setQuestionEndsAt(stateData.session.questionEndsAt);

      if (leaderboardData.clubs) {
        setClubScores({
          STACK_PUSH: leaderboardData.clubs.find((c) => c.name === "STACK_PUSH")?.score ?? 0,
          IT_INNOVATORS: leaderboardData.clubs.find((c) => c.name === "IT_INNOVATORS")?.score ?? 0,
        });
      }
      if (leaderboardData.topStudents) setTopStudents(leaderboardData.topStudents);
      if (leaderboardData.fastestTap !== undefined) setFastestTap(leaderboardData.fastestTap);
    } catch (_) {}
  };

  useEffect(() => {
    syncState();
    const interval = setInterval(syncState, 1500);
    socket.on("quiz:state", syncState);
    socket.on("leaderboard:update", syncState);
    socket.on("display:reveal", (data) => {
      if (data.correctAnswer) setCorrectAnswer(data.correctAnswer);
      setStatus("REVEALED");
    });
    return () => {
      clearInterval(interval);
      socket.off("quiz:state");
      socket.off("leaderboard:update");
    };
  }, []);

  // 3s Appearing Countdown tick
  useEffect(() => {
    if (!countdownEndsAt || status !== "COUNTDOWN") { setCountdownRemaining(null); return; }
    const tick = () => {
      const sec = Math.ceil((new Date(countdownEndsAt).getTime() - Date.now()) / 1000);
      if (sec > 0) setCountdownRemaining(sec);
      else { setCountdownRemaining(null); setCountdownEndsAt(null); setStatus("LIVE"); }
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

  const podiumEmojis = ["🥇", "🥈", "🥉"];
  const podiumColors = ["#fbbf24", "#94a3b8", "#cd7f32"];
  const clubLabel = (c: string) => c === "STACK_PUSH" ? "Stack.push" : "IT Innovators";
  const clubColor = (c: string) => c === "STACK_PUSH" ? "#60a5fa" : "#34d399";

  return (
    <div className="projector-shell">
      {/* 3-Second Fullscreen Projector Countdown */}
      {countdownRemaining !== null && countdownRemaining > 0 && (
        <div className="countdown-overlay">
          <div className="countdown-number" style={{ fontSize: "12rem" }}>{countdownRemaining}</div>
          <div className="countdown-label" style={{ fontSize: "2.5rem" }}>
            ⚡ READY FOR BATTLE — QUESTION {question?.questionNumber || 1}! ⚡
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="projector-grid">
        {/* Left Column: Big Stage Question & Options */}
        <div className="projector-question-card">
          {/* Header Bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid var(--border-subtle)", paddingBottom: "18px", flexWrap: "wrap", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <span className="brand-badge" style={{ fontSize: "1rem", padding: "6px 14px" }}>IT CLUB BATTLE</span>
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
              {status === "WAITING" && <span className="badge badge-waiting" style={{ fontSize: "1rem", padding: "6px 16px" }}>WAITING FOR HOST</span>}
              {question && <span className="question-points-pill" style={{ fontSize: "1rem", padding: "6px 14px" }}>+{question.points} {question.points === 1 ? "Pt" : "Pts"}</span>}
            </div>
          </div>

          {/* Question State Display */}
          {question && (status === "LIVE" || status === "LOCKED" || status === "REVEALED") ? (
            <div>
              {/* 30s Big Stage Timer Bar */}
              {status === "LIVE" && questionRemaining !== null && (
                <div style={{ marginTop: "16px", background: "rgba(255,255,255,0.08)", borderRadius: "999px", height: "10px", overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${Math.min(100, Math.max(0, (questionRemaining / 30) * 100))}%`,
                    background: questionRemaining <= 5 ? "#ef4444" : "linear-gradient(90deg, #3b82f6, #10b981)",
                    transition: "width 0.2s linear",
                  }} />
                </div>
              )}

              <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#38bdf8", marginTop: "20px" }}>
                QUESTION {question.questionNumber} OF 100
              </div>
              <div className="projector-question-text">{question.questionText}</div>

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
                {status === "FINISHED" ? "🏆 QUIZ BATTLE FINISHED!" : "GET READY FOR THE NEXT BATTLE QUESTION"}
              </h1>
              <p style={{ fontSize: "1.2rem", color: "var(--text-muted)", marginTop: "12px" }}>
                Host will launch the 3-second countdown shortly
              </p>
            </div>
          )}
        </div>

        {/* Right Column: Scoreboard + Top 3 + Fastest Tap */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* STACK.PUSH SCORE */}
          <div className="score-card stack" style={{
            padding: "22px 20px",
            boxShadow: isStackLeading ? "0 0 30px rgba(59, 130, 246, 0.4)" : "none",
            borderWidth: isStackLeading ? "3px" : "1.5px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="score-card-title" style={{ fontSize: "1rem" }}>⚡ STACK.PUSH</div>
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
              <div className="score-card-title" style={{ fontSize: "1rem" }}>🚀 IT INNOVATORS</div>
              {isInnovatorsLeading && (
                <span style={{ fontSize: "0.8rem", fontWeight: 900, color: "#fbbf24", background: "rgba(245, 158, 11, 0.2)", padding: "3px 8px", borderRadius: "6px" }}>★ LEADER</span>
              )}
            </div>
            <div className="score-card-points" style={{ fontSize: "3.5rem", lineHeight: 1.1, marginTop: "6px" }}>{clubScores.IT_INNOVATORS}</div>
          </div>

          {/* ⚡ FASTEST TAP */}
          <div className="glass-card" style={{
            padding: "16px 18px",
            background: fastestTap
              ? "linear-gradient(135deg, rgba(251, 191, 36, 0.12), rgba(245, 158, 11, 0.06))"
              : undefined,
            border: fastestTap ? "1.5px solid rgba(251, 191, 36, 0.35)" : undefined,
          }}>
            <div style={{ fontSize: "0.8rem", color: "#fbbf24", textTransform: "uppercase", fontWeight: 800, letterSpacing: "1px", marginBottom: "6px" }}>
              ⚡ Fastest Correct Tap
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
              🏆 Top 3 Students
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
                    background: idx === 0
                      ? "linear-gradient(135deg, rgba(251, 191, 36, 0.15), rgba(245, 158, 11, 0.05))"
                      : "rgba(255, 255, 255, 0.04)",
                    border: idx === 0 ? "1px solid rgba(251, 191, 36, 0.3)" : "1px solid rgba(255,255,255,0.06)",
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
    </div>
  );
}
