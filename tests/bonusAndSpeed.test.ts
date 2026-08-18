/**
 * Fastest-finger scoring + team eligibility tests (test mode).
 *
 *  - ⚡ SPEED BONUS: among valid CORRECT answers to the same question the
 *    server assigns ranks by (responseTimeMs, submittedAt, participantId):
 *    1st → +3, 2nd → +2, 3rd → +1, later → +0. Wrong answers earn 0 and never
 *    receive a speed bonus.
 *  - 🏆 TEAM RESULTS: teamScore = Σ participant earned points (base + speed).
 *    A club is eligible only when EVERY registered member has at least one
 *    accepted submission; the winner is the highest-scoring eligible club,
 *    with deterministic tie-breaks (more correct answers, then lower aggregate
 *    correct-answer response time, then TEAM TIE).
 */
import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import http from "node:http";
import { app, computeTeamResults } from "../api/index";
import { TEST_QUESTIONS } from "../server/src/data/testQuestionsData";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Fastest-finger scoring + team eligibility (test mode)", () => {
  let server: http.Server;
  let baseUrl: string;

  const adminHeaders = { "Content-Type": "application/json", "x-admin-password": "MadeBySagar" };
  const jsonHeaders = { "Content-Type": "application/json" };

  const api = (path: string, init?: RequestInit) => fetch(`${baseUrl}/api${path}`, init);

  const register = async (name: string, club: string) => {
    const res = await api("/test/participants/register", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ name, club }),
    });
    return (await res.json()).participant;
  };

  const startQuestion = async (questionNumber: number) => {
    const res = await api("/test/admin/start-question", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ questionNumber }),
    });
    expect(res.status).toBe(200);
  };

  const submit = async (token: string, questionId: number, answer: string) => {
    const res = await api("/test/questions/submit", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ token, questionId, answer }),
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };

  // Move from the LIVE question to the WAITING state so the next question can
  // be started (a question cannot start while another is still LIVE).
  const advanceToWaiting = async () => {
    const res = await api("/test/admin/next-question", {
      method: "POST",
      headers: adminHeaders,
      body: "{}",
    });
    expect(res.status).toBe(200);
  };

  const leaderboard = async () => {
    const res = await api("/test/leaderboard");
    return (await res.json()) as any;
  };

  beforeAll(async () => {
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    // Leave the shared Redis store clean so no test students leak into the app.
    await api("/admin/reset-all-fresh", { method: "POST", headers: adminHeaders, body: "{}" });
    await api("/test/admin/reset-all-fresh", { method: "POST", headers: adminHeaders, body: "{}" });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(async () => {
    await api("/test/admin/reset-all-fresh", { method: "POST", headers: adminHeaders, body: "{}" });
    await api("/test/admin/open-portal", { method: "POST", headers: adminHeaders, body: "{}" });
  });

  it("awards +3/+2/+1/+0 per-question speed bonus by server arrival order; wrong = 0", async () => {
    const alice = await register("Fast Alice", "STACK_PUSH");
    const bob = await register("Second Bob", "STACK_PUSH");
    const riya = await register("Third Riya", "IT_INNOVATORS");
    const dave = await register("Fourth Dave", "IT_INNOVATORS");

    const q = TEST_QUESTIONS[0]; // 1-pt question
    await startQuestion(q.questionNumber);

    // Sequential arrival order is deterministic: Alice → Bob → Riya → Dave.
    const a = await submit(alice.sessionToken, q.id, q.correctAnswer);
    await sleep(40);
    const b = await submit(bob.sessionToken, q.id, q.correctAnswer);
    await sleep(40);
    const r = await submit(riya.sessionToken, q.id, q.correctAnswer);
    await sleep(40);
    const d = await submit(dave.sessionToken, q.id, q.correctAnswer);
    await sleep(40);
    // Wrong answer (Eve) earns 0 and no speed bonus.
    const eve = await register("Wrong Eve", "IT_INNOVATORS");
    const e = await submit(eve.sessionToken, q.id, "D");
    expect(e.status).toBe(200);
    await advanceToWaiting();

    expect((a.data as any).speedRank).toBe(1);
    expect((a.data as any).speedBonus).toBe(3);
    expect((b.data as any).speedRank).toBe(2);
    expect((b.data as any).speedBonus).toBe(2);
    expect((r.data as any).speedRank).toBe(3);
    expect((r.data as any).speedBonus).toBe(1);
    expect((d.data as any).speedRank).toBe(4);
    expect((d.data as any).speedBonus).toBe(0);
    expect((e.data as any).speedRank).toBe(0);
    expect((e.data as any).speedBonus).toBe(0);

    // earnedPoints = base + speed: 1+3, 1+2, 1+1, 1+0, 0.
    const lb = await leaderboard();
    const row = (name: string) => lb.students.find((s: any) => s.name === name);
    expect(row("Fast Alice").score).toBe(4);
    expect(row("Fast Alice").basePoints).toBe(1);
    expect(row("Fast Alice").speedBonusPoints).toBe(3);
    expect(row("Second Bob").score).toBe(3);
    expect(row("Third Riya").score).toBe(2);
    expect(row("Fourth Dave").score).toBe(1);
    expect(row("Wrong Eve").score).toBe(0);
  });

  it("team score = Σ earned points (base + speed) and the leaderboard declares the highest eligible team", async () => {
    // STACK_PUSH: 2 members, both contribute (7 + 6 = 13).
    const sp1 = await register("SP One", "STACK_PUSH");
    const sp2 = await register("SP Two", "STACK_PUSH");
    // IT_INNOVATORS: 2 members, both contribute (5 + 4 = 9).
    const ii1 = await register("II One", "IT_INNOVATORS");
    const ii2 = await register("II Two", "IT_INNOVATORS");

    // Two 3-point questions (Java pattern round, Q46+Q47) so the totals are
    // non-trivial.
    for (const q of [TEST_QUESTIONS[45], TEST_QUESTIONS[46]]) {
      await startQuestion(q.questionNumber);
      const a = await submit(sp1.sessionToken, q.id, q.correctAnswer);
      expect((a.data as any).speedRank).toBe(1);
      await sleep(30);
      await submit(sp2.sessionToken, q.id, q.correctAnswer);
      await sleep(30);
      await submit(ii1.sessionToken, q.id, q.correctAnswer);
      await sleep(30);
      await submit(ii2.sessionToken, q.id, q.correctAnswer);
      await advanceToWaiting();
    }

    const lb = await leaderboard();
    const sp = lb.teamResults.find((t: any) => t.club === "STACK_PUSH");
    const ii = lb.teamResults.find((t: any) => t.club === "IT_INNOVATORS");

    // Per question: first = 3+3=6, second = 3+2=5, third = 3+1=4, fourth = 3+0=3.
    expect(sp.score).toBe((6 + 5) * 2);
    expect(sp.basePoints).toBe(3 * 4);
    expect(sp.speedBonus).toBe((3 + 2) * 2);
    expect(sp.requiredMembers).toBe(2);
    expect(sp.contributedMembers).toBe(2);
    expect(sp.eligible).toBe(true);
    expect(ii.score).toBe((4 + 3) * 2);
    expect(ii.eligible).toBe(true);

    // Highest eligible team wins — the same numbers the UI displays.
    expect(lb.teamWinner).toBe("STACK_PUSH");
    expect(lb.clubs.find((c: any) => c.name === "STACK_PUSH").score).toBe(sp.score);
  });

  it("an ineligible team can never win, even with a higher score (participation required)", async () => {
    const sp1 = await register("SP Active A", "STACK_PUSH");
    const sp2 = await register("SP Active B", "STACK_PUSH");
    const superstar = await register("Superstar", "IT_INNOVATORS");
    await register("Ghost", "IT_INNOVATORS"); // never submits

    // Q1: superstar first (4), SP members 2nd/3rd (3 + 2). SP = 5, II = 4.
    // Q2+Q3: only the superstar answers (4 each) → II pulls ahead to 12.
    // SP never answers Q2/Q3 → SP stays 5 but is fully contributing (2/2).
    const q1 = TEST_QUESTIONS[0];
    const q2 = TEST_QUESTIONS[1];
    const q3 = TEST_QUESTIONS[2];
    for (const q of [q1, q2, q3]) {
      await startQuestion(q.questionNumber);
      if (q === q1) {
        await submit(superstar.sessionToken, q.id, q.correctAnswer);
        await sleep(30);
        await submit(sp1.sessionToken, q.id, q.correctAnswer);
        await sleep(30);
        await submit(sp2.sessionToken, q.id, q.correctAnswer);
      } else {
        await submit(superstar.sessionToken, q.id, q.correctAnswer);
      }
      await advanceToWaiting();
    }

    const lb = await leaderboard();
    const sp = lb.teamResults.find((t: any) => t.club === "STACK_PUSH");
    const ii = lb.teamResults.find((t: any) => t.club === "IT_INNOVATORS");
    expect(sp.eligible).toBe(true);
    expect(ii.eligible).toBe(false); // Ghost never submitted
    expect(ii.score).toBeGreaterThan(sp.score); // the superstar out-scored the team
    // The eligible team wins — a superstar cannot carry a non-participating club.
    expect(lb.teamWinner).toBe("STACK_PUSH");
  });

  it("computeTeamResults: eligibility, correct-answer tie-break, speed tie-break, and TEAM TIE", () => {
    const P = (club: string, patch: any) => ({
      club,
      score: 0,
      basePoints: 0,
      speedBonusPoints: 0,
      correctCount: 0,
      correctResponseMs: 0,
      attemptCount: 1,
      ...patch,
    });

    // No eligible club → no winner.
    expect(computeTeamResults([P("STACK_PUSH", { attemptCount: 0 }), P("IT_INNOVATORS", { attemptCount: 0 })]).winner).toBeNull();

    // Highest eligible score wins.
    let res = computeTeamResults([
      P("STACK_PUSH", { score: 152, correctCount: 60 }),
      P("IT_INNOVATORS", { score: 329, correctCount: 90 }),
    ]);
    expect(res.winner).toBe("IT_INNOVATORS");

    // Tie-break 1: identical score → more total correct answers wins.
    res = computeTeamResults([
      P("STACK_PUSH", { score: 100, correctCount: 40, correctResponseMs: 10000 }),
      P("IT_INNOVATORS", { score: 100, correctCount: 45, correctResponseMs: 9000 }),
    ]);
    expect(res.winner).toBe("IT_INNOVATORS");

    // Tie-break 2: identical score + correct count → lower aggregate
    // correct-answer response time wins.
    res = computeTeamResults([
      P("STACK_PUSH", { score: 100, correctCount: 40, correctResponseMs: 8000 }),
      P("IT_INNOVATORS", { score: 100, correctCount: 40, correctResponseMs: 12000 }),
    ]);
    expect(res.winner).toBe("STACK_PUSH");

    // Exact tie → TEAM TIE (never random).
    res = computeTeamResults([
      P("STACK_PUSH", { score: 100, correctCount: 40, correctResponseMs: 9000 }),
      P("IT_INNOVATORS", { score: 100, correctCount: 40, correctResponseMs: 9000 }),
    ]);
    expect(res.winner).toBe("TIE");

    // An ineligible higher-scoring club loses to an eligible lower-scoring one.
    res = computeTeamResults([
      P("STACK_PUSH", { score: 50, correctCount: 20, attemptCount: 0 }),
      P("IT_INNOVATORS", { score: 30, correctCount: 12 }),
    ]);
    expect(res.winner).toBe("IT_INNOVATORS");
  });

  it("a single non-contributing member makes the whole club ineligible", async () => {
    const a = await register("Contributor", "STACK_PUSH");
    await register("Lazy", "STACK_PUSH");
    const q = TEST_QUESTIONS[0];
    await startQuestion(q.questionNumber);
    await submit(a.sessionToken, q.id, q.correctAnswer);
    await advanceToWaiting();

    const lb = await leaderboard();
    const sp = lb.teamResults.find((t: any) => t.club === "STACK_PUSH");
    expect(sp.requiredMembers).toBe(2);
    expect(sp.contributedMembers).toBe(1);
    expect(sp.eligible).toBe(false);
    expect(lb.teamWinner).toBeNull();
  });
});
