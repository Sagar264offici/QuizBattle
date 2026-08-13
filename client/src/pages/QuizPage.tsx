import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Leaderboard from "../components/Leaderboard";
import { fetchJson } from "../services/api";
import { socket } from "../socket";

interface ParticipantState {
  id: number;
  name: string;
  club: string;
  score: number;
  sessionToken: string;
}

export default function QuizPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [participant, setParticipant] = useState<ParticipantState | null>(
    (location.state as any)?.participant ?? null,
  );
  const [sessionToken, setSessionToken] = useState<string>(
    (location.state as any)?.sessionToken ??
      localStorage.getItem("quizbattle-session") ??
      "",
  );
  const [question, setQuestion] = useState<any>(null);
  const [status, setStatus] = useState("WAITING");
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("quiz:state", (state) => {
      setStatus(state.status ?? "WAITING");
      if (state.currentQuestionId) {
        void fetchJson(`/api/quiz-state`).then((payload) => {
          setQuestion(payload.currentQuestion);
        });
      }
    });
    socket.on("quiz:question", ({ question }) => setQuestion(question));

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("quiz:state");
      socket.off("quiz:question");
    };
  }, []);

  useEffect(() => {
    if (!participant && sessionToken) {
      void fetchJson<{
        participant: ParticipantState;
        hasSubmitted: boolean;
        currentQuestion?: any;
        sessionStatus?: string;
      }>(`/api/participants/session?token=${encodeURIComponent(sessionToken)}`)
        .then((data) => {
          setParticipant(data.participant);
          setSubmitted(data.hasSubmitted);
          setStatus(data.sessionStatus ?? "WAITING");
          setQuestion(data.currentQuestion ?? null);
        })
        .catch(() => navigate("/join"));
    }
  }, [navigate, participant, sessionToken]);

  const submitAnswer = async () => {
    if (!question || !selectedAnswer || !sessionToken) return;
    try {
      await fetchJson("/api/questions/submit", {
        method: "POST",
        body: JSON.stringify({
          token: sessionToken,
          answer: selectedAnswer,
          questionId: question.id,
        }),
      });
      setSubmitted(true);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    }
  };

  if (!participant) {
    return (
      <div className="app-shell">
        <div className="card" style={{ maxWidth: 420, margin: "50px auto" }}>
          <h2>Loading participant session...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div
        style={{
          maxWidth: 1300,
          margin: "20px auto",
          display: "grid",
          gridTemplateColumns: "1fr 300px",
          gap: 20,
        }}
      >
        <div className="card">
          <div className="topbar">
            <div>
              <div className="status-pill">{status}</div>
              <h2 style={{ margin: "10px 0 0" }}>
                WELCOME, {participant.name}
              </h2>
              <p style={{ margin: 0, color: "#cbd5e1" }}>
                Club: {participant.club}
              </p>
            </div>
            <div className="metric">
              <div style={{ fontSize: 12, color: "#94a3b8" }}>Connection</div>
              <div
                style={{
                  fontWeight: 800,
                  color: connected ? "#4ade80" : "#fca5a5",
                }}
              >
                {connected ? "ONLINE" : "OFFLINE"}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            {question && status === "LIVE" && !submitted ? (
              <>
                <div
                  style={{
                    marginBottom: 12,
                    color: "#cbd5e1",
                    fontWeight: 700,
                  }}
                >
                  ROUND {question.round ?? "LIVE"}
                </div>
                <h3 style={{ marginTop: 0 }}>Q{question.questionNumber}</h3>
                <p style={{ fontSize: "1.05rem", marginBottom: 18 }}>
                  {question.questionText}
                </p>

                <div className="answer-grid">
                  {["A", "B", "C", "D"].map((optionKey) => {
                    const optionValue = question[`option${optionKey}`];
                    return (
                      <button
                        key={optionKey}
                        className="answer-choice"
                        onClick={() => {
                          setSelectedAnswer(optionKey);
                        }}
                        style={{
                          borderColor:
                            selectedAnswer === optionKey
                              ? "#38bdf8"
                              : undefined,
                          background:
                            selectedAnswer === optionKey
                              ? "#0f172a"
                              : undefined,
                        }}
                      >
                        <strong>{optionKey})</strong> {optionValue}
                      </button>
                    );
                  })}
                </div>

                <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
                  <button
                    className="primary"
                    onClick={submitAnswer}
                    disabled={!selectedAnswer}
                  >
                    SUBMIT ANSWER
                  </button>
                </div>
              </>
            ) : (
              <div
                className="card"
                style={{ marginTop: 0, background: "rgba(15,23,42,0.6)" }}
              >
                <h3>
                  {status === "WAITING"
                    ? "WAITING FOR HOST..."
                    : status === "LOCKED"
                      ? "ANSWERS LOCKED"
                      : status === "REVEALED"
                        ? "ANSWER SUBMITTED"
                        : "CURRENTLY WAITING"}
                </h3>
                <p style={{ color: "#cbd5e1" }}>
                  {status === "WAITING"
                    ? "The host will start the next question when ready."
                    : "Please wait for the next round."}
                </p>
              </div>
            )}

            {error && (
              <div style={{ color: "#fca5a5", marginTop: 12, fontWeight: 700 }}>
                {error}
              </div>
            )}
            {submitted && (
              <div style={{ marginTop: 12, color: "#86efac", fontWeight: 800 }}>
                ANSWER SUBMITTED — LOCKED
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <div
            style={{
              background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
              border: "2px solid #10b981",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div style={{ marginBottom: 12 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#94a3b8",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: 4,
                }}
              >
                YOUR SCORE
              </div>
            </div>
            <div
              style={{
                fontSize: "2.4rem",
                fontWeight: 900,
                color: "#86efac",
              }}
            >
              {participant.score}
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: "#cbd5e1",
              }}
            >
              {participant.club}
            </div>
          </div>

          <Leaderboard />
        </div>
      </div>
    </div>
  );
}
