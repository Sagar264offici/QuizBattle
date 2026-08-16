import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Footer from "../components/Footer";
import { fetchJson } from "../services/api";

export default function JoinPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [club, setClub] = useState<"STACK_PUSH" | "IT_INNOVATORS" | "">("");
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("quizbattle-session");
    if (token) {
      void fetchJson<{
        participant?: any;
        sessionStatus?: string;
        currentQuestion?: any;
      }>(`/api/participants/session?token=${encodeURIComponent(token)}`)
        .then((data) => {
          if (data.participant) {
            navigate("/quiz", {
              state: { participant: data.participant, sessionToken: token },
            });
          }
        })
        .catch(() => localStorage.removeItem("quizbattle-session"));
    }
  }, [navigate]);

  const clubLabel = useMemo(
    () =>
      club === "STACK_PUSH"
        ? "Stack.push"
        : club === "IT_INNOVATORS"
          ? "IT Innovators"
          : "—",
    [club],
  );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Full name is required.");
      return;
    }
    if (!club) {
      setError("Please select exactly one club.");
      return;
    }

    try {
      const result = await fetchJson<{
        participant: { sessionToken: string; name: string; club: string };
      }>("/api/participants/register", {
        method: "POST",
        body: JSON.stringify({ name, club }),
      });
      localStorage.setItem(
        "quizbattle-session",
        result.participant.sessionToken,
      );
      navigate("/quiz", {
        state: {
          participant: result.participant,
          sessionToken: result.participant.sessionToken,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to register");
    }
  };

  return (
    <div className="app-shell">
      <div className="card" style={{ maxWidth: 540, margin: "40px auto" }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <h1 style={{ margin: 0, fontSize: "2rem" }}>IT CLUB QUIZ</h1>
          <p style={{ margin: "8px 0 0", color: "#cbd5e1" }}>
            On-the-spot registration
          </p>
        </div>

        <form onSubmit={handleSubmit} className="form-grid">
          <label>
            Full Name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your full name"
            />
          </label>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Club</div>
            <div className="radio-row">
              <label className="radio-option">
                <input
                  type="radio"
                  name="club"
                  checked={club === "STACK_PUSH"}
                  onChange={() => setClub("STACK_PUSH")}
                />
                <span>Stack.push</span>
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  name="club"
                  checked={club === "IT_INNOVATORS"}
                  onChange={() => setClub("IT_INNOVATORS")}
                />
                <span>IT Innovators</span>
              </label>
            </div>
          </div>

          {error && (
            <div style={{ color: "#fca5a5", fontWeight: 700 }}>{error}</div>
          )}
          {club && (
            <div style={{ color: "#bfdbfe", fontWeight: 700 }}>
              Selected club: {clubLabel}
            </div>
          )}
          <button type="submit" className="primary">
            JOIN QUIZ
          </button>
        </form>
      </div>
      <Footer />
    </div>
  );
}
