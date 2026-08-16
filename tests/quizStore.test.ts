import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import http from "node:http";
import { app } from "../api/index";
import { QUESTIONS } from "../server/src/data/questionsData";

describe("Redis-backed quiz API behavior", () => {
  let server: http.Server;
  let baseUrl: string;
  const adminHeaders = {
    "Content-Type": "application/json",
    "x-admin-password": "MadeBySagar",
  };

  const request = async (path: string, init?: RequestInit) => {
    const response = await fetch(`${baseUrl}/api${path}`, init);
    const data = await response.json();
    expect(response.ok, `${path}: ${JSON.stringify(data)}`).toBe(true);
    return data;
  };

  beforeAll(async () => {
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    // Leave the shared Redis store clean so no test students leak into the app.
    await request("/admin/reset-all-fresh", { method: "POST", headers: adminHeaders, body: "{}" });
    await request("/test/admin/reset-all-fresh", { method: "POST", headers: adminHeaders, body: "{}" });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(async () => {
    await request("/admin/reset-all-fresh", { method: "POST", headers: adminHeaders, body: "{}" });
    // Fresh events start with the portal CLOSED — open it so students can join.
    await request("/admin/open-portal", { method: "POST", headers: adminHeaders, body: "{}" });
  });

  it("keeps first submissions private and scores them on reveal", async () => {
    await request("/admin/start-question", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ questionNumber: 1 }),
    });

    const registrations = await Promise.all(
      Array.from({ length: 50 }, (_, index) => request("/participants/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Student ${index + 1}`,
          club: index % 2 ? "IT_INNOVATORS" : "STACK_PUSH",
        }),
      })),
    );

    const submissions = await Promise.all(registrations.map((registration, index) => request("/questions/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: registration.participant.sessionToken,
        questionId: QUESTIONS[0].id,
        answer: index < 30 ? QUESTIONS[0].correctAnswer : "D",
      }),
    })));

    for (const submission of submissions) {
      expect(submission.isCorrect).toBeUndefined();
      expect(submission.pointsAwarded).toBeUndefined();
    }

    await request("/admin/reveal-answer", { method: "POST", headers: adminHeaders, body: "{}" });
    const leaderboard = await request("/leaderboard");
    const total = leaderboard.clubs.reduce((sum: number, club: { score: number }) => sum + club.score, 0);
    expect(total).toBe(30 * QUESTIONS[0].points);
  });
});
