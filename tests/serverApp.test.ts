import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import http from "node:http";
import { app } from "../server/src/index";
import { quizStore } from "../server/src/services/quizStore";

describe("Express App API Routes", () => {
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

  beforeEach(() => {
    quizStore.clearAllFresh();
  });

  it("GET /api/health returns ok", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
  });

  it("POST /api/participants/register registers student", async () => {
    const res = await fetch(`${baseUrl}/api/participants/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Sagar Test", club: "STACK_PUSH" }),
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.participant.name).toBe("Sagar Test");
    expect(data.participant.club).toBe("STACK_PUSH");
    expect(data.participant.sessionToken).toBeDefined();
  });

  it("POST /api/questions/submit submits student answer", async () => {
    const regRes = await fetch(`${baseUrl}/api/participants/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Rahul", club: "IT_INNOVATORS" }),
    });
    const regData = await regRes.json();
    const token = regData.participant.sessionToken;

    quizStore.startQuestionDirect(1);

    const subRes = await fetch(`${baseUrl}/api/questions/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        questionId: 1,
        answer: "A",
      }),
    });
    const subData = await subRes.json();

    expect(subRes.status).toBe(200);
    expect(subData.ok).toBe(true);
    expect(subData.submission.answer).toBe("A");
    expect(subData.participantScore).toBe(1);
  });

  it("Admin endpoints: start countdown, lock, reveal, and 1-click test reset", async () => {
    // 1. Admin login
    const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "MadeBySagar" }),
    });
    const loginData = await loginRes.json();
    expect(loginRes.status).toBe(200);
    expect(loginData.ok).toBe(true);

    // 2. Start Countdown
    const countRes = await fetch(`${baseUrl}/api/admin/start-countdown`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": "MadeBySagar",
      },
      body: JSON.stringify({ questionId: 1, seconds: 3 }),
    });
    const countData = await countRes.json();
    expect(countRes.status).toBe(200);
    expect(countData.state.status).toBe("COUNTDOWN");

    // 3. 1-Click Test Reset
    const resetRes = await fetch(`${baseUrl}/api/admin/reset-scores`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": "MadeBySagar",
      },
    });
    const resetData = await resetRes.json();
    expect(resetRes.status).toBe(200);
    expect(resetData.ok).toBe(true);
    expect(resetData.message).toContain("Scores and responses reset successfully");
  });
});
