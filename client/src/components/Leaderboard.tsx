import { useEffect, useState } from "react";
import { fetchJson } from "../services/api";
import { socket } from "../socket";

interface LeaderboardEntry {
  id: number;
  name: string;
  club: string;
  score: number;
  correctCount: number;
  attemptCount: number;
}

export default function Leaderboard() {
  const [participants, setParticipants] = useState<LeaderboardEntry[]>([]);
  const [clubScores, setClubScores] = useState({
    STACK_PUSH: 0,
    IT_INNOVATORS: 0,
  });

  const refreshLeaderboard = async () => {
    try {
      const data = await fetchJson<any>("/api/leaderboard");
      if (data.clubs) {
        setClubScores({
          STACK_PUSH:
            data.clubs.find((c: any) => c.name === "STACK_PUSH")?.score ?? 0,
          IT_INNOVATORS:
            data.clubs.find((c: any) => c.name === "IT_INNOVATORS")?.score ?? 0,
        });
      }
    } catch (error) {
      console.error("Failed to fetch leaderboard", error);
    }
  };

  useEffect(() => {
    void refreshLeaderboard();

    socket.on("leaderboard:update", () => {
      void refreshLeaderboard();
    });
    socket.on("participant:submitted", () => {
      void refreshLeaderboard();
    });

    return () => {
      socket.off("leaderboard:update");
      socket.off("participant:submitted");
    };
  }, []);

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
        border: "2px solid #38bdf8",
        borderRadius: 12,
        padding: 16,
        minWidth: 280,
      }}
    >
      <div style={{ marginBottom: 14 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#94a3b8",
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          LIVE SCORES
        </div>
      </div>

      <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
        <div
          style={{
            background: "rgba(59, 130, 246, 0.1)",
            border: "2px solid #3b82f6",
            borderRadius: 8,
            padding: 12,
          }}
        >
          <div style={{ color: "#bfdbfe", fontSize: 12 }}>STACK.PUSH</div>
          <div
            style={{
              fontSize: "2rem",
              fontWeight: 900,
              color: "#60a5fa",
              marginTop: 4,
            }}
          >
            {clubScores.STACK_PUSH}
          </div>
        </div>

        <div
          style={{
            background: "rgba(34, 197, 94, 0.1)",
            border: "2px solid #22c55e",
            borderRadius: 8,
            padding: 12,
          }}
        >
          <div style={{ color: "#86efac", fontSize: 12 }}>IT INNOVATORS</div>
          <div
            style={{
              fontSize: "2rem",
              fontWeight: 900,
              color: "#4ade80",
              marginTop: 4,
            }}
          >
            {clubScores.IT_INNOVATORS}
          </div>
        </div>
      </div>

      <div style={{ borderTop: "1px solid #334155", paddingTop: 12 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#94a3b8",
            textTransform: "uppercase",
            letterSpacing: 1,
            marginBottom: 8,
          }}
        >
          Leader
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "#fbbf24",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          ★
          {clubScores.STACK_PUSH > clubScores.IT_INNOVATORS
            ? "STACK.PUSH"
            : clubScores.IT_INNOVATORS > clubScores.STACK_PUSH
              ? "IT INNOVATORS"
              : "TIED"}
        </div>
      </div>
    </div>
  );
}
