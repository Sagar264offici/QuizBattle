import { useEffect, useState } from "react";
import Leaderboard from "../components/Leaderboard";
import { fetchJson } from "../services/api";

export default function AdminPage() {
  const [summary, setSummary] = useState<any>({});
  const [questions, setQuestions] = useState<any[]>([]);
  const [selectedQuestionId, setSelectedQuestionId] = useState<number | null>(
    null,
  );
  const [questionFilter, setQuestionFilter] = useState<string>("all");

  const refresh = async () => {
    try {
      const [summaryData, questionsData] = await Promise.all([
        fetchJson("/api/admin/summary"),
        fetchJson("/api/admin/questions"),
      ]);
      setSummary(summaryData);
      setQuestions(questionsData);
      if (!selectedQuestionId && questionsData[0])
        setSelectedQuestionId(questionsData[0].id);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 2000);
    return () => clearInterval(interval);
  }, []);

  const runAction = async (path: string, payload?: any) => {
    await fetchJson(path, {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    });
    await refresh();
  };

  return (
    <div className="app-shell">
      <div
        style={{
          maxWidth: 1400,
          margin: "20px auto",
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: 20,
        }}
      >
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Admin Dashboard</h2>

          <div className="admin-grid">
            <div className="metric">
              <div style={{ fontSize: 12, color: "#94a3b8" }}>
                Current Round
              </div>
              <div style={{ fontSize: "1.6rem", fontWeight: 800 }}>
                {summary.session?.currentRoundId ?? "—"}
              </div>
            </div>
            <div className="metric">
              <div style={{ fontSize: 12, color: "#94a3b8" }}>
                Current Question
              </div>
              <div style={{ fontSize: "1.6rem", fontWeight: 800 }}>
                Q{summary.currentQuestionId ?? "—"}
              </div>
            </div>
            <div className="metric">
              <div style={{ fontSize: 12, color: "#94a3b8" }}>Status</div>
              <div
                style={{
                  fontSize: "1.2rem",
                  fontWeight: 800,
                  color:
                    summary.session?.status === "LIVE"
                      ? "#10b981"
                      : summary.session?.status === "LOCKED"
                        ? "#f59e0b"
                        : summary.session?.status === "REVEALED"
                          ? "#3b82f6"
                          : "#6b7280",
                }}
              >
                {summary.session?.status ?? "WAITING"}
              </div>
            </div>
            <div className="metric">
              <div style={{ fontSize: 12, color: "#94a3b8" }}>Registered</div>
              <div style={{ fontSize: "1.6rem", fontWeight: 800 }}>
                {summary.participantsCount ?? 0}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 24, marginBottom: 24 }}>
            <div className="admin-grid">
              <div className="metric">
                <div style={{ fontSize: 12, color: "#94a3b8" }}>STACK.PUSH</div>
                <div
                  style={{
                    fontSize: "1.8rem",
                    fontWeight: 900,
                    color: "#3b82f6",
                  }}
                >
                  {summary.stackCount ?? 0}
                </div>
              </div>
              <div className="metric">
                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                  IT INNOVATORS
                </div>
                <div
                  style={{
                    fontSize: "1.8rem",
                    fontWeight: 900,
                    color: "#22c55e",
                  }}
                >
                  {summary.innovatorsCount ?? 0}
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              marginTop: 18,
            }}
          >
            <button
              className="primary"
              onClick={() =>
                runAction("/api/admin/start-question", {
                  questionId: selectedQuestionId ?? questions[0]?.id,
                })
              }
            >
              START QUESTION
            </button>
            <button
              className="secondary"
              onClick={() => runAction("/api/admin/lock-answers")}
            >
              LOCK ANSWERS
            </button>
            <button
              className="secondary"
              onClick={() => runAction("/api/admin/reveal-answer")}
            >
              REVEAL ANSWER
            </button>
            <button
              className="secondary"
              onClick={() =>
                runAction("/api/admin/next-question", {
                  questionNumber:
                    (questions.find((q) => q.id === selectedQuestionId)
                      ?.questionNumber ?? 0) + 1,
                })
              }
            >
              NEXT QUESTION
            </button>
            <button
              className="secondary"
              onClick={() => runAction("/api/admin/reset-current-question")}
            >
              RESET CURRENT QUESTION
            </button>
            <button
              className="danger"
              onClick={() => runAction("/api/admin/reset-quiz")}
            >
              RESET ENTIRE QUIZ
            </button>
            <button
              className="danger"
              onClick={() => runAction("/api/admin/end-quiz")}
            >
              END QUIZ
            </button>
          </div>

          <div style={{ marginTop: 28 }}>
            <div style={{ marginBottom: 12 }}>
              <h3 style={{ margin: 0, marginBottom: 12 }}>
                Question Navigator
              </h3>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <button
                  className={questionFilter === "all" ? "primary" : "secondary"}
                  onClick={() => setQuestionFilter("all")}
                  style={{ padding: "6px 12px", fontSize: 12 }}
                >
                  All Rounds
                </button>
                {[...new Set(questions.map((q: any) => q.roundId))].map(
                  (roundId) => (
                    <button
                      key={roundId}
                      className={
                        questionFilter === String(roundId)
                          ? "primary"
                          : "secondary"
                      }
                      onClick={() => setQuestionFilter(String(roundId))}
                      style={{ padding: "6px 12px", fontSize: 12 }}
                    >
                      Round {roundId}
                    </button>
                  ),
                )}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(60px, 1fr))",
                gap: 8,
                marginBottom: 16,
                maxHeight: 280,
                overflowY: "auto",
                padding: "8px 0",
              }}
            >
              {questions
                .filter(
                  (q: any) =>
                    questionFilter === "all" ||
                    String(q.roundId) === questionFilter,
                )
                .map((q: any) => (
                  <button
                    key={q.id}
                    className={
                      selectedQuestionId === q.id ? "primary" : "secondary"
                    }
                    onClick={() => setSelectedQuestionId(q.id)}
                    style={{
                      padding: "8px 4px",
                      fontSize: 12,
                      fontWeight: 700,
                      textAlign: "center",
                      cursor: "pointer",
                    }}
                    title={`${q.questionText.slice(0, 40)}...`}
                  >
                    Q{q.questionNumber}
                  </button>
                ))}
            </div>

            {selectedQuestionId && (
              <div
                style={{
                  background: "rgba(100, 116, 139, 0.3)",
                  border: "1px solid #475569",
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 8 }}>
                  Selected Question:
                </div>
                <div>
                  <strong>
                    Q
                    {
                      questions.find((q) => q.id === selectedQuestionId)
                        ?.questionNumber
                    }
                  </strong>{" "}
                  •{" "}
                  {questions
                    .find((q) => q.id === selectedQuestionId)
                    ?.questionText?.slice(0, 60)}
                  ...
                </div>
                <div style={{ marginTop: 6, color: "#94a3b8", fontSize: 12 }}>
                  Points:{" "}
                  {questions.find((q) => q.id === selectedQuestionId)?.points}
                </div>
              </div>
            )}
          </div>
        </div>

        <Leaderboard />
      </div>
    </div>
  );
}
