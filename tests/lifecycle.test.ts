/**
 * New-event lifecycle, 5s countdown, individual kick, members page, and
 * deterministic leaderboard tests. Runs against the real Upstash Redis via the
 * Express app, exactly like the other API test files. All state is scoped per
 * mode (live/test) and reset to a clean baseline in beforeEach.
 */

import { describe, expect, it, beforeAll, afterAll, beforeEach, vi } from "vitest";
import http from "node:http";
import { app } from "../api/index";
import { QUESTIONS } from "../server/src/data/questionsData";
import { TEST_QUESTIONS } from "../server/src/data/testQuestionsData";
import { filterAndSortMembers, type Member } from "../client/src/pages/MembersPage";

describe("New event lifecycle, kick, members, deterministic ordering", () => {
  let server: http.Server;
  let baseUrl: string;

  const adminHeaders = { "Content-Type": "application/json", "x-admin-password": "MadeBySagar" };
  const jsonHeaders = { "Content-Type": "application/json" };

  const api = (path: string, init?: RequestInit) => fetch(`${baseUrl}/api${path}`, init);

  // Live mode routes have no prefix; only test mode uses /test. Keep them
  // explicit so a wrong prefix (e.g. /live/…) can never silently 404.
  const register = async (mode: string, name: string, club: string) => {
    const res = await api(
      mode === "test" ? "/test/participants/register" : "/participants/register",
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ name, club }),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (res.status !== 200) console.log("REGISTER FAIL", mode, name, res.status, JSON.stringify(data));
    return { status: res.status, data };
  };

  const reset = (mode: string) =>
    api(mode === "test" ? "/test/admin/reset-all-fresh" : "/admin/reset-all-fresh", {
      method: "POST",
      headers: adminHeaders,
      body: "{}",
    });

  // Fresh events start with the portal CLOSED — open it so students can join.
  const openPortal = (mode: string) =>
    api(mode === "test" ? "/test/admin/open-portal" : "/admin/open-portal", {
      method: "POST",
      headers: adminHeaders,
      body: "{}",
    });

  beforeAll(async () => {
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    // Leave the shared Redis store clean so no test students leak into the app.
    await reset("live");
    await reset("test");
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(async () => {
    await reset("live");
    await reset("test");
    await openPortal("live");
    await openPortal("test");
  });

  // ── 1+2. Fresh event starts PREPARING and Q1 is unavailable ────────────────
  it("fresh event starts PREPARING (not Q1) and Q1 is hidden from students", async () => {
    const qs = await (await api("/quiz-state")).json();
    expect(qs.session.status).toBe("PREPARING");
    expect(qs.session.currentQuestionId).toBeNull();
    expect(qs.currentQuestion).toBeNull();

    const reg = await register("live", "Early Bird", "STACK_PUSH");
    expect(reg.status).toBe(200);

    const poll = await (
      await api(`/participants/session?token=${encodeURIComponent(reg.data.participant.sessionToken)}`)
    ).json();
    expect(poll.sessionStatus).toBe("PREPARING");
    expect(poll.currentQuestion).toBeNull();

    // A student cannot submit during PREPARING — no question is live.
    const sub = await api("/questions/submit", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ token: reg.data.participant.sessionToken, questionId: QUESTIONS[0].id, answer: "A" }),
    });
    expect(sub.status).toBe(400);
    expect((await sub.json()).error).toBe("Question is not live");
  });

  // ── 3+4+5. Admin explicitly starts the quiz; 5s countdown; PREPARING→COUNTDOWN→LIVE ──
  it("admin start-countdown sets a 5-second countdown, then server transitions to LIVE", async () => {
    const before = Date.now();
    const res = await api("/admin/start-countdown", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ questionNumber: 1 }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.state.status).toBe("COUNTDOWN");
    const endsAt = new Date(data.state.countdownEndsAt).getTime();
    // Server-side countdown must be ~5s (not the old 3s), accounting for latency.
    expect(endsAt - before).toBeGreaterThan(4000);
    expect(endsAt - before).toBeLessThan(8000);

    // During the countdown the SANITIZED question is preloaded so every device
    // can reveal it at the exact same moment countdownEndsAt passes — but the
    // correct answer must never leak to students.
    const reg = await register("live", "Watcher", "IT_INNOVATORS");
    const poll = await (
      await api(`/participants/session?token=${encodeURIComponent(reg.data.participant.sessionToken)}`)
    ).json();
    expect(poll.sessionStatus).toBe("COUNTDOWN");
    expect(poll.currentQuestion).not.toBeNull();
    expect(poll.currentQuestion.questionNumber).toBe(1);
    expect(poll.currentQuestion.correctAnswer).toBeUndefined();

    // Advance the server clock past countdownEndsAt: the next state read
    // auto-transitions COUNTDOWN -> LIVE (server-authoritative).
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(endsAt + 1000));
      const live = await (await api("/quiz-state")).json();
      expect(live.session.status).toBe("LIVE");
      expect(live.currentQuestion.questionNumber).toBe(1);
    } finally {
      vi.useRealTimers();
    }

    // A student poll now receives Q1.
    const poll2 = await (
      await api(`/participants/session?token=${encodeURIComponent(reg.data.participant.sessionToken)}`)
    ).json();
    expect(poll2.sessionStatus).toBe("LIVE");
    expect(poll2.currentQuestion.questionNumber).toBe(1);
  });

  // ── Invalid transitions are rejected server-side ───────────────────────────
  it("rejects invalid state transitions server-side", async () => {
    // LIVE -> COUNTDOWN must fail (cannot restart a live question with a countdown)
    await api("/admin/start-question", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ questionNumber: 1 }),
    });
    const bad = await api("/admin/start-countdown", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ questionNumber: 1 }),
    });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toContain("Invalid transition");

    // LOCKED -> LOCKED must fail
    await api("/admin/lock-answers", { method: "POST", headers: adminHeaders, body: "{}" });
    const relock = await api("/admin/lock-answers", { method: "POST", headers: adminHeaders, body: "{}" });
    expect(relock.status).toBe(400);

    // PREPARING -> REVEALED must fail (nothing to reveal)
    await reset("live");
    const reveal = await api("/admin/reveal-answer", { method: "POST", headers: adminHeaders, body: "{}" });
    expect(reveal.status).toBe(400);
  });

  // ── 6-10. Individual kick ──────────────────────────────────────────────────
  it("kicks a single student without affecting others, admin, club totals, or quiz state", async () => {
    const alice = await register("live", "Alice Kick", "STACK_PUSH");
    const bob = await register("live", "Bob Safe", "STACK_PUSH");
    expect(alice.status).toBe(200);
    expect(bob.status).toBe(200);

    // Both answer Q1 correctly so the club total and scores are non-trivial.
    await api("/admin/start-question", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ questionNumber: 1 }),
    });
    for (const reg of [alice, bob]) {
      const sub = await api("/questions/submit", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ token: reg.data.participant.sessionToken, questionId: QUESTIONS[0].id, answer: QUESTIONS[0].correctAnswer }),
      });
      expect(sub.status).toBe(200);
    }
    await api("/admin/reveal-answer", { method: "POST", headers: adminHeaders, body: "{}" });

    const clubBefore = (await (await api("/leaderboard")).json()).clubs.find((c: any) => c.name === "STACK_PUSH").score;
    expect(clubBefore).toBe(2 * QUESTIONS[0].points);

    // Kick Alice only.
    const kick = await api("/admin/kick-participant", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ token: alice.data.participant.sessionToken }),
    });
    expect(kick.status).toBe(200);
    expect((await kick.json()).ok).toBe(true);

    // 7. Kicked student receives 401 PARTICIPANT_KICKED on the next request.
    const alicePoll = await api(`/participants/session?token=${encodeURIComponent(alice.data.participant.sessionToken)}`);
    expect(alicePoll.status).toBe(401);
    expect((await alicePoll.json()).code).toBe("PARTICIPANT_KICKED");

    // 8. Kicked student cannot reuse the old token to submit either.
    await api("/admin/start-question", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ questionNumber: 2 }),
    });
    const aliceSub = await api("/questions/submit", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ token: alice.data.participant.sessionToken, questionId: QUESTIONS[1].id, answer: "A" }),
    });
    expect(aliceSub.status).toBe(401);
    expect((await aliceSub.json()).code).toBe("PARTICIPANT_KICKED");

    // 9. Other students are completely unaffected.
    const bobPoll = await api(`/participants/session?token=${encodeURIComponent(bob.data.participant.sessionToken)}`);
    expect(bobPoll.status).toBe(200);
    expect((await bobPoll.json()).participant.name).toBe("Bob Safe");

    // 10. Admin remains logged in and the roster dropped only Alice.
    const summary = await api("/admin/summary", { headers: adminHeaders });
    expect(summary.status).toBe(200);
    const summaryData = await summary.json();
    expect(summaryData.participantsCount).toBe(1);
    expect(summaryData.participants[0].name).toBe("Bob Safe");

    // Club total is NOT reset by the individual kick.
    const clubAfter = (await (await api("/leaderboard")).json()).clubs.find((c: any) => c.name === "STACK_PUSH").score;
    expect(clubAfter).toBe(clubBefore);

    // Quiz state is untouched: still on Q2 as the host set it.
    expect(summaryData.currentQuestionId).toBe(2);

    // Old token can never re-enter — but a fresh registration is allowed.
    const again = await api(`/participants/session?token=${encodeURIComponent(alice.data.participant.sessionToken)}`);
    expect(again.status).toBe(401);
    const fresh = await register("live", "Alice Kick", "STACK_PUSH");
    expect(fresh.status).toBe(200);
    const freshPoll = await api(`/participants/session?token=${encodeURIComponent(fresh.data.participant.sessionToken)}`);
    expect(freshPoll.status).toBe(200);
  });

  // ── 11-13. Members page loads, filters, searches ───────────────────────────
  it("members endpoint lists participants with full details and supports filtering/search/sorting", async () => {
    await register("live", "Zara Alpha", "STACK_PUSH");
    await register("live", "Manoj Beta", "IT_INNOVATORS");
    await register("live", "Aarav Gamma", "STACK_PUSH");

    const res = await api("/admin/members", { headers: adminHeaders });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.participants).toHaveLength(3);

    for (const m of data.participants) {
      expect(m).toHaveProperty("name");
      expect(m).toHaveProperty("club");
      expect(m).toHaveProperty("joinedAt");
      expect(m).toHaveProperty("score");
      expect(m).toHaveProperty("correctCount");
      expect(m).toHaveProperty("wrongCount");
      expect(m).toHaveProperty("attemptCount");
      expect(m).toHaveProperty("submitted");
      expect(m).toHaveProperty("sessionToken");
    }

    const members: Member[] = data.participants;
    // Club filter
    expect(filterAndSortMembers(members, { search: "", club: "STACK_PUSH", status: "", sortKey: "score", sortDir: "desc" }).map((m) => m.name)).toEqual(["Zara Alpha", "Aarav Gamma"]);
    // Search
    expect(filterAndSortMembers(members, { search: "manoj", club: "", status: "", sortKey: "score", sortDir: "desc" }).map((m) => m.name)).toEqual(["Manoj Beta"]);
    // Sort by name asc
    expect(filterAndSortMembers(members, { search: "", club: "", status: "", sortKey: "name", sortDir: "asc" }).map((m) => m.name)).toEqual(["Aarav Gamma", "Manoj Beta", "Zara Alpha"]);
    // Sort by registration asc (oldest first)
    expect(filterAndSortMembers(members, { search: "", club: "", status: "", sortKey: "joinedAt", sortDir: "asc" }).map((m) => m.name)).toEqual(["Zara Alpha", "Manoj Beta", "Aarav Gamma"]);
  });

  // ── 14+15. Leaderboard ordering is deterministic and stable ────────────────
  it("leaderboard ordering is deterministic and equal-score users never shift", async () => {
    // All three get identical scores/correct counts; ordering must fall back to
    // total correct-answer time ASC (speed breaks ties — the winner is the one
    // who gets the same answers right in less time), then joinedAt ASC, id ASC
    // — and stay byte-for-byte stable between polls.
    const names = ["Same Score 1", "Same Score 2", "Same Score 3"];
    for (const n of names) await register("live", n, "STACK_PUSH");

    await api("/admin/start-question", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ questionNumber: 1 }),
    });
    const regs = await Promise.all(names.map((n) => register("live", n, "IT_INNOVATORS")));
    for (const r of regs) {
      await api("/questions/submit", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ token: r.data.participant.sessionToken, questionId: QUESTIONS[0].id, answer: QUESTIONS[0].correctAnswer }),
      });
    }

    const first = (await (await api("/leaderboard")).json()).students;
    const second = (await (await api("/leaderboard")).json()).students;
    // 15. Equal-score users must not shift between polls — the order must be
    // byte-for-byte identical across two consecutive reads.
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    // 14. Ordering is deterministic: score DESC, correct DESC, total
    // correct-answer time ASC (faster wins ties), joinedAt ASC, id ASC. With
    // equal scores, the order must equal a stable sort by (correctResponseMs,
    // joinedAt, id) — never random map/hash order.
    const scorers = first.filter((s: any) => s.score > 0);
    const stableOrder = [...scorers]
      .sort(
        (a: any, b: any) =>
          (Number(a.correctResponseMs) || 0) - (Number(b.correctResponseMs) || 0) ||
          String(a.joinedAt || "").localeCompare(String(b.joinedAt || "")) ||
          a.id - b.id,
      )
      .map((s: any) => s.name);
    expect(scorers.map((s: any) => s.name)).toEqual(stableOrder);
    // All 6 appear exactly once.
    expect(first).toHaveLength(6);
    expect(new Set(first.map((s: any) => s.id)).size).toBe(6);
  });

  // ── 21-23. Test members stay isolated from live members ────────────────────
  it("test participants never appear in live members (and vice versa)", async () => {
    await register("live", "Live Only", "STACK_PUSH");
    await register("test", "Test Only", "IT_INNOVATORS");

    const liveMembers = (await (await api("/admin/members", { headers: adminHeaders })).json()).participants;
    expect(liveMembers.map((m: any) => m.name)).toEqual(["Live Only"]);

    const testMembers = (await (await api("/test/admin/members", { headers: adminHeaders })).json()).participants;
    expect(testMembers.map((m: any) => m.name)).toEqual(["Test Only"]);
  });

  // ── 24. Test mode works with multiple students (compact version) ───────────
  it("test mode supports multiple students, scoring, and question transitions", async () => {
    const q1 = TEST_QUESTIONS[0];
    const students = await Promise.all([
      register("test", "T1", "STACK_PUSH"),
      register("test", "T2", "IT_INNOVATORS"),
      register("test", "T3", "STACK_PUSH"),
    ]);
    for (const s of students) expect(s.status).toBe(200);

    await api("/test/admin/start-question", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ questionNumber: q1.questionNumber }),
    });

    const polls = await Promise.all(
      students.map((s) => api(`/test/participants/session?token=${encodeURIComponent(s.data.participant.sessionToken)}`)),
    );
    for (const p of polls) {
      const d = await p.json();
      expect(p.status).toBe(200);
      expect(d.sessionStatus).toBe("LIVE");
      expect(d.currentQuestion.id).toBe(q1.id);
    }

    const corrects = await Promise.all(
      students.map((s, i) =>
        api("/test/questions/submit", {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ token: s.data.participant.sessionToken, questionId: q1.id, answer: i < 2 ? q1.correctAnswer : "D" }),
        }),
      ),
    );
    for (const c of corrects) expect(c.status).toBe(200);

    await api("/test/admin/reveal-answer", { method: "POST", headers: adminHeaders, body: "{}" });
    const lb = await (await api("/test/leaderboard")).json();
    const total = lb.clubs.reduce((s: number, c: any) => s + c.score, 0);
    expect(total).toBe(2 * q1.points);
  });
});
