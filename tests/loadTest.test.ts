/**
 * PRODUCTION-READINESS LOAD REHEARSAL — 60 concurrent students
 *
 * Runs against the REAL Upstash Redis (same store the deployed app uses) via
 * the Express app, exactly like the other API test files. The rehearsal runs
 * in TEST MODE (/api/test/...) so the live 100-question college quiz is never
 * disturbed, and it proves live/test isolation by comparing live-mode state
 * before and after the load. 60 is the test portal's maximum membership (the
 * live event portal is unlimited), so the rehearsal exercises the full cap.
 *
 * Coverage (from the production-readiness checklist):
 *   1. 60 students join simultaneously (test-portal cap)
 *   2. split between Stack.push and IT Innovators
 *   3. all 60 receive the same live question
 *   4. all 60 submit during the same 30s window
 *   5. submissions occurring almost simultaneously (8×5-way bursts)
 *   6. no duplicate submissions accepted (race + sequential)
 *   7. server-side responseTimeMs is correct
 *   8. scores remain consistent
 *   9. club scores == sum of participant scores
 *   10. fastest-correct leaderboard is correct (under simultaneous fire)
 *   11. admin starts the next question
 *   12. all 60 clients receive the new question
 *   13. admin locks the question
 *   14. late submissions rejected
 *   15. admin reveals the answer
 *   16. students never receive correctAnswer before reveal
 *   17. refresh students during LIVE
 *   18. refresh students during LOCKED
 *   19. refresh admin during LIVE
 *   20. Log Out All Students with 60 active participants
 *   21. logout duration measured
 *   22. all 60 old sessions receive SESSION_EXPIRED on next request
 *   23. old tokens cannot rejoin
 *   24. a new student can join afterward
 *   25. admin remains authenticated
 *   26. live mode and test mode remain completely isolated
 *   27. no fabricated WAITING state while Redis is unavailable
 *   28. no submissions accepted while Redis is unavailable
 *   29. score cannot be modified by the client
 *   30. responseTimeMs cannot be supplied by the client
 */

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { app } from "../api/index";
import { TEST_QUESTIONS } from "../server/src/data/testQuestionsData";

const STUDENT_COUNT = 60;
const MODE = "test";

// ── Metrics gathered for the report ─────────────────────────────────────────
const metrics: Record<string, any> = {
  maxConcurrentStudents: STUDENT_COUNT,
  registrations: {},
  questionPolls: {},
  submissions: {},
  firstSubmissionBursts: 0,
  sequentialDuplicateAttempts: 0,
  lateSubmissions: { attempted: 0, rejected: 0 },
  responseTime: {},
  scoreConsistent: null,
  clubScoresMatchParticipants: null,
  fastestConsistent: null,
  logoutAllMs: 0,
  sessionExpiredAfterLogout: 0,
  redisPingOk: false,
  redisErrors: 0,
  unexpectedFailures: 0,
};

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

describe("Production-readiness load rehearsal — 60 concurrent students (test mode)", () => {
  let server: http.Server;
  let baseUrl: string;

  const adminHeaders = { "Content-Type": "application/json", "x-admin-password": "MadeBySagar" };
  const jsonHeaders = { "Content-Type": "application/json" };

  const api = (path: string, init?: RequestInit) => fetch(`${baseUrl}/api${path}`, init);

  const register = (mode: string, name: string, club: string) =>
    api(`/${mode}/participants/register`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ name, club }),
    }).then(async (res) => ({ status: res.status, data: await res.json().catch(() => ({})) }));

  const submit = (mode: string, token: string, questionId: number, answer: string, extra: any = {}) =>
    api(`/${mode}/questions/submit`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ token, questionId, answer, ...extra }),
    }).then(async (res) => ({ status: res.status, data: await res.json().catch(() => ({})) }));

  const sessionPoll = (mode: string, token: string) =>
    api(`/${mode}/participants/session?token=${encodeURIComponent(token)}`).then(async (res) => ({
      status: res.status,
      data: await res.json().catch(() => ({})),
    }));

  beforeAll(async () => {
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;

    // Clean test-mode state so the rehearsal starts from a known baseline.
    await api(`/${MODE}/admin/reset-all-fresh`, { method: "POST", headers: adminHeaders, body: "{}" });
    // Fresh events start with the portal CLOSED — open it so students can join.
    await api(`/${MODE}/admin/open-portal`, { method: "POST", headers: adminHeaders, body: "{}" });

    // Baseline health / Redis ping.
    const health = await (await api("/health")).json();
    metrics.redisPingOk = health.ok === true && health.redis === "PONG";
  });

  afterAll(async () => {
    console.log("\n════════════ LOAD TEST REPORT ════════════");
    console.log(JSON.stringify(metrics, null, 2));
    console.log("══════════════════════════════════════════");
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it(
    "rehearsal: 60 students join → answer → next question → lock → reveal → logout-all",
    async () => {
      // ── 26. Live-mode baseline (must be identical after the whole rehearsal) ──
      const liveBefore = await (await api("/admin/summary", { headers: adminHeaders })).json();
      const liveBeforeCount = liveBefore.participantsCount;
      const liveBeforeScore = liveBefore.clubs.reduce((s: number, c: any) => s + c.score, 0);

      // ── 1+2. 60 students join simultaneously, split 30/30 across clubs ──
      const regStart = Date.now();
      const regs = await Promise.all(
        Array.from({ length: STUDENT_COUNT }, async (_, i) => {
          const t0 = Date.now();
          const r = await register(
            MODE,
            `Student ${String(i + 1).padStart(2, "0")}`,
            i % 2 === 0 ? "STACK_PUSH" : "IT_INNOVATORS",
          );
          return { ...r, idx: i, ms: Date.now() - t0 };
        }),
      );
      const regMs = Date.now() - regStart;

      const failedRegs = regs.filter((r) => r.status !== 200);
      metrics.unexpectedFailures += failedRegs.length;
      for (const r of regs) expect(r.status, JSON.stringify(r.data)).toBe(200);
      expect(new Set(regs.map((r) => r.data.participant.sessionToken)).size).toBe(STUDENT_COUNT);
      const stackCount = regs.filter((r) => r.data.participant.club === "STACK_PUSH").length;
      expect(stackCount).toBe(STUDENT_COUNT / 2);
      metrics.registrations = {
        count: STUDENT_COUNT,
        wallClockMs: regMs,
        avgMs: +avg(regs.map((r) => r.ms)).toFixed(1),
        worstMs: Math.max(...regs.map((r) => r.ms)),
        reqPerSec: +(STUDENT_COUNT / (regMs / 1000)).toFixed(1),
      };

      const tokens = regs.map((r) => r.data.participant.sessionToken);
      const q1 = TEST_QUESTIONS[0];

      // ── 3. Admin starts Q1; all 60 receive the same live question ──
      const start1 = await api(`/${MODE}/admin/start-question`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ questionNumber: q1.questionNumber }),
      });
      expect(start1.status).toBe(200);
      expect((await start1.json()).state.status).toBe("LIVE");

      const pollStart = Date.now();
      const polls1 = await Promise.all(tokens.map((t) => sessionPoll(MODE, t)));
      const pollMs = Date.now() - pollStart;
      metrics.questionPolls.q1 = { count: polls1.length, wallClockMs: pollMs, reqPerSec: +(polls1.length / (pollMs / 1000)).toFixed(1) };
      for (const p of polls1) {
        expect(p.status, JSON.stringify(p.data)).toBe(200);
        expect(p.data.sessionStatus).toBe("LIVE");
        expect(p.data.currentQuestion.questionNumber).toBe(q1.questionNumber);
        expect(p.data.currentQuestion.id).toBe(q1.id);
        // 16. never before reveal
        expect(p.data.currentQuestion.correctAnswer).toBeUndefined();
        expect(p.data.correctAnswer).toBeNull();
      }

      // ── 4+5. All 60 submit in the 30s window; 8 students fire 5-way
      //        simultaneous first submissions (race + fastest-tap stress) ──
      const wrongAnswer = (correct: string) => ["A", "B", "C", "D"].find((x) => x !== correct) as string;
      const answerFor = (idx: number) => (idx < 50 ? q1.correctAnswer : wrongAnswer(q1.correctAnswer));

      const burstStudents = regs.slice(0, 8); // idx 0..7 → correct answers, race for fastest tap
      const normalStudents = regs.slice(8);

      const subStart = Date.now();
      const burstResults = await Promise.all(
        burstStudents.flatMap((reg) =>
          Array.from({ length: 5 }, async (_, k) => {
            const t0 = Date.now();
            const r = await submit(MODE, reg.data.participant.sessionToken, q1.id, answerFor(reg.idx));
            return { ...r, student: reg.idx, attempt: k, ms: Date.now() - t0 };
          }),
        ),
      );
      const normalSubs = await Promise.all(
        normalStudents.map(async (reg) => {
          const t0 = Date.now();
          const r = await submit(MODE, reg.data.participant.sessionToken, q1.id, answerFor(reg.idx));
          return { ...r, student: reg.idx, ms: Date.now() - t0 };
        }),
      );
      const subMs = Date.now() - subStart;
      const allSubs = [...burstResults, ...normalSubs];
      const acceptedSubs = allSubs.filter((r) => r.status === 200);
      const dupRejects = allSubs.filter((r) => r.status === 400 && r.data.error === "Already submitted");
      const unexpected = allSubs.filter((r) => r.status !== 200 && !(r.status === 400 && r.data.error === "Already submitted"));
      metrics.unexpectedFailures += unexpected.length;

      // ── 6a. Race: each burst student's 5 simultaneous first submissions →
      //        exactly ONE accepted, FOUR rejected as duplicates ──
      metrics.firstSubmissionBursts = burstStudents.length;
      for (let b = 0; b < burstStudents.length; b++) {
        const per = burstResults.filter((r) => r.student === burstStudents[b].idx);
        expect(per.filter((r) => r.status === 200).length).toBe(1);
        expect(per.filter((r) => r.status === 400 && r.data.error === "Already submitted").length).toBe(4);
      }

      // remaining 72 submit exactly once, all accepted
      for (const r of normalSubs) expect(r.status, JSON.stringify(r.data)).toBe(200);

      expect(acceptedSubs.length).toBe(STUDENT_COUNT);
      metrics.submissions = {
        count: STUDENT_COUNT,
        wallClockMs: subMs,
        avgMs: +avg(acceptedSubs.map((r) => r.ms)).toFixed(1),
        worstMs: Math.max(...acceptedSubs.map((r) => r.ms)),
        reqPerSec: +(STUDENT_COUNT / (subMs / 1000)).toFixed(1),
        duplicatesRejected: dupRejects.length,
      };

      // ── 7. responseTimeMs is server-measured and plausible ──
      const rt = acceptedSubs.map((r) => r.data.submission.responseTimeMs as number);
      for (const v of rt) {
        expect(typeof v).toBe("number");
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(30000);
      }
      metrics.responseTime = {
        minMs: Math.min(...rt),
        avgMs: +avg(rt).toFixed(1),
        maxMs: Math.max(...rt),
        windowSec: 30,
      };

      // ── 6b. Sequential duplicate submissions (double-tap) are rejected ──
      const dupTargets = regs.slice(50, 56); // already submitted for Q1
      const dupResults = await Promise.all(
        dupTargets.flatMap((reg) =>
          Array.from({ length: 3 }, () => submit(MODE, reg.data.participant.sessionToken, q1.id, "A")),
        ),
      );
      metrics.sequentialDuplicateAttempts = dupResults.length;
      for (const r of dupResults) {
        expect(r.status).toBe(400);
        expect(r.data.error).toBe("Already submitted");
      }

      // ── 8+9+10. Score consistency, club sums, fastest-correct leaderboard ──
      const summary = await (await api(`/${MODE}/admin/summary`, { headers: adminHeaders })).json();
      expect(summary.participantsCount).toBe(STUDENT_COUNT);
      expect(summary.answersReceived).toBe(STUDENT_COUNT);

      const stackSum = summary.participants
        .filter((p: any) => p.club === "STACK_PUSH")
        .reduce((s: number, p: any) => s + (p.score || 0), 0);
      const innovSum = summary.participants
        .filter((p: any) => p.club === "IT_INNOVATORS")
        .reduce((s: number, p: any) => s + (p.score || 0), 0);
      const stackClub = summary.clubs.find((c: any) => c.name === "STACK_PUSH").score;
      const innovClub = summary.clubs.find((c: any) => c.name === "IT_INNOVATORS").score;
      const awarded = summary.currentSubmissions.reduce((s: number, sub: any) => s + (sub.pointsAwarded || 0), 0);

      expect(stackSum).toBe(stackClub);
      expect(innovSum).toBe(innovClub);
      expect(stackClub + innovClub).toBe(awarded);
      metrics.scoreConsistent = true;
      metrics.clubScoresMatchParticipants = true;
      metrics.clubScores = { STACK_PUSH: stackClub, IT_INNOVATORS: innovClub, total: stackClub + innovClub };

      const correctSubs = summary.currentSubmissions.filter((s: any) => s.isCorrect);
      const minMs = Math.min(...correctSubs.map((s: any) => s.responseTimeMs));
      const winners = correctSubs.filter((s: any) => s.responseTimeMs === minMs).map((s: any) => s.participantName);
      const lb = await (await api(`/${MODE}/leaderboard`)).json();
      expect(lb.fastestTap).toBeTruthy();
      expect(lb.fastestTap.responseTimeMs).toBe(minMs);
      expect(winners).toContain(lb.fastestTap.participantName);
      metrics.fastestConsistent = true;
      metrics.fastestTap = lb.fastestTap;

      // ── 11. Admin starts the next question ──
      const next = await api(`/${MODE}/admin/next-question`, { method: "POST", headers: adminHeaders, body: "{}" });
      expect(next.status).toBe(200);
      const q2 = TEST_QUESTIONS[1];

      // ── 12. All 60 clients receive the new question ──
      const pollsWaiting = await Promise.all(tokens.map((t) => sessionPoll(MODE, t)));
      for (const p of pollsWaiting) {
        expect(p.status).toBe(200);
        expect(p.data.sessionStatus).toBe("WAITING");
      }
      const start2 = await api(`/${MODE}/admin/start-question`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ questionNumber: q2.questionNumber }),
      });
      expect(start2.status).toBe(200);
      const polls2 = await Promise.all(tokens.map((t) => sessionPoll(MODE, t)));
      for (const p of polls2) {
        expect(p.status, JSON.stringify(p.data)).toBe(200);
        expect(p.data.sessionStatus).toBe("LIVE");
        expect(p.data.currentQuestion.questionNumber).toBe(q2.questionNumber);
        expect(p.data.correctAnswer).toBeNull(); // 16. never before reveal
      }
      metrics.questionPolls.q2 = { count: polls2.length };

      // ── 17+19. Refreshing student & admin clients during LIVE ──
      const refreshLive = await Promise.all(tokens.slice(0, 10).map((t) => sessionPoll(MODE, t)));
      for (const p of refreshLive) {
        expect(p.status).toBe(200);
        expect(p.data.sessionStatus).toBe("LIVE");
      }
      const adminRefresh = await api(`/${MODE}/admin/summary`, { headers: adminHeaders });
      expect(adminRefresh.status).toBe(200);
      expect((await adminRefresh.json()).participantsCount).toBe(STUDENT_COUNT);

      // ── 13. Admin locks the question ──
      const lock = await api(`/${MODE}/admin/lock-answers`, { method: "POST", headers: adminHeaders, body: "{}" });
      expect(lock.status).toBe(200);
      expect((await lock.json()).state.status).toBe("LOCKED");

      // ── 18. Refresh several students during LOCKED ──
      const refreshLocked = await Promise.all(tokens.slice(0, 10).map((t) => sessionPoll(MODE, t)));
      for (const p of refreshLocked) {
        expect(p.status).toBe(200);
        expect(p.data.sessionStatus).toBe("LOCKED");
        expect(p.data.correctAnswer).toBeNull(); // 16.
      }

      // ── 14. Late submissions are rejected ──
      const late = await Promise.all(tokens.slice(50, 56).map((t) => submit(MODE, t, q2.id, "A")));
      metrics.lateSubmissions = { attempted: late.length, rejected: late.filter((r) => r.status === 400).length };
      for (const r of late) {
        expect(r.status).toBe(400);
        expect(r.data.error).toBe("Question is not live");
      }

      // ── 15. Admin reveals the answer ──
      const reveal = await api(`/${MODE}/admin/reveal-answer`, { method: "POST", headers: adminHeaders, body: "{}" });
      const revealData = await reveal.json();
      expect(reveal.status).toBe(200);
      expect(revealData.correctAnswer).toBe(q2.correctAnswer);

      // 16. Students receive correctAnswer only after reveal
      const pollsRevealed = await Promise.all(tokens.slice(0, 10).map((t) => sessionPoll(MODE, t)));
      for (const p of pollsRevealed) {
        expect(p.status).toBe(200);
        expect(p.data.sessionStatus).toBe("REVEALED");
        expect(p.data.correctAnswer).toBe(q2.correctAnswer);
      }

      // ── 20. Log Out All Students with 60 active participants ──
      const logoutStart = Date.now();
      const logout = await api(`/${MODE}/admin/logout-all-students`, { method: "POST", headers: adminHeaders, body: "{}" });
      metrics.logoutAllMs = Date.now() - logoutStart;
      expect(logout.status).toBe(200);

      // ── 21+22. All 60 old sessions get SESSION_EXPIRED on their next request ──
      const expired = await Promise.all(tokens.map((t) => sessionPoll(MODE, t)));
      for (const p of expired) {
        expect(p.status).toBe(401);
        expect(p.data.code).toBe("SESSION_EXPIRED");
      }
      metrics.sessionExpiredAfterLogout = expired.length;

      // ── 23. Old tokens cannot rejoin / submit ──
      const oldSubmit = await submit(MODE, tokens[0], q1.id, "A");
      expect(oldSubmit.status).toBe(401);
      expect(oldSubmit.data.code).toBe("SESSION_EXPIRED");

      // ── 24. A brand-new student can join afterward ──
      const fresh = await register(MODE, "Fresh Student", "IT_INNOVATORS");
      expect(fresh.status).toBe(200);
      const freshPoll = await sessionPoll(MODE, fresh.data.participant.sessionToken);
      expect(freshPoll.status).toBe(200);

      // ── 25. Admin remains authenticated ──
      const adminAfter = await api(`/${MODE}/admin/summary`, { headers: adminHeaders });
      expect(adminAfter.status).toBe(200);

      // ── 26. Live mode completely isolated from all of the above ──
      const liveAfter = await (await api("/admin/summary", { headers: adminHeaders })).json();
      expect(liveAfter.participantsCount).toBe(liveBeforeCount);
      const liveAfterScore = liveAfter.clubs.reduce((s: number, c: any) => s + c.score, 0);
      expect(liveAfterScore).toBe(liveBeforeScore);
    },
    180000,
  );

  // ── 27+28. Failure: Redis unavailable — fail closed, no fabricated WAITING ──
  it("does not fabricate WAITING state and rejects submissions while Redis is unavailable", async () => {
    const reg = await register(MODE, "RedisOutageProbe", "STACK_PUSH");
    expect(reg.status).toBe(200);

    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input?.url;
      if (url && url.includes("upstash.io")) {
        return Promise.reject(new Error("simulated Redis outage"));
      }
      return originalFetch(input, init);
    };
    try {
      // 27. quiz-state must NOT fabricate a WAITING session from an outage
      const qs = await api(`/${MODE}/quiz-state`);
      expect(qs.status).toBe(503);
      const qsData = await qs.json();
      expect(qsData.code).toBe("STATE_UNAVAILABLE");
      expect(qsData.session).toBeUndefined();
      expect(qsData.status).toBeUndefined();

      // health reports unhealthy
      const health = await (await api("/health")).json();
      expect(health.ok).toBe(false);

      // 28. submissions cannot be accepted while authoritative state is down
      const subRes = await submit(MODE, reg.data.participant.sessionToken, TEST_QUESTIONS[0].id, "A");
      expect(subRes.status).not.toBe(200);
    } finally {
      (globalThis as any).fetch = originalFetch;
    }

    // After recovery: the outage produced NO phantom submission.
    const poll = await sessionPoll(MODE, reg.data.participant.sessionToken);
    expect(poll.status).toBe(200);
    expect(poll.data.hasSubmitted).toBe(false);
  });

  // ── 29+30. Failure: client cannot tamper with score or responseTimeMs ──
  it("ignores client-supplied score and responseTimeMs", async () => {
    const reg = await register(MODE, "TamperProbe", "STACK_PUSH");
    expect(reg.status).toBe(200);
    const q1 = TEST_QUESTIONS[0];
    const wrong = ["A", "B", "C", "D"].find((x) => x !== q1.correctAnswer) as string;

    await api(`/${MODE}/admin/start-question`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ questionNumber: q1.questionNumber }),
    });

    const res = await submit(MODE, reg.data.participant.sessionToken, q1.id, wrong, {
      score: 999999,
      responseTimeMs: 99999999,
      pointsAwarded: 999999,
      isCorrect: true,
    });
    expect(res.status).toBe(200);
    // 30. responseTimeMs is always server-measured, never client-supplied
    expect(res.data.submission.responseTimeMs).not.toBe(99999999);
    expect(res.data.submission.responseTimeMs).toBeGreaterThanOrEqual(0);
    expect(res.data.submission.responseTimeMs).toBeLessThanOrEqual(30000);

    await api(`/${MODE}/admin/reveal-answer`, { method: "POST", headers: adminHeaders, body: "{}" });
    const summary = await (await api(`/${MODE}/admin/summary`, { headers: adminHeaders })).json();
    const me = summary.participants.find((p: any) => p.sessionToken === reg.data.participant.sessionToken);
    // 29. score is derived server-side; client's 999999 is ignored (wrong answer → 0)
    expect(me.score).toBe(0);
    const mySub = summary.currentSubmissions.find((s: any) => s.participantId === me.id);
    expect(mySub.responseTimeMs).not.toBe(99999999);
    expect(mySub.isCorrect).toBe(false);
  });
});
