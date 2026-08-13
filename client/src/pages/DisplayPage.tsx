import { useEffect, useState } from "react";
import Leaderboard from "../components/Leaderboard";
import { socket } from "../socket";

export default function DisplayPage() {
  const [status, setStatus] = useState("WAITING");
  const [question, setQuestion] = useState<any>(null);
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null);
  const [clubScores, setClubScores] = useState({
    STACK_PUSH: 0,
    IT_INNOVATORS: 0,
  });

  useEffect(() => {
    socket.on("quiz:state", (state) => {
      setStatus(state.status ?? "WAITING");
      if (state.correctAnswer) setCorrectAnswer(state.correctAnswer);
    });
    socket.on("quiz:question", ({ question }) => {
      setQuestion(question);
      setCorrectAnswer(null);
    });
    socket.on("display:update", (payload) => {
      if (payload.correctAnswer) setCorrectAnswer(payload.correctAnswer);
    });

    return () => {
      socket.off("quiz:state");
      socket.off("quiz:question");
      socket.off("display:update");
    };
  }, []);

  return (
    <div className="display-shell">
      <div
        style={{
          maxWidth: 1600,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "1fr 340px",
          gap: 20,
          padding: "20px",
        }}
      >
        <div className="display-box">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 2 }}>
                IT CLUB QUIZ
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8 }}>
                STACK.PUSH vs IT INNOVATORS
              </div>
            </div>
          </div>

          {status === "WAITING" && (
            <div style={{ textAlign: "center", marginTop: 90 }}>
              <h1 style={{ fontSize: "3rem", marginBottom: 12 }}>
                WAITING FOR HOST
              </h1>
            </div>
          )}

          {status === "LIVE" && question && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 24, fontWeight: 800 }}>
                ROUND {question.round ?? "LIVE"}
              </div>
              <div
                style={{ marginTop: 18, fontSize: "2.4rem", fontWeight: 700 }}
              >
                Q{question.questionNumber}
              </div>
              <div style={{ fontSize: "2rem", marginTop: 20 }}>
                {question.questionText}
              </div>
              <div className="answer-grid" style={{ marginTop: 24 }}>
                {["A", "B", "C", "D"].map((key) => (
                  <div
                    key={key}
                    className="metric"
                    style={{
                      minHeight: 80,
                      display: "flex",
                      alignItems: "center",
                      fontSize: 28,
                    }}
                  >
                    <strong>{key})</strong> {question[`option${key}`]}
                  </div>
                ))}
              </div>
            </div>
          )}

          {status === "REVEALED" && question && (
            <div style={{ marginTop: 26 }}>
              <h1>ANSWER REVEALED</h1>
              <div style={{ fontSize: "2rem", marginBottom: 12 }}>
                Correct Answer: <strong>{correctAnswer ?? "?"}</strong>
              </div>
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: "1.2rem", color: "#cbd5e1" }}>
                  Round {question.round ?? "LIVE"} • Q{question.questionNumber}
                </div>
              </div>
            </div>
          )}
        </div>

        <Leaderboard />
      </div>
    </div>
  );
}
