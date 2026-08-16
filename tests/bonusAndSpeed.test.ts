/**
 * Fastest-streak bonus + speed-based winner ranking tests (test mode).
 *
 *  - 🔥 BONUS: every 3 questions answered correctly AND fastest in a row
 *    (contiguous) awards FASTEST_STREAK_BONUS (5) extra points.
 *  - 🏆 RANKING: equal-score students are ranked by total correct-answer
 *    response time (faster wins ties) via compareParticipants.
 */
import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import http from "node:http";
import { app } from "../api/index";
import { TEST_QUESTIONS } from "../server/src/data/testQuestionsData";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Fastest-streak bonus + speed-based ranking (test mode)", () => {
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

  it("awards +5 bonus at 3 consecutive fastest-correct answers and resets the streak on a slower/wrong answer", async () => {
    const alice = await register("Fast Alice", "STACK_PUSH");
    const bob = await register("Slow Bob", "IT_INNOVATORS");

    let bonusAwarded = 0;
    for (let i = 0; i < 3; i++) {
      const q = TEST_QUESTIONS[i]; // R1 questions (1 pt each)
      await startQuestion(q.questionNumber);
      const a = await submit(alice.sessionToken, q.id, q.correctAnswer);
      expect(a.status).toBe(200);
      // Bob answers later → Alice is the fastest correct answer for Q1-Q3.
      await sleep(60);
      const b = await submit(bob.sessionToken, q.id, q.correctAnswer);
      expect(b.status).toBe(200);
      bonusAwarded = (a.data as any).bonusAwarded;
      await advanceToWaiting();
    }

    // Third consecutive fastest-correct answer awards the bonus.
    expect(bonusAwarded).toBe(5);

    // Alice: 3 correct (3 pts) + 5 bonus = 8. Bob: 3 correct (3 pts), no bonus.
    const lb = await leaderboard();
    const aliceRow = lb.students.find((s: any) => s.name === "Fast Alice");
    const bobRow = lb.students.find((s: any) => s.name === "Slow Bob");
    expect(aliceRow.score).toBe(8);
    expect(aliceRow.bonusPoints).toBe(5);
    expect(aliceRow.fastestStreak).toBe(3);
    expect(bobRow.score).toBe(3);
    expect(bobRow.bonusPoints).toBe(0);

    // 4th question: Bob answers FIRST (and correct) → Alice is no longer the
    // fastest, her streak resets to 0 and no bonus is awarded.
    const q4 = TEST_QUESTIONS[3];
    await startQuestion(q4.questionNumber);
    const b4 = await submit(bob.sessionToken, q4.id, q4.correctAnswer);
    await sleep(60);
    const a4 = await submit(alice.sessionToken, q4.id, q4.correctAnswer);
    expect((a4.data as any).bonusAwarded).toBe(0);
    expect((a4.data as any).fastestStreak).toBe(0);
    await advanceToWaiting();

    // A wrong answer also resets the streak.
    const q5 = TEST_QUESTIONS[4];
    await startQuestion(q5.questionNumber);
    const wrong = ["A", "B", "C", "D"].find((x) => x !== q5.correctAnswer) as string;
    const a5 = await submit(alice.sessionToken, q5.id, wrong);
    expect((a5.data as any).fastestStreak).toBe(0);
  });

  it("accumulates totalResponseMs across every submitted answer (correct and wrong)", async () => {
    const alice = await register("Timed Alice", "STACK_PUSH");

    // Q1 — correct answer. totalResponseMs should include this response time.
    const q1 = TEST_QUESTIONS[0];
    await startQuestion(q1.questionNumber);
    const s1 = await submit(alice.sessionToken, q1.id, q1.correctAnswer);
    expect(s1.status).toBe(200);
    const t1 = (s1.data as any).submission.responseTimeMs as number;
    await advanceToWaiting();

    // Q2 — WRONG answer. totalResponseMs grows again, correctResponseMs does not.
    const q2 = TEST_QUESTIONS[1];
    await startQuestion(q2.questionNumber);
    const wrong = ["A", "B", "C", "D"].find((x) => x !== q2.correctAnswer) as string;
    const s2 = await submit(alice.sessionToken, q2.id, wrong);
    expect(s2.status).toBe(200);
    const t2 = (s2.data as any).submission.responseTimeMs as number;
    await advanceToWaiting();

    const lb = await leaderboard();
    const row = lb.students.find((s: any) => s.name === "Timed Alice");
    // Total timing covers ALL answers submitted; correct-only timing covers just Q1.
    expect(row.totalResponseMs).toBeGreaterThanOrEqual(t1 + t2);
    expect(row.totalResponseMs).toBe(t1 + t2);
    expect(row.correctResponseMs).toBeGreaterThanOrEqual(t1);
    expect(row.correctResponseMs).toBe(t1);
    expect(row.attemptCount).toBe(2);
    expect(row.wrongCount).toBe(1);
    // The score reflects only the correct answer (wrong = 0 pts, no bonus at streak 1).
    expect(row.score).toBe(q1.points);
  });

  it("ranks equal scorers by total correct-answer response time (faster wins)", async () => {
    const alice = await register("Speedy", "STACK_PUSH");
    const bob = await register("Leisurely", "IT_INNOVATORS");

    // Both answer Q1 and Q2 correctly (2 pts each, no bonus at streak 2).
    for (let i = 0; i < 2; i++) {
      const q = TEST_QUESTIONS[i];
      await startQuestion(q.questionNumber);
      await submit(alice.sessionToken, q.id, q.correctAnswer);
      await sleep(80);
      await submit(bob.sessionToken, q.id, q.correctAnswer);
      await advanceToWaiting();
    }

    const lb = await leaderboard();
    const aliceRow = lb.students.find((s: any) => s.name === "Speedy");
    const bobRow = lb.students.find((s: any) => s.name === "Leisurely");

    // Same score and same correct count — but Alice answered faster.
    expect(aliceRow.score).toBe(2);
    expect(bobRow.score).toBe(2);
    expect(aliceRow.correctCount).toBe(bobRow.correctCount);
    expect(aliceRow.correctResponseMs).toBeLessThan(bobRow.correctResponseMs);

    // Speed breaks the tie: Alice ranks above Bob.
    const rankOf = (name: string) => lb.students.findIndex((s: any) => s.name === name);
    expect(rankOf("Speedy")).toBeLessThan(rankOf("Leisurely"));
  });
});
