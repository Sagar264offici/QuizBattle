import React, { useEffect, useState } from "react";
import Footer from "../components/Footer";
import { fetchJson, setAdminPassword, clearAdminPassword, type QuizMode } from "../services/api";
import {
  downloadCertificatePNG,
  formatDuration,
  type CertificateStudent,
} from "../lib/certificate";

interface ResultStudent {
  id: number;
  name: string;
  club: string;
  score: number;
  correctCount: number;
  wrongCount: number;
  attemptCount: number;
  correctResponseMs: number;
  totalResponseMs: number;
  fastestStreak: number;
  bonusPoints: number;
  joinedAt: string | null;
}

interface LeaderboardData {
  clubs: Array<{ name: string; score: number }>;
  students: ResultStudent[];
  topStudents?: Array<ResultStudent & { rank: number }>;
  fastestTap?: {
    participantName: string;
    club: string;
    responseTimeMs: number;
    responseTimeSec: string;
    questionNumber: number;
    answer: string;
  } | null;
}

const clubLabel = (c: string) => (c === "STACK_PUSH" ? "Stack.push" : "IT Innovators");
const clubColor = (c: string) => (c === "STACK_PUSH" ? "#60a5fa" : "#34d399");

const MEDALS = ["🥇", "🥈", "🥉"];
const MEDAL_COLORS = ["#fbbf24", "#cbd5e1", "#d48c54"];
const RANK_NAMES = ["", "1st", "2nd", "3rd"];

export default function ResultsPage({ mode = "live" }: { mode?: QuizMode } = {}) {
  // Certificate downloads are ADMIN-ONLY — students see the winner on their
  // phone but never the certificate generator. Same gate as the host dashboard.
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

  const [data, setData] = useState<LeaderboardData | null>(null);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

  const load = async () => {
    try {
      const d = await fetchJson<LeaderboardData>("/api/leaderboard", undefined, mode);
      setData(d);
      setError("");
    } catch (err: any) {
      setError(err?.message || "Failed to load results");
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    void load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [mode, isAuthenticated]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      setAdminPassword(password);
      const res = await fetchJson<{ ok: boolean }>("/api/admin/login", {
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

  const students = data?.students ?? [];
  // The leaderboard's top 3 — clubs can be mixed (e.g. 1st IT Innovators,
  // 2nd Stack.push, 3rd IT Innovators). Certificates follow this exact order.
  const topThree = students.slice(0, 3);
  const stackScore = data?.clubs.find((c) => c.name === "STACK_PUSH")?.score ?? 0;
  const innovScore = data?.clubs.find((c) => c.name === "IT_INNOVATORS")?.score ?? 0;
  const fastestTap = data?.fastestTap ?? null;

  const toCertificate = (s: ResultStudent, rank: 1 | 2 | 3): CertificateStudent => ({
    name: s.name,
    club: s.club,
    score: s.score,
    correctCount: s.correctCount,
    attemptCount: s.attemptCount,
    totalResponseMs: s.totalResponseMs,
    rank,
  });

  const downloadOne = async (s: ResultStudent, rank: 1 | 2 | 3) => {
    await downloadCertificatePNG(toCertificate(s, rank), {
      mode,
      eventName:
        mode === "test"
          ? "IT Club Championship — TEST MODE · 60 Questions"
          : "IT Club Championship — Technical Battle",
    });
  };

  const downloadList = async (list: ResultStudent[]) => {
    setDownloading(true);
    try {
      for (let i = 0; i < list.length; i++) {
        await downloadOne(list[i], (i + 1) as 1 | 2 | 3);
        // Browsers block rapid-fire downloads — space them out.
        await new Promise((r) => setTimeout(r, 450));
      }
    } finally {
      setDownloading(false);
    }
  };

  const generateLeaderboardCertificates = async () => downloadList(topThree);

  // 🔒 ADMIN-ONLY — students never see the certificate generator.
  if (!isAuthenticated) {
    return (
      <div className="app-shell">
        <div className="container-sm" style={{ marginTop: "30px", marginBottom: "40px" }}>
          <div className="glass-card" style={{ padding: "24px" }}>
            <div className="quiz-brand" style={{ margin: "0 0 18px" }}>
              <span className="brand-badge" style={{ background: mode === "test" ? "#f59e0b" : "#2563eb" }}>
                {mode === "test" ? "TEST RESULTS" : "FINAL RESULTS"}
              </span>
              <span className="brand-title">
                {mode === "test" ? "Test Battle — Final Results" : "Quiz Battle — Final Results"}
              </span>
            </div>
            <div style={{ textAlign: "center", marginBottom: "16px" }}>
              <div style={{ fontSize: "2.6rem" }}>🔒</div>
              <h1 className="brand-title" style={{ fontSize: "1.5rem", margin: "6px 0 4px" }}>
                Host Login Required
              </h1>
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", maxWidth: 420, margin: "0 auto" }}>
                Certificate generation &amp; downloads are admin-only. Students see the winners on
                their phone — the host shares certificates from here.
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
                {authLoading ? "Logging in..." : "ACCESS RESULTS & CERTIFICATES →"}
              </button>
            </form>
            <div style={{ marginTop: "18px", textAlign: "center" }}>
              <a
                href={mode === "test" ? "/admin/test" : "/admin"}
                style={{ color: "var(--text-dim)", fontSize: "0.85rem", textDecoration: "none", fontWeight: 600 }}
              >
                ⚙️ Back to Host Dashboard →
              </a>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="container">
        {/* Header */}
        <div className="admin-header-bar">
          <div className="quiz-brand" style={{ margin: 0 }}>
            <span className="brand-badge" style={{ background: mode === "test" ? "#f59e0b" : "#2563eb" }}>
              {mode === "test" ? "TEST RESULTS" : "FINAL RESULTS"}
            </span>
            <span className="brand-title">
              {mode === "test" ? "Test Battle — Final Results" : "Quiz Battle — Final Results"}
            </span>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <a href={mode === "test" ? "/admin/test" : "/admin"} className="btn btn-secondary btn-sm">
              ↩ Back to {mode === "test" ? "Test" : "Live"} Admin
            </a>
            <a href={mode === "test" ? "/test/display" : "/display"} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
              📺 Projector Screen ↗
            </a>
          </div>
        </div>

        {error && (
          <div style={{ background: "rgba(239, 68, 68, 0.15)", border: "1.5px solid #ef4444", borderRadius: "12px", padding: "12px 16px", marginBottom: "16px", color: "#fca5a5", fontWeight: 700 }}>
            ⚠️ {error}
          </div>
        )}

        {/* Club score summary */}
        <div className="score-banner" style={{ marginBottom: "18px" }}>
          <div className="score-card stack">
            <div className="score-card-title">⚡ Stack.push</div>
            <div className="score-card-points">{stackScore}</div>
          </div>
          <div className="score-card innovators">
            <div className="score-card-title">🚀 IT Innovators</div>
            <div className="score-card-points">{innovScore}</div>
          </div>
        </div>

        {fastestTap && (
          <div className="glass-card" style={{ marginBottom: "18px", padding: "14px 18px", border: "1.5px solid rgba(251, 191, 36, 0.35)" }}>
            <div style={{ fontSize: "0.75rem", color: "#fbbf24", textTransform: "uppercase", fontWeight: 800, letterSpacing: "1px", marginBottom: "4px" }}>
              ⚡ Fastest Correct Tap of the Battle
            </div>
            <div style={{ fontSize: "1.15rem", fontWeight: 900 }}>
              {fastestTap.participantName}{" "}
              <span style={{ color: clubColor(fastestTap.club) }}>· {clubLabel(fastestTap.club)}</span>{" "}
              <span style={{ color: "#fbbf24" }}>· {fastestTap.responseTimeSec}s</span>
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Question {fastestTap.questionNumber} · Answer {fastestTap.answer}
            </div>
          </div>
        )}

        {/* 🏆 TOP 3 PODIUM */}
        <div className="glass-card" style={{ marginBottom: "18px" }}>
          <h2 style={{ fontSize: "1.35rem", fontWeight: 900, margin: "0 0 4px", textAlign: "center" }}>
            🏆 TOP 3 CHAMPIONS
          </h2>
          <p style={{ textAlign: "center", color: "var(--text-muted)", margin: "0 0 18px", fontSize: "0.9rem" }}>
            Certificate-ready winners — ranked by score, then correct answers, then speed
          </p>

          {topThree.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px", color: "var(--text-muted)" }}>
              No results yet — students need to join and answer questions first.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "14px" }}>
              {topThree.map((s, idx) => {
                const isFirst = idx === 0;
                return (
                  <div
                    key={s.id}
                    style={{
                      background: isFirst
                        ? "linear-gradient(160deg, rgba(251, 191, 36, 0.16), rgba(245, 158, 11, 0.05))"
                        : "rgba(255,255,255,0.04)",
                      border: `2px solid ${isFirst ? "rgba(251, 191, 36, 0.55)" : "rgba(255,255,255,0.1)"}`,
                      borderRadius: "16px",
                      padding: "20px 16px",
                      textAlign: "center",
                      boxShadow: isFirst ? "0 0 30px rgba(251, 191, 36, 0.18)" : "none",
                    }}
                  >
                    <div style={{ fontSize: "3.2rem", lineHeight: 1 }}>{MEDALS[idx]}</div>
                    <div style={{ fontSize: "0.85rem", fontWeight: 900, color: MEDAL_COLORS[idx], textTransform: "uppercase", letterSpacing: "1px", marginTop: "6px" }}>
                      {RANK_NAMES[idx + 1]} Place
                    </div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 900, marginTop: "8px", color: "var(--text-main)" }}>{s.name}</div>
                    <div style={{ fontSize: "0.85rem", fontWeight: 800, color: clubColor(s.club), marginTop: "2px" }}>{clubLabel(s.club)}</div>
                    <div style={{ fontSize: "2.2rem", fontWeight: 900, color: "#fbbf24", fontFamily: "var(--font-mono)", marginTop: "8px" }}>{s.score} pts</div>
                    <div style={{ display: "flex", justifyContent: "center", gap: "18px", marginTop: "8px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      <span>✓ {s.correctCount} correct</span>
                      <span>⏱ {formatDuration(s.totalResponseMs)} total</span>
                    </div>
                    {(s.bonusPoints || 0) > 0 && (
                      <div style={{ marginTop: "6px", fontSize: "0.8rem", fontWeight: 800, color: "#fb923c" }}>
                        🔥 +{s.bonusPoints} bonus · {s.fastestStreak}-fastest streak
                      </div>
                    )}
                    <button
                      className="btn btn-warning btn-sm"
                      style={{ marginTop: "14px", width: "100%", fontWeight: 900 }}
                      onClick={() => void downloadOne(s, (idx + 1) as 1 | 2 | 3)}
                      title={`Download ${s.name}'s PNG certificate`}
                    >
                      🖼️ Download Certificate (PNG)
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {topThree.length > 0 && (
            <div style={{ textAlign: "center", marginTop: "18px" }}>
              <button
                className="btn btn-primary btn-lg"
                onClick={() => void generateLeaderboardCertificates()}
                disabled={downloading}
                style={{ fontWeight: 900, fontSize: "1.05rem", padding: "14px 26px" }}
              >
                {downloading
                  ? "Generating certificates..."
                  : "🎖️ Generate Certificates for Leaderboard (1st · 2nd · 3rd)"}
              </button>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "10px" }}>
                Creates 3 certificates — the leaderboard's exact top 3, any mix of clubs, on the official college template.
              </p>
            </div>
          )}
        </div>

        {/* 📊 FULL RANKING — every student's total timing by answer submitted */}
        <div className="glass-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "14px" }}>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 900, margin: 0 }}>
              📊 Full Ranking — Total Timing by Answer Submitted ({students.length})
            </h3>
          </div>

          {students.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px", color: "var(--text-muted)" }}>No participants yet.</div>
          ) : (
            <div className="members-table-wrap">
              <table className="members-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Name</th>
                    <th>Club</th>
                    <th>Score</th>
                    <th>Correct</th>
                    <th>Wrong</th>
                    <th>Submissions</th>
                    <th>Total Time (All Answers)</th>
                    <th>Avg Time / Answer</th>
                    <th>Bonus 🔥</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, idx) => (
                    <tr key={s.id} style={idx < 3 ? { background: "rgba(245, 158, 11, 0.06)" } : undefined}>
                      <td style={{ fontWeight: 900, color: idx < 3 ? MEDAL_COLORS[idx] : "var(--text-dim)" }}>
                        {idx < 3 ? `${MEDALS[idx]} ${idx + 1}` : idx + 1}
                      </td>
                      <td style={{ fontWeight: 700 }}>{s.name}</td>
                      <td>
                        <span style={{ fontSize: "0.8rem", fontWeight: 800, color: clubColor(s.club) }}>{clubLabel(s.club)}</span>
                      </td>
                      <td style={{ fontWeight: 900, color: "#fbbf24", fontFamily: "var(--font-mono)" }}>{s.score}</td>
                      <td style={{ color: "#4ade80", fontFamily: "var(--font-mono)" }}>{s.correctCount}</td>
                      <td style={{ color: "#f87171", fontFamily: "var(--font-mono)" }}>{s.wrongCount || 0}</td>
                      <td style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{s.attemptCount || 0}</td>
                      <td style={{ fontFamily: "var(--font-mono)" }}>⏱ {formatDuration(s.totalResponseMs)}</td>
                      <td style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                        {s.attemptCount ? formatDuration(s.totalResponseMs / s.attemptCount) : "—"}
                      </td>
                      <td style={{ color: (s.bonusPoints || 0) > 0 ? "#fb923c" : "var(--text-dim)", fontWeight: 800 }}>
                        {(s.bonusPoints || 0) > 0 ? `+${s.bonusPoints}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
