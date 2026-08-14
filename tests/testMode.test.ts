import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import http from "node:http";
import { app } from "../api/index";
import { TEST_QUESTIONS } from "../server/src/data/testQuestionsData";
import { QUESTIONS } from "../server/src/data/questionsData";
import { ApiError, isSessionExpired } from "../client/src/services/api";

describe("Test mode — 20-question isolated quiz + global student logout", () => {
  let server: http.Server;
  let baseUrl: string;

  const adminHeaders = {
    "Content-Type": "application/json",
    "x-admin-password": "MadeBySagar",
  };

  const api = (path: string, init?: RequestInit) => fetch(`${baseUrl}/api${path}`, init);

  beforeAll(async () => {
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(async () => {
    await api("/admin/reset-all-fresh", { method: "POST", headers: adminHeaders, body: "{}" });
    await api("/test/admin/reset-all-fresh", { method: "POST", headers: adminHeaders, body: "{}" });
  });

  // ── 1. Question set ─────────────────────────────────────────────────────────
  it("test quiz contains exactly 20 questions and no other questions", () => {
    expect(TEST_QUESTIONS).toHaveLength(20);
    expect(TEST_QUESTIONS.map((q) => q.questionNumber)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });

  // ── 2. ID isolation ─────────────────────────────────────────────────────────
  it("test question IDs are isolated from live question IDs", () => {
    const liveIds = new Set(QUESTIONS.map((q) => q.id));
    for (const q of TEST_QUESTIONS) {
      expect(liveIds.has(q.id)).toBe(false);
      expect(q.id).toBeGreaterThanOrEqual(2000);
    }
    expect(QUESTIONS).toHaveLength(100);
  });

  // ── 3. Test mode can be initialized ─────────────────────────────────────────
  it("test mode can be initialized (start a question)", async () => {
    const res = await api("/test/admin/start-question", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ questionNumber: 1 }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.state.status).toBe("LIVE");
    expect(data.state.currentQuestionId).toBe(1);
  });

  // ── 4. Participants can join test mode ──────────────────────────────────────
  it("test participants can join test mode", async () => {
    const res = await api("/test/participants/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Tester One", club: "STACK_PUSH" }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.participant.sessionToken).toBeDefined();
    expect(data.participant.club).toBe("STACK_PUSH");
  });

  // ── 5/6/7. Submit, scoring, leaderboard ─────────────────────────────────────
  it("test answers can be submitted, scored server-side, and reflected on the leaderboard", async () => {
    await api("/test/admin/start-question", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ questionNumber: 1 }),
    });
    const q1 = TEST_QUESTIONS[0];

    const regA = await (
      await api("/test/participants/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Alice", club: "STACK_PUSH" }),
      })
    ).json();
    const regB = await (
      await api("/test/participants/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Bob", club: "IT_INNOVATORS" }),
      })
    ).json();

    const subA = await api("/test/questions/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: regA.participant.sessionToken, questionId: q1.id, answer: q1.correctAnswer }),
    });
    const subAData = await subA.json();
    expect(subA.status).toBe(200);
    expect(subAData.ok).toBe(true);
    // correctness must NOT leak to the student at submit time
    expect(subAData.submission.isCorrect).toBeUndefined();
    expect(subAData.submission.pointsAwarded).toBeUndefined();
    expect(subAData.submission.answer).toBe(q1.correctAnswer);

    const subB = await api("/test/questions/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: regB.participant.sessionToken, questionId: q1.id, answer: "D" }),
    });
    expect(subB.status).toBe(200);

    await api("/test/admin/reveal-answer", { method: "POST", headers: adminHeaders, body: "{}" });

    const lb = await (await api("/test/leaderboard")).json();
    const total = lb.clubs.reduce((sum: number, c: { score: number }) => sum + c.score, 0);
    expect(total).toBe(q1.points);

    // Live leaderboard must be completely unaffected by test activity
    const liveLb = await (await api("/leaderboard")).json();
    const liveTotal = liveLb.clubs.reduce((sum: number, c: { score: number }) => sum + c.score, 0);
    expect(liveTotal).toBe(0);
  });

  // ── 8. Test reset doesn't affect live ───────────────────────────────────────
  it("test mode reset does not affect live mode", async () => {
    // Live: register + score
    await api("/admin/start-question", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ questionNumber: 1 }),
    });
    const regLive = await (
      await api("/participants/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Live Kid", club: "STACK_PUSH" }),
      })
    ).json();
    await api("/questions/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: regLive.participant.sessionToken, questionId: QUESTIONS[0].id, answer: QUESTIONS[0].correctAnswer }),
    });
    await api("/admin/reveal-answer", { method: "POST", headers: adminHeaders, body: "{}" });

    // Test: register + score
    await api("/test/admin/start-question", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ questionNumber: 1 }),
    });
    const regTest = await (
      await api("/test/participants/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test Kid", club: "IT_INNOVATORS" }),
      })
    ).json();
    await api("/test/questions/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: regTest.participant.sessionToken, questionId: TEST_QUESTIONS[0].id, answer: TEST_QUESTIONS[0].correctAnswer }),
    });
    await api("/test/admin/reveal-answer", { method: "POST", headers: adminHeaders, body: "{}" });

    // Reset ONLY test mode
    await api("/test/admin/reset-all-fresh", { method: "POST", headers: adminHeaders, body: "{}" });

    const testLb = await (await api("/test/leaderboard")).json();
    expect(testLb.clubs.reduce((sum: number, c: { score: number }) => sum + c.score, 0)).toBe(0);

    const liveLb = await (await api("/leaderboard")).json();
    expect(liveLb.clubs.reduce((sum: number, c: { score: number }) => sum + c.score, 0)).toBe(QUESTIONS[0].points);

    // Live student session still valid after a test reset
    const liveSession = await api(`/participants/session?token=${encodeURIComponent(regLive.participant.sessionToken)}`);
    expect(liveSession.status).toBe(200);
  });

  // ── 9. Live reset doesn't affect test ───────────────────────────────────────
  it("live mode reset does not affect test mode", async () => {
    await api("/admin/start-question", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ questionNumber: 1 }),
    });
    const regLive = await (
      await api("/participants/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Live Kid 2", club: "IT_INNOVATORS" }),
      })
    ).json();
    await api("/questions/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: regLive.participant.sessionToken, questionId: QUESTIONS[0].id, answer: QUESTIONS[0].correctAnswer }),
    });
    await api("/admin/reveal-answer", { method: "POST", headers: adminHeaders, body: "{}" });

    await api("/test/admin/start-question", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ questionNumber: 1 }),
    });
    const regTest = await (
      await api("/test/participants/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test Kid 2", club: "STACK_PUSH" }),
      })
    ).json();
    await api("/test/questions/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: regTest.participant.sessionToken, questionId: TEST_QUESTIONS[0].id, answer: TEST_QUESTIONS[0].correctAnswer }),
    });
    await api("/test/admin/reveal-answer", { method: "POST", headers: adminHeaders, body: "{}" });

    // Reset ONLY live mode
    await api("/admin/reset-all-fresh", { method: "POST", headers: adminHeaders, body: "{}" });

    const liveLb = await (await api("/leaderboard")).json();
    expect(liveLb.clubs.reduce((sum: number, c: { score: number }) => sum + c.score, 0)).toBe(0);

    const testLb = await (await api("/test/leaderboard")).json();
    expect(testLb.clubs.reduce((sum: number, c: { score: number }) => sum + c.score, 0)).toBe(TEST_QUESTIONS[0].points);

    const testSession = await api(`/test/participants/session?token=${encodeURIComponent(regTest.participant.sessionToken)}`);
    expect(testSession.status).toBe(200);
  });

  // ── 10-14. Global student logout ────────────────────────────────────────────
  it("logout-all invalidates sessions: old token rejected, new student joins, admin stays valid", async () => {
    const reg = await (
      await api("/test/participants/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Victim", club: "STACK_PUSH" }),
      })
    ).json();
    const token = reg.participant.sessionToken;

    // Session works before logout
    const before = await api(`/test/participants/session?token=${encodeURIComponent(token)}`);
    expect(before.status).toBe(200);

    // Host logs out all test students
    const logout = await api("/test/admin/logout-all-students", {
      method: "POST",
      headers: adminHeaders,
      body: "{}",
    });
    expect(logout.status).toBe(200);

    // (14) Student receives a proper session-expired response
    const after = await api(`/test/participants/session?token=${encodeURIComponent(token)}`);
    expect(after.status).toBe(401);
    const afterData = await after.json();
    expect(afterData.code).toBe("SESSION_EXPIRED");

    // (11) Old token cannot re-enter / submit
    await api("/test/admin/start-question", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ questionNumber: 1 }),
    });
    const resub = await api("/test/questions/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, questionId: TEST_QUESTIONS[0].id, answer: "A" }),
    });
    expect(resub.status).toBe(401);

    // (12) A brand-new student can join after logout
    const reg2 = await api("/test/participants/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Fresh", club: "IT_INNOVATORS" }),
    });
    expect(reg2.status).toBe(200);
    const reg2Data = await reg2.json();
    const fresh = await api(`/test/participants/session?token=${encodeURIComponent(reg2Data.participant.sessionToken)}`);
    expect(fresh.status).toBe(200);

    // (13) Admin session remains valid after logging out students
    const summary = await api("/test/admin/summary", { headers: adminHeaders });
    expect(summary.status).toBe(200);
    const liveSummary = await api("/admin/summary", { headers: adminHeaders });
    expect(liveSummary.status).toBe(200);
  });

  it("logout-all in test mode does not log out live students (and vice versa)", async () => {
    const regLive = await (
      await api("/participants/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "LiveSafe", club: "STACK_PUSH" }),
      })
    ).json();
    const regTest = await (
      await api("/test/participants/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "TestGone", club: "IT_INNOVATORS" }),
      })
    ).json();

    await api("/test/admin/logout-all-students", { method: "POST", headers: adminHeaders, body: "{}" });

    const testSession = await api(`/test/participants/session?token=${encodeURIComponent(regTest.participant.sessionToken)}`);
    expect(testSession.status).toBe(401);
    const liveSession = await api(`/participants/session?token=${encodeURIComponent(regLive.participant.sessionToken)}`);
    expect(liveSession.status).toBe(200);

    // Now log out live students too — test students (already gone) stay gone, admin unaffected
    await api("/admin/logout-all-students", { method: "POST", headers: adminHeaders, body: "{}" });
    const liveAfter = await api(`/participants/session?token=${encodeURIComponent(regLive.participant.sessionToken)}`);
    expect(liveAfter.status).toBe(401);
    const admin = await api("/admin/summary", { headers: adminHeaders });
    expect(admin.status).toBe(200);
  });

  it("students never receive the correct answer through the session poll", async () => {
    await api("/test/admin/start-question", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ questionNumber: 1 }),
    });
    const reg = await (
      await api("/test/participants/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Spy", club: "STACK_PUSH" }),
      })
    ).json();
    const session = await api(`/test/participants/session?token=${encodeURIComponent(reg.participant.sessionToken)}`);
    const data = await session.json();
    expect(session.status).toBe(200);
    expect((data.currentQuestion as any)?.correctAnswer).toBeUndefined();
  });

  // ── 15. Client-side session-expired detection (drives the join-screen redirect) ──
  it("isSessionExpired detects the host-ended-session error code", () => {
    const expired = new ApiError("Your session was ended by the host.", 401, "SESSION_EXPIRED");
    expect(isSessionExpired(expired)).toBe(true);
    expect(isSessionExpired(new ApiError("Participant not found", 404))).toBe(false);
    expect(isSessionExpired(new Error("network down"))).toBe(false);
  });
});
