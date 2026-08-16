import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import http from "node:http";

// Force the in-memory store BEFORE the app module is evaluated.
vi.stubEnv("QUIZ_STORE", "memory");
vi.stubEnv("VERCEL", undefined as any);

const { app } = await import("../server/src/index");
const { createMemoryStore } = await import("../api/memoryStore");

const ADMIN = {
  "Content-Type": "application/json",
  "x-admin-password": "MadeBySagar",
};

describe("memory-mode quiz flow", () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const api = (p: string, init?: RequestInit) =>
    fetch(`${baseUrl}${p}`, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });

  it("runs a full live quiz flow on the in-memory store", async () => {
    // 1. Health works with the local store.
    const health = await (await api("/api/health")).json();
    expect(health.ok).toBe(true);
    expect(health.redis).toBe("PONG");

    // 2. Fresh event: portal closed → open it.
    await api("/api/admin/reset-all-fresh", { method: "POST", headers: ADMIN, body: "{}" });
    await api("/api/admin/open-portal", { method: "POST", headers: ADMIN, body: "{}" });

    // 3. Register two students.
    const r1 = await (await api("/api/participants/register", { method: "POST", body: JSON.stringify({ name: "Alice", club: "STACK_PUSH" }) })).json();
    const r2 = await (await api("/api/participants/register", { method: "POST", body: JSON.stringify({ name: "Bob", club: "IT_INNOVATORS" }) })).json();
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    const t1 = r1.participant.sessionToken;
    const t2 = r2.participant.sessionToken;

    // 4. Duplicate name+club is rejected (anti-cheat, hash/set semantics).
    const dup = await api("/api/participants/register", { method: "POST", body: JSON.stringify({ name: "Alice", club: "STACK_PUSH" }) });
    expect(dup.status).toBe(409);

    // 5. Start question 1 (WAITING → LIVE directly).
    const sq = await (await api("/api/admin/start-question", { method: "POST", headers: ADMIN, body: JSON.stringify({ questionNumber: 1 }) })).json();
    expect(sq.ok).toBe(true);
    expect(sq.state.status).toBe("LIVE");

    // 6. Alice submits the correct answer first; Bob submits correct slower.
    const a1 = await (await api("/api/questions/submit", { method: "POST", body: JSON.stringify({ questionId: 1, answer: "A", token: t1 }) })).json();
    expect(a1.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 30));
    const b1 = await (await api("/api/questions/submit", { method: "POST", body: JSON.stringify({ questionId: 1, answer: "A", token: t2 }) })).json();
    expect(b1.ok).toBe(true);

    // 7. Duplicate submission rejected (SET NX semantics).
    const dupSub = await api("/api/questions/submit", { method: "POST", body: JSON.stringify({ questionId: 1, answer: "B", token: t1 }) });
    expect(dupSub.status).toBe(400);

    // 8. Reveal, then summary shows scores + fastest.
    await api("/api/admin/reveal-answer", { method: "POST", headers: ADMIN, body: "{}" });
    const summary = await (await api("/api/admin/summary", { headers: ADMIN })).json();
    expect(summary.participantsCount).toBe(2);
    const alice = summary.participants.find((p: any) => p.sessionToken === t1);
    const bob = summary.participants.find((p: any) => p.sessionToken === t2);
    expect(alice.score).toBe(1);
    expect(bob.score).toBe(1);
    expect(summary.answersReceived).toBe(2);
    expect(summary.currentSubmissions).toHaveLength(2);

    // 9. Student session poll works from the store.
    const poll = await (await api(`/api/participants/session?token=${encodeURIComponent(t1)}`)).json();
    expect(poll.sessionStatus).toBe("REVEALED");
    expect(poll.currentQuestion.questionNumber).toBe(1);

    // 10. Kick Bob → his poll is rejected (SADD/SISMEMBER semantics).
    await api("/api/admin/kick-participant", { method: "POST", headers: ADMIN, body: JSON.stringify({ token: t2 }) });
    const kicked = await api(`/api/participants/session?token=${encodeURIComponent(t2)}`);
    expect(kicked.status).toBe(401);
    expect((await kicked.json()).code).toBe("PARTICIPANT_KICKED");

    // 11. Test mode is fully isolated (separate namespace).
    await api("/api/test/admin/open-portal", { method: "POST", headers: ADMIN, body: "{}" });
    const tm = await (await api("/api/test/participants/register", { method: "POST", body: JSON.stringify({ name: "Tester", club: "STACK_PUSH" }) })).json();
    expect(tm.ok).toBe(true);
    const liveSummary = await (await api("/api/admin/summary", { headers: ADMIN })).json();
    // Live roster is exactly the 2 live students (Bob was kicked) — the test
    // student never leaked into the live namespace.
    expect(liveSummary.participantsCount).toBe(1);
    expect(liveSummary.participants.map((p: any) => p.name)).toEqual(["Alice"]);
  });

  it("memory store implements the submission EVAL semantics atomically", () => {
    const s = createMemoryStore();
    const sub = (pid: number, ms: number) =>
      JSON.stringify({ id: Date.now() + pid, participantId: pid, responseTimeMs: ms });
    const detail = (pid: number, ms: number) => JSON.stringify({ participantId: pid, responseTimeMs: ms });
    const evalCmd = (pid: number, ms: number) => [
      "EVAL",
      "ignored",
      "3",
      `sub:${pid}:1`,
      `fastest:1`,
      "fastest:latest",
      sub(pid, ms),
      String(ms),
      detail(pid, ms),
    ];

    // First correct answer is fastest.
    expect(s.command(evalCmd(1, 100))).toBe("OK_FASTEST");
    // Slower correct answer is accepted but not fastest.
    expect(s.command(evalCmd(2, 200))).toBe("OK");
    // Duplicate submission is rejected and never touches the fastest record.
    expect(s.command(evalCmd(1, 50))).toBe("DUPLICATE");
    expect(s.command(["GET", "fastest:1"])).toBe(detail(1, 100));
    // A genuinely faster NEW student overwrites the fastest record.
    expect(s.command(evalCmd(3, 75))).toBe("OK_FASTEST");
    expect(s.command(["GET", "fastest:1"])).toBe(detail(3, 75));
    expect(s.command(["GET", "fastest:latest"])).toBe(detail(3, 75));

    // Pipeline applies commands in order.
    const res = s.pipeline([["SET", "k", "v"], ["GET", "k"], ["SISMEMBER", "set:missing", "x"]]);
    expect(res[0]).toBe("OK");
    expect(res[1]).toBe("v");
    expect(res[2]).toBe(0);
  });
});
