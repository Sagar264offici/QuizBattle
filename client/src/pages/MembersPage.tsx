import React, { useEffect, useMemo, useRef, useState } from "react";
import Footer from "../components/Footer";
import { fetchJson, type QuizMode } from "../services/api";

export interface Member {
  id: number;
  name: string;
  club: "STACK_PUSH" | "IT_INNOVATORS" | string;
  joinedAt: string | null;
  score: number;
  correctCount: number;
  wrongCount: number;
  attemptCount: number;
  correctResponseMs?: number;
  fastestStreak?: number;
  bonusPoints?: number;
  submitted: boolean;
  sessionToken?: string;
}

interface MembersResponse {
  participants: Member[];
  count: number;
  status: string;
  currentQuestionId: number | null;
}

export type MemberSortKey = "name" | "score" | "joinedAt";
export type MemberSortDir = "asc" | "desc";

/**
 * Pure, deterministic filter/sort used by the members page. Kept outside the
 * component so it can be unit-tested directly (search, club filter, status
 * filter, stable sorting).
 */
export function filterAndSortMembers(
  members: Member[],
  opts: {
    search: string;
    club: string; // "", "STACK_PUSH", "IT_INNOVATORS"
    status: string; // "", "submitted", "pending"
    sortKey: MemberSortKey;
    sortDir: MemberSortDir;
  },
): Member[] {
  const q = opts.search.trim().toLowerCase();
  const filtered = members.filter((m) => {
    if (q && !m.name.toLowerCase().includes(q)) return false;
    if (opts.club && m.club !== opts.club) return false;
    if (opts.status === "submitted" && !m.submitted) return false;
    if (opts.status === "pending" && m.submitted) return false;
    return true;
  });

  const dir = opts.sortDir === "asc" ? 1 : -1;
  const val = (m: Member) => {
    if (opts.sortKey === "name") return String(m.name || "").toLowerCase();
    if (opts.sortKey === "score") return m.score || 0;
    return String(m.joinedAt || "");
  };
  // Stable secondary tie-breakers (id ASC) so equal values never shuffle.
  return [...filtered].sort((a, b) => {
    const av = val(a);
    const bv = val(b);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return (a.id || 0) - (b.id || 0);
  });
}

const clubLabel = (c: string) => (c === "STACK_PUSH" ? "Stack.push" : "IT Innovators");
const clubColor = (c: string) => (c === "STACK_PUSH" ? "#60a5fa" : "#34d399");
const formatTime = (iso: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch (_) {
    return "—";
  }
};

export default function MembersPage({ mode = "live" }: { mode?: QuizMode } = {}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [quizStatus, setQuizStatus] = useState("PREPARING");
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [clubFilter, setClubFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortKey, setSortKey] = useState<MemberSortKey>("score");
  const [sortDir, setSortDir] = useState<MemberSortDir>("desc");

  // Kick confirmation modal state
  const [kickTarget, setKickTarget] = useState<Member | null>(null);
  const [kickLoading, setKickLoading] = useState(false);

  const lastDataRef = useRef<string>("");

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await fetchJson<MembersResponse>("/api/admin/members", undefined, mode);
        if (cancelled) return;
        const key = JSON.stringify(data.participants);
        if (key !== lastDataRef.current) {
          lastDataRef.current = key;
          setMembers(data.participants || []);
        }
        setQuizStatus(data.status || "PREPARING");
        setLoading(false);
        setError("");
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message || "Failed to load members");
        setLoading(false);
      }
    };
    void poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [mode]);

  const visibleMembers = useMemo(
    () =>
      filterAndSortMembers(members, {
        search,
        club: clubFilter,
        status: statusFilter,
        sortKey,
        sortDir,
      }),
    [members, search, clubFilter, statusFilter, sortKey, sortDir],
  );

  const stackCount = useMemo(() => members.filter((m) => m.club === "STACK_PUSH").length, [members]);
  const innovCount = useMemo(() => members.filter((m) => m.club === "IT_INNOVATORS").length, [members]);
  const submittedCount = useMemo(() => members.filter((m) => m.submitted).length, [members]);

  const confirmKick = async () => {
    if (!kickTarget) return;
    setKickLoading(true);
    try {
      await fetchJson(
        "/api/admin/kick-participant",
        { method: "POST", body: JSON.stringify({ token: kickTarget.sessionToken }) },
        mode,
      );
      setMembers((cur) => cur.filter((m) => m.id !== kickTarget.id));
      setKickTarget(null);
    } catch (err: any) {
      alert(err?.message || "Failed to kick participant");
    } finally {
      setKickLoading(false);
    }
  };

  const toggleSort = (key: MemberSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const sortArrow = (key: MemberSortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  return (
    <div className="app-shell">
      <div className="container">
        <div className="admin-header-bar">
          <div className="quiz-brand" style={{ margin: 0 }}>
            <span className="brand-badge" style={{ background: mode === "test" ? "#f59e0b" : "#2563eb" }}>
              {mode === "test" ? "TEST MEMBERS" : "MEMBERS"}
            </span>
            <span className="brand-title">Participant Details</span>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <a href={mode === "test" ? "/admin/test" : "/admin"} className="btn btn-secondary btn-sm">
              ↩ Back to {mode === "test" ? "Test" : "Live"} Admin
            </a>
            <a href="/admin" className="btn btn-secondary btn-sm">
              ⚡ Live Members
            </a>
            {mode === "live" && (
              <a href="/admin/test/members" className="btn btn-warning btn-sm">
                🧪 Test Members
              </a>
            )}
          </div>
        </div>

        {error && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.15)",
              border: "1.5px solid #ef4444",
              borderRadius: "12px",
              padding: "12px 16px",
              marginBottom: "16px",
              color: "#fca5a5",
              fontWeight: 700,
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {/* Stats strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px", marginBottom: "16px" }}>
          <div className="score-card">
            <div className="score-card-title" style={{ color: "var(--text-muted)" }}>Total Members</div>
            <div style={{ fontSize: "1.8rem", fontWeight: 900, fontFamily: "var(--font-mono)" }}>{members.length}</div>
          </div>
          <div className="score-card stack">
            <div className="score-card-title">⚡ Stack.push</div>
            <div style={{ fontSize: "1.8rem", fontWeight: 900, fontFamily: "var(--font-mono)", color: "#93c5fd" }}>{stackCount}</div>
          </div>
          <div className="score-card innovators">
            <div className="score-card-title">🚀 IT Innovators</div>
            <div style={{ fontSize: "1.8rem", fontWeight: 900, fontFamily: "var(--font-mono)", color: "#6ee7b7" }}>{innovCount}</div>
          </div>
          <div className="score-card">
            <div className="score-card-title" style={{ color: "var(--text-muted)" }}>Answered Current Q</div>
            <div style={{ fontSize: "1.8rem", fontWeight: 900, fontFamily: "var(--font-mono)", color: "#a78bfa" }}>{submittedCount}</div>
          </div>
          <div className="score-card">
            <div className="score-card-title" style={{ color: "var(--text-muted)" }}>Quiz Status</div>
            <div style={{ marginTop: "6px" }}>
              <span className={`badge ${quizStatus === "LIVE" ? "badge-live" : quizStatus === "COUNTDOWN" ? "badge-countdown" : quizStatus === "PREPARING" ? "badge-preparing" : quizStatus === "LOCKED" ? "badge-locked" : quizStatus === "REVEALED" ? "badge-revealed" : quizStatus === "FINISHED" ? "badge-finished" : "badge-waiting"}`}>
                {quizStatus}
              </span>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="members-controls">
          <input
            type="search"
            className="form-input"
            placeholder="🔍 Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search members"
            style={{ maxWidth: 320 }}
          />
          <select className="form-input members-select" value={clubFilter} onChange={(e) => setClubFilter(e.target.value)} aria-label="Filter by club">
            <option value="">All Clubs</option>
            <option value="STACK_PUSH">⚡ Stack.push</option>
            <option value="IT_INNOVATORS">🚀 IT Innovators</option>
          </select>
          <select className="form-input members-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
            <option value="">All Status</option>
            <option value="submitted">✓ Submitted (current Q)</option>
            <option value="pending">⏳ Pending (current Q)</option>
          </select>
          <div className="members-sort-group">
            <span className="members-sort-label">Sort:</span>
            <button className={`members-sort-btn ${sortKey === "name" ? "active" : ""}`} onClick={() => toggleSort("name")}>
              Name{sortArrow("name")}
            </button>
            <button className={`members-sort-btn ${sortKey === "score" ? "active" : ""}`} onClick={() => toggleSort("score")}>
              Score{sortArrow("score")}
            </button>
            <button className={`members-sort-btn ${sortKey === "joinedAt" ? "active" : ""}`} onClick={() => toggleSort("joinedAt")}>
              Reg. Time{sortArrow("joinedAt")}
            </button>
          </div>
        </div>

        {/* Table (desktop) / cards (mobile) */}
        <div className="members-table-wrap">
          <table className="members-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Club</th>
                <th>Reg. Time</th>
                <th>Status</th>
                <th>Score</th>
                <th>Bonus 🔥</th>
                <th>Correct</th>
                <th>Wrong</th>
                <th>Submissions</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleMembers.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: "center", padding: "28px", color: "var(--text-muted)" }}>
                    {loading ? "Loading members…" : members.length === 0 ? "No participants have joined yet." : "No members match your filters."}
                  </td>
                </tr>
              ) : (
                visibleMembers.map((m, idx) => (
                  <tr key={m.id}>
                    <td style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>{idx + 1}</td>
                    <td style={{ fontWeight: 700 }}>{m.name}</td>
                    <td>
                      <span style={{ fontSize: "0.8rem", fontWeight: 800, color: clubColor(m.club) }}>{clubLabel(m.club)}</span>
                    </td>
                    <td style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{formatTime(m.joinedAt)}</td>
                    <td>
                      {m.submitted ? (
                        <span className="badge badge-live" style={{ fontSize: "0.65rem" }}>✓ Answered</span>
                      ) : (
                        <span className="badge badge-waiting" style={{ fontSize: "0.65rem" }}>⏳ Pending</span>
                      )}
                    </td>
                    <td style={{ fontWeight: 900, color: "#fbbf24", fontFamily: "var(--font-mono)" }}>{m.score}</td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>
                      {(m.bonusPoints || 0) > 0 || (m.fastestStreak || 0) >= 3 ? (
                        <span style={{ color: "#fb923c", fontWeight: 800 }} title={`${m.fastestStreak || 0}-fastest streak`}>
                          🔥 {m.bonusPoints || 0} pts
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-dim)" }}>—</span>
                      )}
                    </td>
                    <td style={{ color: "#4ade80", fontFamily: "var(--font-mono)" }}>{m.correctCount}</td>
                    <td style={{ color: "#f87171", fontFamily: "var(--font-mono)" }}>{m.wrongCount}</td>
                    <td style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{m.attemptCount}</td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm kick-btn"
                        onClick={() => setKickTarget(m)}
                        disabled={kickLoading}
                      >
                        🚪 KICK
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile card list (hidden on wide screens) */}
        <div className="members-cards">
          {visibleMembers.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px", color: "var(--text-muted)" }}>
              {loading ? "Loading members…" : "No members match your filters."}
            </div>
          ) : (
            visibleMembers.map((m) => (
              <div key={m.id} className="member-card">
                <div className="member-card-head">
                  <span className="member-card-name">{m.name}</span>
                  <span className="member-card-club" style={{ color: clubColor(m.club) }}>{clubLabel(m.club)}</span>
                </div>
                <div className="member-card-stats">
                  <span>Score <strong style={{ color: "#fbbf24" }}>{m.score}</strong></span>
                  {(m.bonusPoints || 0) > 0 && <span>🔥 Bonus <strong style={{ color: "#fb923c" }}>{m.bonusPoints}</strong></span>}
                  <span>✓ <strong style={{ color: "#4ade80" }}>{m.correctCount}</strong></span>
                  <span>✕ <strong style={{ color: "#f87171" }}>{m.wrongCount}</strong></span>
                  <span>Subs <strong>{m.attemptCount}</strong></span>
                </div>
                <div className="member-card-foot">
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    {formatTime(m.joinedAt)} · {m.submitted ? "✓ Answered" : "⏳ Pending"}
                  </span>
                  <button className="btn btn-danger btn-sm kick-btn" onClick={() => setKickTarget(m)} disabled={kickLoading}>
                    🚪 KICK
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Kick confirmation modal */}
        {kickTarget && (
          <div className="modal-backdrop" onClick={() => !kickLoading && setKickTarget(null)}>
            <div className="modal-card kick-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Kick participant confirmation">
              <div className="test-warning-title">🚪 Kick {kickTarget.name}?</div>
              <div className="test-warning-body">
                <p>Are you sure you want to remove this participant?</p>
                <p style={{ marginTop: "8px", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  Their session will be invalidated immediately and they will be returned to the join screen. This does not affect other students or club totals.
                </p>
              </div>
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => setKickTarget(null)} disabled={kickLoading}>
                  Cancel
                </button>
                <button className="btn btn-danger" onClick={confirmKick} disabled={kickLoading}>
                  {kickLoading ? "Removing…" : "Yes, Kick Them"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
