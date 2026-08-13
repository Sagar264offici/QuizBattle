/**
 * QuizBattle API - Upstash Redis-backed Vercel Serverless Handler
 *
 * Uses Upstash Redis REST API (plain fetch, no SDK) for shared state across
 * all serverless lambda instances. Requires two env vars in Vercel:
 *   UPSTASH_REDIS_REST_URL  - e.g. https://your-db.upstash.io
 *   UPSTASH_REDIS_REST_TOKEN - your Upstash token
 */

import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import { randomUUID } from "node:crypto";
import { QUESTIONS } from "../server/src/data/questionsData.js";
import { evaluateSubmission, isValidClub } from "../server/src/lib/quizLogic.js";

// ── Upstash Redis REST helpers ────────────────────────────────────────────────

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || "";
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const HAS_REDIS = !!(REDIS_URL && REDIS_TOKEN);
const USE_TEST_STORE = process.env.NODE_ENV === "test" || !!process.env.VITEST;

// Tests run without an external service. Real local and Vercel runs always use Redis.
const memStore: Record<string, string> = {};

class StorageError extends Error {
  constructor(message = "Shared quiz storage is temporarily unavailable") {
    super(message);
    this.name = "StorageError";
  }
}

/** Execute an Upstash REST command. In production we never fall back to
 * process memory: a successful request must mean the state was persisted. */
async function redisCommand<T>(command: Array<string | number>): Promise<T> {
  if (!HAS_REDIS) {
    if (!USE_TEST_STORE) throw new StorageError("Quiz storage is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.");
    return undefined as T;
  }

  try {
    const res = await fetch(REDIS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
    });
    const json = await res.json() as { result?: T; error?: string };
    if (!res.ok || json.error !== undefined) throw new Error(json.error || `Redis returned ${res.status}`);
    return json.result as T;
  } catch (error) {
    console.error("Redis command failed:", error);
    throw new StorageError();
  }
}

async function redisGet(key: string): Promise<string | null> {
  if (!HAS_REDIS) {
    if (!USE_TEST_STORE) throw new StorageError("Quiz storage is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.");
    return memStore[key] ?? null;
  }
  return redisCommand<string | null>(["GET", key]);
}

async function redisSet(key: string, value: string, exSeconds?: number): Promise<void> {
  if (!HAS_REDIS) {
    if (!USE_TEST_STORE) throw new StorageError("Quiz storage is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.");
    memStore[key] = value;
    return;
  }
  await redisCommand(["SET", key, value, ...(exSeconds ? ["EX", exSeconds] : [])]);
}

async function redisDel(key: string): Promise<void> {
  if (!HAS_REDIS) {
    if (!USE_TEST_STORE) throw new StorageError("Quiz storage is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.");
    delete memStore[key];
    return;
  }
  await redisCommand(["DEL", key]);
}

async function redisIncr(key: string): Promise<number> {
  if (!HAS_REDIS) {
    if (!USE_TEST_STORE) throw new StorageError("Quiz storage is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.");
    const next = (Number(memStore[key]) || 0) + 1;
    memStore[key] = String(next);
    return next;
  }
  return redisCommand<number>(["INCR", key]);
}

async function redisIncrBy(key: string, amount: number): Promise<number> {
  if (!HAS_REDIS) {
    if (!USE_TEST_STORE) throw new StorageError("Quiz storage is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.");
    const next = (Number(memStore[key]) || 0) + amount;
    memStore[key] = String(next);
    return next;
  }
  return redisCommand<number>(["INCRBY", key, amount]);
}

async function redisSetNx(key: string, value: string, exSeconds: number): Promise<boolean> {
  if (!HAS_REDIS) {
    if (!USE_TEST_STORE) throw new StorageError("Quiz storage is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.");
    if (memStore[key]) return false;
    memStore[key] = value;
    return true;
  }
  return (await redisCommand<string | null>(["SET", key, value, "NX", "EX", exSeconds])) === "OK";
}

async function redisSAdd(key: string, value: string): Promise<void> {
  if (!HAS_REDIS) {
    const members = new Set(JSON.parse(memStore[key] || "[]") as string[]);
    members.add(value);
    memStore[key] = JSON.stringify([...members]);
    return;
  }
  await redisCommand(["SADD", key, value]);
}

async function redisSMembers(key: string): Promise<string[]> {
  if (!HAS_REDIS) {
    try { return JSON.parse(memStore[key] || "[]") as string[]; } catch (_) { return []; }
  }
  return redisCommand<string[]>(["SMEMBERS", key]);
}

async function redisDelMany(keys: string[]): Promise<void> {
  if (!keys.length) return;
  if (!HAS_REDIS) {
    for (const key of keys) delete memStore[key];
    return;
  }
  await redisCommand(["DEL", ...keys]);
}

// ── Quiz State helpers ────────────────────────────────────────────────────────

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

async function getSessionState(): Promise<QuizSessionState> {
  const raw = await redisGet("quiz:state");
  if (!raw) return { ...DEFAULT_STATE };
  try {
    const state = JSON.parse(raw) as QuizSessionState;
    // Auto-transition COUNTDOWN → LIVE if time elapsed
    if (state.status === "COUNTDOWN" && state.countdownEndsAt) {
      const remaining = new Date(state.countdownEndsAt).getTime() - Date.now();
      if (remaining <= 0) {
        // Do not write from a read path. Two concurrent polls could otherwise
        // overwrite a host action (for example LOCKED) with a stale LIVE state.
        // The exact countdown end is the shared, stable question start time.
        return {
          ...state,
          status: "LIVE",
          questionStartedAt: state.countdownEndsAt,
          countdownEndsAt: null,
        };
      }
    }
    return state;
  } catch (_) { return { ...DEFAULT_STATE }; }
}

async function setSessionState(patch: Partial<QuizSessionState>): Promise<QuizSessionState> {
  const current = await getSessionState();
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await redisSet("quiz:state", JSON.stringify(next));
  return next;
}

function getQuestion(questionNumber: number) {
  return QUESTIONS.find(q => q.questionNumber === questionNumber) ?? QUESTIONS[0];
}

function toPublicQuestion(question: ReturnType<typeof getQuestion>) {
  const { correctAnswer: _correctAnswer, ...safeQuestion } = question;
  return safeQuestion;
}

// Participant helpers
async function getParticipant(token: string) {
  const raw = await redisGet(`participant:${token}`);
  if (raw) {
    try { return JSON.parse(raw); } catch (_) {}
  }
  return null;
}

async function saveParticipant(p: any): Promise<void> {
  await redisSet(`participant:${p.sessionToken}`, JSON.stringify(p), 86400);
  await redisSAdd("quiz:participantTokens", p.sessionToken);
}

async function getSubmission(participantId: number, questionId: number) {
  const raw = await redisGet(`sub:${participantId}:${questionId}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

async function saveSubmission(sub: any): Promise<void> {
  await redisSet(`sub:${sub.participantId}:${sub.questionId}`, JSON.stringify(sub), 86400);
  await redisSAdd("quiz:submissionKeys", `${sub.participantId}:${sub.questionId}`);
}

function toStudentSubmission(submission: any, revealed: boolean) {
  if (!submission) return null;
  const { isCorrect: _isCorrect, pointsAwarded: _pointsAwarded, scoredAt: _scoredAt, ...safeSubmission } = submission;
  return revealed ? submission : safeSubmission;
}

async function scoreRevealedQuestion(questionId: number): Promise<void> {
  const submissionKeys = await redisSMembers("quiz:submissionKeys");
  const questionSuffix = `:${questionId}`;

  for (const key of submissionKeys) {
    if (!key.endsWith(questionSuffix)) continue;
    const [participantId] = key.split(":");
    const submission = await getSubmission(Number(participantId), questionId);
    if (!submission || submission.scoredAt) continue;

    const participant = await getParticipant(submission.sessionToken);
    if (!participant) continue;

    const awarded = submission.isCorrect ? submission.pointsAwarded : 0;
    participant.score = (participant.score || 0) + awarded;
    participant.correctCount = (participant.correctCount || 0) + (submission.isCorrect ? 1 : 0);
    participant.attemptCount = (participant.attemptCount || 0) + 1;

    await saveParticipant(participant);
    if (awarded) await incrClubScore(participant.club, awarded);

    submission.scoredAt = new Date().toISOString();
    await saveSubmission(submission);
  }
}

// Club scores: stored as simple integers
async function getClubScore(club: string): Promise<number> {
  const raw = await redisGet(`score:${club}`);
  return raw ? parseInt(raw, 10) || 0 : 0;
}

async function incrClubScore(club: string, by: number): Promise<void> {
  await redisIncrBy(`score:${club}`, by);
}

async function clearSubmissions(): Promise<void> {
  const submissionKeys = await redisSMembers("quiz:submissionKeys");
  await redisDelMany(submissionKeys.map((key) => `sub:${key}`));
  await redisDel("quiz:submissionKeys");
}

async function resetParticipants(): Promise<void> {
  const tokens = await redisSMembers("quiz:participantTokens");
  for (const token of tokens) {
    const participant = await getParticipant(token);
    if (!participant) continue;
    await saveParticipant({ ...participant, score: 0, correctCount: 0, attemptCount: 0 });
  }
}

async function clearAllParticipants(): Promise<void> {
  const tokens = await redisSMembers("quiz:participantTokens");
  await redisDelMany(tokens.map((token) => `participant:${token}`));
  await redisDel("quiz:participantTokens");
  await redisDel("quiz:nextParticipantId");
}

// ── Express App ───────────────────────────────────────────────────────────────

export const app = express();

app.use(cors({ origin: true, credentials: true }));

// Body parser robust for Vercel pre-parsed bodies
app.use((req, res, next) => {
  if (typeof (req as any).body === "string" && (req as any).body) {
    try { (req as any).body = JSON.parse((req as any).body); } catch (_) {}
    return next();
  }
  if ((req as any).body && typeof (req as any).body === "object") return next();
  express.json()(req, res, next);
});

// Any real process without Redis would serve inconsistent quiz state, so fail clearly.
app.use((_req, res, next) => {
  if (!HAS_REDIS && !USE_TEST_STORE) {
    return res.status(503).json({
      error: "Quiz storage is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
    });
  }
  next();
});

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "MadeBySagar";
const ADMIN_HASH = bcrypt.hashSync(ADMIN_PASSWORD, 10);

function isAdmin(req: express.Request): boolean {
  const pw = req.headers["x-admin-password"] as string;
  return pw === ADMIN_PASSWORD || bcrypt.compareSync(pw || "", ADMIN_HASH);
}

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!isAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
  next();
}

const router = express.Router();

// ── Health ────────────────────────────────────────────────────────────────────
router.get("/health", async (_req, res) => {
  const state = await getSessionState();
  res.json({ ok: true, status: state.status, redis: HAS_REDIS });
});

// ── Admin Auth ────────────────────────────────────────────────────────────────
router.post("/admin/login", (req, res) => {
  const { password } = req.body ?? {};
  if (!password || !bcrypt.compareSync(String(password), ADMIN_HASH)) {
    return res.status(401).json({ error: "Invalid admin password" });
  }
  res.json({ ok: true, message: "Logged in successfully" });
});

// ── Admin Actions ─────────────────────────────────────────────────────────────
router.post("/admin/start-countdown", requireAdmin, async (req, res) => {
  const { questionNumber, seconds } = req.body ?? {};
  const q = getQuestion(Number(questionNumber) || 1);
  const endsAt = new Date(Date.now() + (Number(seconds) || 3) * 1000).toISOString();
  const state = await setSessionState({
    status: "COUNTDOWN",
    currentQuestionId: q.questionNumber,
    countdownEndsAt: endsAt,
    questionStartedAt: null,
    correctAnswer: null,
  });
  res.json({ ok: true, state });
});

router.post("/admin/start-question", requireAdmin, async (req, res) => {
  const { questionNumber } = req.body ?? {};
  const q = getQuestion(Number(questionNumber) || 1);
  const state = await setSessionState({
    status: "LIVE",
    currentQuestionId: q.questionNumber,
    questionStartedAt: new Date().toISOString(),
    countdownEndsAt: null,
    correctAnswer: null,
  });
  res.json({ ok: true, state });
});

router.post("/admin/lock-answers", requireAdmin, async (_req, res) => {
  const state = await setSessionState({ status: "LOCKED" });
  res.json({ ok: true, state });
});

router.post("/admin/reveal-answer", requireAdmin, async (_req, res) => {
  const current = await getSessionState();
  if (current.status === "REVEALED") {
    return res.json({ ok: true, state: current, correctAnswer: current.correctAnswer });
  }
  if (current.status !== "LIVE" && current.status !== "LOCKED") {
    return res.status(400).json({ error: "A live or locked question is required before revealing an answer" });
  }

  const q = getQuestion(current.currentQuestionId);
  // Lock first, then award server-side exactly once at the reveal point.
  if (current.status === "LIVE") await setSessionState({ status: "LOCKED" });
  await scoreRevealedQuestion(q.id);
  const state = await setSessionState({
    status: "REVEALED",
    correctAnswer: q ? q.correctAnswer : null,
  });
  res.json({ ok: true, state, correctAnswer: state.correctAnswer });
});

router.post("/admin/next-question", requireAdmin, async (req, res) => {
  const current = await getSessionState();
  const { questionNumber } = req.body ?? {};
  const nextNum = questionNumber
    ? Number(questionNumber)
    : Math.min((current.currentQuestionId || 1) + 1, 100);
  const q = getQuestion(nextNum);
  const state = await setSessionState({
    status: "WAITING",
    currentQuestionId: q.questionNumber,
    questionStartedAt: null,
    countdownEndsAt: null,
    correctAnswer: null,
  });
  res.json({ ok: true, state });
});

router.post("/admin/prev-question", requireAdmin, async (_req, res) => {
  const current = await getSessionState();
  const prevNum = Math.max((current.currentQuestionId || 1) - 1, 1);
  const q = getQuestion(prevNum);
  const state = await setSessionState({
    status: "WAITING",
    currentQuestionId: q.questionNumber,
    questionStartedAt: null,
    countdownEndsAt: null,
    correctAnswer: null,
  });
  res.json({ ok: true, state });
});

router.post("/admin/select-question", requireAdmin, async (req, res) => {
  const { questionNumber } = req.body ?? {};
  if (!questionNumber) return res.status(400).json({ error: "questionNumber required" });
  const q = getQuestion(Number(questionNumber));
  const state = await setSessionState({
    status: "WAITING",
    currentQuestionId: q.questionNumber,
    questionStartedAt: null,
    countdownEndsAt: null,
    correctAnswer: null,
  });
  res.json({ ok: true, state });
});

router.post("/admin/reset-scores", requireAdmin, async (_req, res) => {
  await clearSubmissions();
  await resetParticipants();
  await redisSet("score:STACK_PUSH", "0");
  await redisSet("score:IT_INNOVATORS", "0");
  const firstQ = QUESTIONS[0];
  const state = await setSessionState({
    status: "WAITING",
    currentQuestionId: firstQ.questionNumber,
    questionStartedAt: null,
    countdownEndsAt: null,
    correctAnswer: null,
  });
  res.json({ ok: true, message: "Scores and responses reset successfully. Participants retained.", state });
});

router.post("/admin/reset-all-fresh", requireAdmin, async (_req, res) => {
  await clearSubmissions();
  await clearAllParticipants();
  await redisSet("score:STACK_PUSH", "0");
  await redisSet("score:IT_INNOVATORS", "0");
  const firstQ = QUESTIONS[0];
  const state = await setSessionState({
    status: "WAITING",
    currentQuestionId: firstQ.questionNumber,
    questionStartedAt: null,
    countdownEndsAt: null,
    correctAnswer: null,
  });
  res.json({ ok: true, message: "All participants, responses, and scores cleared fresh.", state });
});

router.post("/admin/end-quiz", requireAdmin, async (_req, res) => {
  const state = await setSessionState({ status: "FINISHED" });
  res.json({ ok: true, state });
});

router.get("/admin/summary", requireAdmin, async (_req, res) => {
  const state = await getSessionState();
  const stackScore = await getClubScore("STACK_PUSH");
  const innovScore = await getClubScore("IT_INNOVATORS");
  const currentQ = getQuestion(state.currentQuestionId);
  res.json({
    session: { ...state, currentQuestion: currentQ },
    currentQuestionId: state.currentQuestionId,
    clubs: [
      { name: "STACK_PUSH", score: stackScore },
      { name: "IT_INNOVATORS", score: innovScore },
    ],
  });
});

router.get("/admin/questions", requireAdmin, (_req, res) => {
  res.json(QUESTIONS);
});

// ── Quiz State (public) ───────────────────────────────────────────────────────
router.get("/quiz-state", async (_req, res) => {
  const state = await getSessionState();
  const currentQ = getQuestion(state.currentQuestionId);
  res.json({
    session: { ...state, currentQuestion: toPublicQuestion(currentQ) },
    currentQuestion: toPublicQuestion(currentQ),
  });
});

// ── Leaderboard (public) ──────────────────────────────────────────────────────
router.get("/leaderboard", async (_req, res) => {
  const stackScore = await getClubScore("STACK_PUSH");
  const innovScore = await getClubScore("IT_INNOVATORS");
  res.json({
    clubs: [
      { name: "STACK_PUSH", score: stackScore },
      { name: "IT_INNOVATORS", score: innovScore },
    ],
  });
});

// ── Registration ──────────────────────────────────────────────────────────────
router.post("/participants/register", async (req, res) => {
  try {
    const { name, club } = req.body ?? {};
    const trimmedName = String(name || "").trim();
    if (!trimmedName) return res.status(400).json({ error: "Name is required" });
    if (!isValidClub(String(club || ""))) return res.status(400).json({ error: "Valid club is required" });

    // INCR keeps IDs unique even when many students join simultaneously.
    const id = await redisIncr("quiz:nextParticipantId");

    const safeClub = club as "STACK_PUSH" | "IT_INNOVATORS";
    const token = randomUUID();

    const participant = {
      id,
      name: trimmedName,
      club: safeClub,
      sessionToken: token,
      score: 0,
      correctCount: 0,
      attemptCount: 0,
      joinedAt: new Date().toISOString(),
    };

    await saveParticipant(participant);

    res.json({ ok: true, participant });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to register" });
  }
});

// ── Session (used for polling by student page) ────────────────────────────────
router.get("/participants/session", async (req, res) => {
  const token = String(req.query.token ?? "");
  if (!token) return res.status(400).json({ error: "Missing token" });

  const participant = await getParticipant(token);
  if (!participant) return res.status(404).json({ error: "Participant not found" });

  const state = await getSessionState();
  const currentQ = getQuestion(state.currentQuestionId);
  const submission = await getSubmission(participant.id, currentQ.id);
  const [stackScore, innovScore] = await Promise.all([
    getClubScore("STACK_PUSH"),
    getClubScore("IT_INNOVATORS"),
  ]);

  // Don't send correctAnswer unless REVEALED
  const safeCorrectAnswer = state.status === "REVEALED" ? state.correctAnswer : null;

  res.json({
    participant: {
      id: participant.id,
      name: participant.name,
      club: participant.club,
      score: participant.score,
      correctCount: participant.correctCount,
      attemptCount: participant.attemptCount,
      sessionToken: participant.sessionToken,
    },
    hasSubmitted: !!submission,
    userSubmission: toStudentSubmission(submission, state.status === "REVEALED"),
    currentQuestion: state.status === "LIVE" || state.status === "LOCKED" || state.status === "REVEALED"
      ? toPublicQuestion(currentQ)
      : null,
    sessionStatus: state.status,
    countdownEndsAt: state.countdownEndsAt,
    correctAnswer: safeCorrectAnswer,
    clubs: [
      { name: "STACK_PUSH", score: stackScore },
      { name: "IT_INNOVATORS", score: innovScore },
    ],
  });
});

// ── Answer Submission ─────────────────────────────────────────────────────────
router.post("/questions/submit", async (req, res) => {
  try {
    const { token, answer, questionId } = req.body ?? {};
    const participant = await getParticipant(String(token || ""));
    if (!participant) return res.status(404).json({ error: "Participant not found" });

    const state = await getSessionState();
    if (state.status !== "LIVE") {
      return res.status(400).json({ error: "Question is not live right now" });
    }

    const currentQ = getQuestion(state.currentQuestionId);
    if (!currentQ || currentQ.id !== Number(questionId)) {
      return res.status(400).json({ error: "Wrong question ID" });
    }

    const safeAnswer = String(answer || "").trim().toUpperCase();
    if (!["A", "B", "C", "D"].includes(safeAnswer)) {
      return res.status(400).json({ error: "Answer must be A, B, C, or D" });
    }

    const now = Date.now();
    const startedAt = state.questionStartedAt
      ? new Date(state.questionStartedAt).getTime()
      : now;
    const responseTimeMs = Math.max(0, now - startedAt);

    const { isCorrect, pointsAwarded } = evaluateSubmission(
      safeAnswer as "A" | "B" | "C" | "D",
      currentQ.correctAnswer,
      currentQ.points,
    );

    const submission = {
      id: Date.now(),
      participantId: participant.id,
      sessionToken: participant.sessionToken,
      participantName: participant.name,
      club: participant.club,
      questionId: currentQ.id,
      questionNumber: currentQ.questionNumber,
      answer: safeAnswer,
      isCorrect,
      pointsAwarded,
      responseTimeMs,
      submittedAt: new Date(now).toISOString(),
    };

    // SET NX makes the first answer final across all concurrent Lambda instances.
    const accepted = await redisSetNx(
      `sub:${participant.id}:${currentQ.id}`,
      JSON.stringify(submission),
      86400,
    );
    if (!accepted) return res.status(409).json({ error: "Already submitted for this question" });
    await redisSAdd("quiz:submissionKeys", `${participant.id}:${currentQ.id}`);

    res.json({
      ok: true,
      submission: toStudentSubmission(submission, false),
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Submission failed" });
  }
});

// Dual-mount so both /api/... and stripped paths work
app.use("/api", router);
app.use("/", router);

// 404 and error handlers
app.use((_req, res) => res.status(404).json({ error: "Not found" }));
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("API Error:", err);
  const status = err instanceof StorageError ? 503 : 500;
  res.status(status).json({ error: err?.message || "Internal server error" });
});

export default function handler(req: any, res: any) {
  return (app as any)(req, res);
}
