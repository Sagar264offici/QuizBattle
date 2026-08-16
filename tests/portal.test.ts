/**
 * Student Portal Gate tests.
 *
 * The host controls when students may join: while the portal is CLOSED, new
 * registrations are rejected with 403 PORTAL_CLOSED. Opening the portal lets
 * students in; closing it stops late joiners. Already-registered students are
 * never affected — the gate only blocks joining.
 */

import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import http from "node:http";
import { app } from "../api/index";
import { QUESTIONS } from "../server/src/data/questionsData";

describe("Student portal gate (open/close registration)", () => {
  let server: http.Server;
  let baseUrl: string;

  const adminHeaders = { "Content-Type": "application/json", "x-admin-password": "MadeBySagar" };
  const jsonHeaders = { "Content-Type": "application/json" };

  const api = (path: string, init?: RequestInit) => fetch(`${baseUrl}/api${path}`, init);

  const register = (name: string, club: string) =>
    api("/participants/register", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ name, club }),
    }).then(async (res) => ({ status: res.status, data: await res.json().catch(() => ({})) }));

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
    await api("/admin/reset-all-fresh", { method: "POST", headers: adminHeaders, body: "{}" });
    await api("/test/admin/reset-all-fresh", { method: "POST", headers: adminHeaders, body: "{}" });
  });

  it("fresh event starts with the portal CLOSED and exposes the flag on quiz-state", async () => {
    const qs = await (await api("/quiz-state")).json();
    expect(qs.session.portalOpen).toBe(false);

    const summary = await (await api("/admin/summary", { headers: adminHeaders })).json();
    expect(summary.session.portalOpen).toBe(false);
  });

  it("registration is rejected with 403 PORTAL_CLOSED while the portal is closed", async () => {
    const res = await register("Early Bird", "STACK_PUSH");
    expect(res.status).toBe(403);
    expect(res.data.code).toBe("PORTAL_CLOSED");
    expect(res.data.error).toContain("portal is closed");

    // No participant was created.
    const summary = await (await api("/admin/summary", { headers: adminHeaders })).json();
    expect(summary.participantsCount).toBe(0);
  });

  it("open-portal lets students join; close-portal stops new joiners again", async () => {
    // Closed → rejected
    const before = await register("Before Open", "STACK_PUSH");
    expect(before.status).toBe(403);

    // Open → accepted
    const open = await api("/admin/open-portal", { method: "POST", headers: adminHeaders, body: "{}" });
    expect(open.status).toBe(200);
    expect((await open.json()).portalOpen).toBe(true);

    const during = await register("During Open", "IT_INNOVATORS");
    expect(during.status).toBe(200);

    // Close → rejected again
    const close = await api("/admin/close-portal", { method: "POST", headers: adminHeaders, body: "{}" });
    expect(close.status).toBe(200);
    expect((await close.json()).portalOpen).toBe(false);

    const after = await register("After Close", "STACK_PUSH");
    expect(after.status).toBe(403);
    expect(after.data.code).toBe("PORTAL_CLOSED");
  });

  it("already-registered students keep playing while the portal is closed", async () => {
    await api("/admin/open-portal", { method: "POST", headers: adminHeaders, body: "{}" });
    const reg = await register("Lucky", "STACK_PUSH");
    expect(reg.status).toBe(200);

    // Close the portal — existing sessions must keep working.
    await api("/admin/close-portal", { method: "POST", headers: adminHeaders, body: "{}" });

    const poll = await api(`/participants/session?token=${encodeURIComponent(reg.data.participant.sessionToken)}`);
    expect(poll.status).toBe(200);

    await api("/admin/start-question", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ questionNumber: 1 }),
    });
    const sub = await api("/questions/submit", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ token: reg.data.participant.sessionToken, questionId: QUESTIONS[0].id, answer: "A" }),
    });
    expect(sub.status).toBe(200);
  });

  it("closing the live portal does not affect the test portal (and vice versa)", async () => {
    await api("/admin/close-portal", { method: "POST", headers: adminHeaders, body: "{}" });
    await api("/test/admin/open-portal", { method: "POST", headers: adminHeaders, body: "{}" });

    const live = await register("Live Blocked", "STACK_PUSH");
    expect(live.status).toBe(403);

    const test = await api("/test/participants/register", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ name: "Test Allowed", club: "IT_INNOVATORS" }),
    });
    expect(test.status).toBe(200);
  });

  it("test portal caps membership at 60 (PORTAL_FULL) without touching the live portal", async () => {
    await api("/test/admin/open-portal", { method: "POST", headers: adminHeaders, body: "{}" });

    // Fill the test portal to its 60-member cap, one registration at a time.
    for (let i = 0; i < 60; i++) {
      const res = await api("/test/participants/register", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ name: `Cap Member ${i + 1}`, club: i % 2 === 0 ? "STACK_PUSH" : "IT_INNOVATORS" }),
      });
      expect(res.status).toBe(200);
    }

    // The 61st test student is rejected with a clear PORTAL_FULL message.
    const sixtyFirst = await api("/test/participants/register", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ name: "Over The Cap", club: "STACK_PUSH" }),
    });
    expect(sixtyFirst.status).toBe(403);
    const data = await sixtyFirst.json();
    expect(data.code).toBe("PORTAL_FULL");
    expect(data.error).toContain("60");

    // The live portal has no such cap — a live registration still succeeds.
    await api("/admin/open-portal", { method: "POST", headers: adminHeaders, body: "{}" });
    const live = await register("Live Untouched", "STACK_PUSH");
    expect(live.status).toBe(200);
  });

  it("portalOpen persists across quiz actions (countdown, next question)", async () => {
    await api("/admin/open-portal", { method: "POST", headers: adminHeaders, body: "{}" });
    await api("/admin/start-countdown", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ questionNumber: 1 }),
    });
    await api("/admin/next-question", { method: "POST", headers: adminHeaders, body: "{}" });

    const qs = await (await api("/quiz-state")).json();
    expect(qs.session.portalOpen).toBe(true);
  });

  it("reset-all-fresh closes the portal again", async () => {
    await api("/admin/open-portal", { method: "POST", headers: adminHeaders, body: "{}" });
    await api("/admin/reset-all-fresh", { method: "POST", headers: adminHeaders, body: "{}" });

    const qs = await (await api("/quiz-state")).json();
    expect(qs.session.portalOpen).toBe(false);

    const res = await register("Too Late", "STACK_PUSH");
    expect(res.status).toBe(403);
  });
});
