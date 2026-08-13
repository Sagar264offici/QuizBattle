/**
 * QuizBattle API — Upstash Redis-backed Vercel Serverless Handler
 * Uses @upstash/redis SDK for shared state across all serverless lambdas.
 */

import { Redis } from "@upstash/redis";
import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import { QUESTIONS } from "./data/questionsData.js";

// ── Pure Logic Helpers ────────────────────────────────────────────────────────

function isValidClub(club: string): boolean {
  return club === "STACK_PUSH" || club === "IT_INNOVATORS";
}

function evaluateSubmission(answer: string, correctAnswer: string, points: number) {
  const isCorrect = answer === correctAnswer;
  return {
    isCorrect,
    pointsAwarded: isCorrect ? points : 0,
  };
}

// ── Redis Instance ────────────────────────────────────────────────────────────

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || "https://casual-ray-186045.upstash.io",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || "gQAAAAAAAta9AAIgcDI3NmExNGJjOTA2YTU0MDk4YTc5OGUzMWYyMjI4N2U5Yg",
});

// ── Helpers ───────────────────────────────────────────────────────────────────

type QuizStatus = "WAITING" | "COUNTDOWN" | "LIVE" | "LOCKED" | "REVEALED" | "FINISHED";

interface QuizSessionState {
  status: QuizStatus;
  currentQuestionId: number;
  questionStartedAt: string | null;
  countdownEndsAt: string | null;
  correctAnswer: string | null;
  updatedAt: string;
}

const DEFAULT_STATE: QuizSessionState = {
  status: "WAITING",
  currentQuestionId: 1,
  questionStartedAt: null,
  countdownEndsAt: null,
  correctAnswer: null,
  updatedAt: new Date().toISOString(),
};

function getQuestion(qNum: number) {
  return QUESTIONS.find(q => q.questionNumber === qNum) ?? QUESTIONS[0];
}

function encodeToken(p: { id: number; name: string; club: string }): string {
  return Buffer.from(JSON.stringify({ id: p.id, name: p.name, club: p.club, t: Date.now() })).toString("base64url");
}

function decodeToken(token: string): { id: number; name: string; club: string } | null {
  try {
    const d = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
    if (d?.name && d?.club) return { id: Number(d.id) || 1, name: String(d.name), club: String(d.club) };
  } catch (_) {}
  return null;
}

// ── State Management (Redis-backed) ──────────────────────────────────────────

async function getState(): Promise<QuizSessionState> {
  const raw = await redis.get<string>("quiz:state");
  if (!raw) return { ...DEFAULT_STATE };
  const state: QuizSessionState = typeof raw === "string" ? JSON.parse(raw) : raw;

  // Auto-transition COUNTDOWN → LIVE
  if (state.status === "COUNTDOWN" && state.countdownEndsAt) {
    if (new Date(state.countdownEndsAt).getTime() <= Date.now()) {
      state.status = "LIVE";
      state.questionStartedAt = new Date().toISOString();
      state.countdownEndsAt = null;
      state.updatedAt = new Date().toISOString();
      await redis.set("quiz:state", JSON.stringify(state));
    }
  }
  return state;
}

async function setState(patch: Partial<QuizSessionState>): Promise<QuizSessionState> {
  const current = await getState();
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await redis.set("quiz:state", JSON.stringify(next));
  return next;
}

async function getParticipant(token: string) {
  const raw = await redis.get<string>(`p:${token}`);
  if (raw) {
    try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch (_) {}
  }
  // Stateless fallback: decode the token itself
  const d = decodeToken(token);
  if (d) {
    const p = { id: d.id, name: d.name, club: d.club, sessionToken: token, score: 0, correctCount: 0, attemptCount: 0, joinedAt: new Date().toISOString() };
    await redis.set(`p:${token}`, JSON.stringify(p), { ex: 86400 });
    return p;
  }
  return null;
}

async function saveParticipant(p: any) {
  await redis.set(`p:${p.sessionToken}`, JSON.stringify(p), { ex: 86400 });
}

async function getSubmission(pid: number, qid: number) {
  const raw = await redis.get<string>(`sub:${pid}:${qid}`);
  if (!raw) return null;
  try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch (_) { return null; }
}

async function saveSubmission(sub: any) {
  await redis.set(`sub:${sub.participantId}:${sub.questionId}`, JSON.stringify(sub), { ex: 86400 });
}

async function getClubScore(club: string): Promise<number> {
  const v = await redis.get<string>(`score:${club}`);
  return v ? parseInt(String(v), 10) || 0 : 0;
}

async function addClubScore(club: string, pts: number) {
  if (pts > 0) {
    await redis.incrby(`score:${club}`, pts);
  }
}

// ── Express App ───────────────────────────────────────────────────────────────

const app = express();
app.use(cors({ origin: true, credentials: true }));

// Body parser — handles Vercel pre-parsed bodies
app.use((req, _res, next) => {
  if (typeof req.body === "string" && req.body) {
    try { req.body = JSON.parse(req.body); } catch (_) {}
    return next();
  }
  if (req.body && typeof req.body === "object") return next();
  express.json()(req, _res, next);
});

const ADMIN_PW = process.env.ADMIN_PASSWORD || "MadeBySagar";
const ADMIN_HASH = bcrypt.hashSync(ADMIN_PW, 10);

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const pw = req.headers["x-admin-password"] as string;
  if (pw !== ADMIN_PW && !bcrypt.compareSync(pw || "", ADMIN_HASH)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

const r = express.Router();

// ── Health ────────────────────────────────────────────────────────────────────
r.get("/health", async (_req, res) => {
  try {
    await redis.ping();
    const s = await getState();
    res.json({ ok: true, status: s.status, redis: true });
  } catch (e: any) {
    res.json({ ok: false, redis: false, error: e.message });
  }
});

// ── Admin Auth ────────────────────────────────────────────────────────────────
r.post("/admin/login", (req, res) => {
  const { password } = req.body ?? {};
  if (!password || !bcrypt.compareSync(String(password), ADMIN_HASH)) {
    return res.status(401).json({ error: "Invalid admin password" });
  }
  res.json({ ok: true, token: ADMIN_PW });
});

// ── Admin Actions ─────────────────────────────────────────────────────────────
r.post("/admin/start-countdown", requireAdmin, async (req, res) => {
  const { questionNumber, seconds } = req.body ?? {};
  const q = getQuestion(Number(questionNumber) || (await getState()).currentQuestionId || 1);
  const endsAt = new Date(Date.now() + (Number(seconds) || 3) * 1000).toISOString();
  const state = await setState({ status: "COUNTDOWN", currentQuestionId: q.questionNumber, countdownEndsAt: endsAt, questionStartedAt: null, correctAnswer: null });
  res.json({ ok: true, state });
});

r.post("/admin/start-question", requireAdmin, async (req, res) => {
  const { questionNumber } = req.body ?? {};
  const q = getQuestion(Number(questionNumber) || (await getState()).currentQuestionId || 1);
  const state = await setState({ status: "LIVE", currentQuestionId: q.questionNumber, questionStartedAt: new Date().toISOString(), countdownEndsAt: null, correctAnswer: null });
  res.json({ ok: true, state });
});

r.post("/admin/lock-answers", requireAdmin, async (_req, res) => {
  const state = await setState({ status: "LOCKED" });
  res.json({ ok: true, state });
});

r.post("/admin/reveal-answer", requireAdmin, async (_req, res) => {
  const cur = await getState();
  const q = getQuestion(cur.currentQuestionId);
  const state = await setState({ status: "REVEALED", correctAnswer: q?.correctAnswer ?? null });
  res.json({ ok: true, state, correctAnswer: state.correctAnswer });
});

r.post("/admin/next-question", requireAdmin, async (req, res) => {
  const cur = await getState();
  const { questionNumber } = req.body ?? {};
  const next = questionNumber ? Number(questionNumber) : Math.min((cur.currentQuestionId || 1) + 1, 100);
  const state = await setState({ status: "WAITING", currentQuestionId: next, questionStartedAt: null, countdownEndsAt: null, correctAnswer: null });
  res.json({ ok: true, state });
});

r.post("/admin/prev-question", requireAdmin, async (_req, res) => {
  const cur = await getState();
  const prev = Math.max((cur.currentQuestionId || 1) - 1, 1);
  const state = await setState({ status: "WAITING", currentQuestionId: prev, questionStartedAt: null, countdownEndsAt: null, correctAnswer: null });
  res.json({ ok: true, state });
});

r.post("/admin/select-question", requireAdmin, async (req, res) => {
  const { questionNumber } = req.body ?? {};
  if (!questionNumber) return res.status(400).json({ error: "questionNumber required" });
  const state = await setState({ status: "WAITING", currentQuestionId: Number(questionNumber), questionStartedAt: null, countdownEndsAt: null, correctAnswer: null });
  res.json({ ok: true, state });
});

r.post("/admin/reset-scores", requireAdmin, async (_req, res) => {
  await redis.set("score:STACK_PUSH", "0");
  await redis.set("score:IT_INNOVATORS", "0");
  const state = await setState({ status: "WAITING", currentQuestionId: 1, questionStartedAt: null, countdownEndsAt: null, correctAnswer: null });
  res.json({ ok: true, message: "Scores and responses reset successfully. Participants retained.", state });
});

r.post("/admin/reset-all-fresh", requireAdmin, async (_req, res) => {
  try { await redis.flushdb(); } catch (_) {}
  await redis.set("score:STACK_PUSH", "0");
  await redis.set("score:IT_INNOVATORS", "0");
  await redis.set("quiz:nextParticipantId", "1");
  const state = await setState({ status: "WAITING", currentQuestionId: 1, questionStartedAt: null, countdownEndsAt: null, correctAnswer: null });
  res.json({ ok: true, message: "All data cleared", state });
});

r.post("/admin/end-quiz", requireAdmin, async (_req, res) => {
  const state = await setState({ status: "FINISHED" });
  res.json({ ok: true, state });
});

r.get("/admin/summary", requireAdmin, async (_req, res) => {
  const state = await getState();
  const currentQ = getQuestion(state.currentQuestionId);
  const stackScore = await getClubScore("STACK_PUSH");
  const innovScore = await getClubScore("IT_INNOVATORS");
  res.json({
    session: { ...state, currentQuestion: currentQ },
    currentQuestionId: state.currentQuestionId,
    clubs: [{ name: "STACK_PUSH", score: stackScore }, { name: "IT_INNOVATORS", score: innovScore }],
  });
});

r.get("/admin/questions", requireAdmin, (_req, res) => {
  res.json(QUESTIONS);
});

// ── Public Endpoints ──────────────────────────────────────────────────────────
r.get("/quiz-state", async (_req, res) => {
  const state = await getState();
  const currentQ = getQuestion(state.currentQuestionId);
  res.json({ session: { ...state, currentQuestion: currentQ }, currentQuestion: currentQ });
});

r.get("/leaderboard", async (_req, res) => {
  const s = await getClubScore("STACK_PUSH");
  const i = await getClubScore("IT_INNOVATORS");
  res.json({ clubs: [{ name: "STACK_PUSH", score: s }, { name: "IT_INNOVATORS", score: i }] });
});

// ── Registration ──────────────────────────────────────────────────────────────
r.post("/participants/register", async (req, res) => {
  try {
    const { name, club } = req.body ?? {};
    const n = String(name || "").trim();
    if (!n) return res.status(400).json({ error: "Name is required" });
    if (!isValidClub(String(club || ""))) return res.status(400).json({ error: "Valid club required" });

    const id = await redis.incr("quiz:nextParticipantId");

    const token = encodeToken({ id, name: n, club: String(club) });
    const participant = { id, name: n, club, sessionToken: token, score: 0, correctCount: 0, attemptCount: 0, joinedAt: new Date().toISOString() };
    await saveParticipant(participant);
    res.json({ ok: true, participant });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Registration failed" });
  }
});

// ── Student Session Poll ──────────────────────────────────────────────────────
r.get("/participants/session", async (req, res) => {
  const token = String(req.query.token ?? "");
  if (!token) return res.status(400).json({ error: "Missing token" });

  const participant = await getParticipant(token);
  if (!participant) return res.status(404).json({ error: "Participant not found" });

  const state = await getState();
  const currentQ = getQuestion(state.currentQuestionId);
  const submission = await getSubmission(participant.id, currentQ.id);
  const showQuestion = state.status === "LIVE" || state.status === "LOCKED" || state.status === "REVEALED";

  res.json({
    participant: { id: participant.id, name: participant.name, club: participant.club, score: participant.score, correctCount: participant.correctCount, attemptCount: participant.attemptCount, sessionToken: participant.sessionToken },
    hasSubmitted: !!submission,
    userSubmission: submission,
    currentQuestion: showQuestion ? currentQ : null,
    sessionStatus: state.status,
    countdownEndsAt: state.countdownEndsAt,
    correctAnswer: state.status === "REVEALED" ? state.correctAnswer : null,
  });
});

// ── Answer Submission ─────────────────────────────────────────────────────────
r.post("/questions/submit", async (req, res) => {
  try {
    const { token, answer, questionId } = req.body ?? {};
    const participant = await getParticipant(String(token || ""));
    if (!participant) return res.status(404).json({ error: "Participant not found" });

    const state = await getState();
    if (state.status !== "LIVE") return res.status(400).json({ error: "Question is not live" });

    const currentQ = getQuestion(state.currentQuestionId);
    if (!currentQ || currentQ.id !== Number(questionId)) return res.status(400).json({ error: "Wrong question" });

    const a = String(answer || "").trim().toUpperCase();
    if (!["A", "B", "C", "D"].includes(a)) return res.status(400).json({ error: "Answer must be A/B/C/D" });

    const existing = await getSubmission(participant.id, currentQ.id);
    if (existing) return res.status(400).json({ error: "Already submitted" });

    const now = Date.now();
    const startedAt = state.questionStartedAt ? new Date(state.questionStartedAt).getTime() : now;
    const { isCorrect, pointsAwarded } = evaluateSubmission(a, currentQ.correctAnswer, currentQ.points);

    const sub = { id: now, participantId: participant.id, participantName: participant.name, club: participant.club, questionId: currentQ.id, questionNumber: currentQ.questionNumber, answer: a, isCorrect, pointsAwarded, responseTimeMs: Math.max(0, now - startedAt), submittedAt: new Date(now).toISOString() };
    await saveSubmission(sub);

    participant.score = (participant.score || 0) + pointsAwarded;
    participant.correctCount = (participant.correctCount || 0) + (isCorrect ? 1 : 0);
    participant.attemptCount = (participant.attemptCount || 0) + 1;
    await saveParticipant(participant);
    await addClubScore(participant.club, pointsAwarded);

    res.json({ ok: true, submission: sub, participantScore: participant.score });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Submission failed" });
  }
});

// Dual-mount
app.use("/api", r);
app.use("/", r);
app.use((_req, res) => res.status(404).json({ error: "Not found" }));
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("API Error:", err);
  res.status(500).json({ error: err?.message || "Internal server error" });
});

export { app };

export default function handler(req: any, res: any) {
  return (app as any)(req, res);
}
