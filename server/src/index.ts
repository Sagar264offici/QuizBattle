import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import session from "express-session";
import http from "http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { config } from "./config.js";
import { prisma } from "./database.js";
import { evaluateSubmission, isValidClub } from "./lib/quizLogic.js";
import {
    createSessionToken,
    getCurrentSession,
    getOrCreateClub,
} from "./services/sessionService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
const distDir = path.join(rootDir, "dist");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json());
app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 1000 * 60 * 60 * 12,
    },
  }),
);

const adminPasswordHash = bcrypt.hashSync(config.adminPassword, 10);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

function requireAdmin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  if (!(req.session as any)?.isAdmin) {
    return res.status(401).json({ error: "Unauthorized admin session" });
  }
  next();
}

app.post("/api/admin/login", async (req, res) => {
  const { password } = req.body ?? {};
  if (!password || !bcrypt.compareSync(String(password), adminPasswordHash)) {
    return res.status(401).json({ error: "Invalid admin password" });
  }

  (req.session as any).isAdmin = true;
  await prisma.auditLog.create({
    data: {
      action: "ADMIN_LOGIN",
      adminIdentifier: "admin",
      metadata: JSON.stringify({ timestamp: new Date().toISOString() }),
    },
  });

  res.json({ ok: true });
});

app.post("/api/admin/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get("/api/admin/summary", requireAdmin, async (_req, res) => {
  const [participants, clubs, session, submissions] = await Promise.all([
    prisma.participant.findMany({ include: { club: true } }),
    prisma.club.findMany(),
    getCurrentSession(),
    prisma.submission.findMany({
      include: { participant: true, question: true },
    }),
  ]);

  const stack = participants.filter((p) => p.club.name === "STACK_PUSH").length;
  const innovators = participants.filter(
    (p) => p.club.name === "IT_INNOVATORS",
  ).length;

  res.json({
    participantsCount: participants.length,
    stackCount: stack,
    innovatorsCount: innovators,
    clubs: clubs.map((club) => ({ name: club.name, score: club.score })),
    session,
    answersReceived: submissions.length,
    answersPending: Math.max(
      0,
      participants.length * Math.max(0, session?.currentQuestionId ? 1 : 0),
    ),
    currentQuestionId: session?.currentQuestionId ?? null,
  });
});

app.get("/api/quiz-state", async (_req, res) => {
  const session = await getCurrentSession();
  const currentQuestion = session?.currentQuestionId
    ? await prisma.question.findUnique({
        where: { id: session.currentQuestionId },
        include: { round: true },
      })
    : null;

  res.json({
    session,
    currentQuestion: currentQuestion
      ? {
          id: currentQuestion.id,
          questionNumber: currentQuestion.questionNumber,
          questionText: currentQuestion.questionText,
          optionA: currentQuestion.optionA,
          optionB: currentQuestion.optionB,
          optionC: currentQuestion.optionC,
          optionD: currentQuestion.optionD,
          points: currentQuestion.points,
          round: currentQuestion.round.name,
        }
      : null,
  });
});

// Public leaderboard endpoint (no auth required)
app.get("/api/leaderboard", async (_req, res) => {
  const clubs = await prisma.club.findMany();
  res.json({
    clubs: clubs.map((club) => ({ name: club.name, score: club.score })),
  });
});

app.post("/api/participants/register", async (req, res) => {
  const body = req.body ?? {};
  const name = String(body.name ?? "").trim();
  const club = String(body.club ?? "");

  if (!name) {
    return res.status(400).json({ error: "Name is required" });
  }
  if (!isValidClub(club)) {
    return res.status(400).json({ error: "Club is required" });
  }

  const clubRecord = await getOrCreateClub(
    club as "STACK_PUSH" | "IT_INNOVATORS",
  );
  const token = createSessionToken();

  const participant = await prisma.participant.create({
    data: {
      name,
      clubId: clubRecord.id,
      sessionToken: token,
    },
    include: { club: true },
  });

  res.json({
    ok: true,
    participant: {
      id: participant.id,
      name: participant.name,
      club: participant.club.name,
      sessionToken: participant.sessionToken,
    },
  });
});

app.get("/api/participants/session", async (req, res) => {
  const token = String(req.query.token ?? "");
  if (!token) return res.status(400).json({ error: "Missing session token" });

  const participant = await prisma.participant.findUnique({
    where: { sessionToken: token },
    include: { club: true },
  });

  if (!participant)
    return res.status(404).json({ error: "Participant not found" });

  const session = await getCurrentSession();
  const currentQuestion = session?.currentQuestionId
    ? await prisma.question.findUnique({
        where: { id: session.currentQuestionId },
      })
    : null;

  const hasSubmitted = currentQuestion
    ? !!(await prisma.submission.findUnique({
        where: {
          participantId_questionId: {
            participantId: participant.id,
            questionId: currentQuestion.id,
          },
        },
      }))
    : false;

  res.json({
    participant: {
      id: participant.id,
      name: participant.name,
      club: participant.club.name,
      score: participant.score,
      sessionToken: participant.sessionToken,
    },
    hasSubmitted,
    currentQuestion: currentQuestion
      ? {
          id: currentQuestion.id,
          questionNumber: currentQuestion.questionNumber,
          questionText: currentQuestion.questionText,
          optionA: currentQuestion.optionA,
          optionB: currentQuestion.optionB,
          optionC: currentQuestion.optionC,
          optionD: currentQuestion.optionD,
          points: currentQuestion.points,
          status: session?.status,
        }
      : null,
    sessionStatus: session?.status ?? "WAITING",
  });
});

app.post("/api/questions/submit", async (req, res) => {
  const { token, answer, questionId } = req.body ?? {};
  const safeAnswer = String(answer ?? "")
    .trim()
    .toUpperCase();

  if (!token || !answer)
    return res
      .status(400)
      .json({ error: "Missing participant session or answer" });
  if (!["A", "B", "C", "D"].includes(safeAnswer))
    return res.status(400).json({ error: "Answer must be A-D" });

  const participant = await prisma.participant.findUnique({
    where: { sessionToken: String(token) },
    include: { club: true },
  });
  if (!participant)
    return res.status(404).json({ error: "Participant not found" });

  const session = await getCurrentSession();
  if (!session || session.status !== "LIVE")
    return res.status(409).json({ error: "Question is not live" });

  const targetQuestion = await prisma.question.findUnique({
    where: { id: Number(questionId) },
  });
  if (
    !targetQuestion ||
    Number(targetQuestion.id) !== Number(session.currentQuestionId)
  ) {
    return res
      .status(409)
      .json({ error: "Answer does not match the current question" });
  }

  const existing = await prisma.submission.findUnique({
    where: {
      participantId_questionId: {
        participantId: participant.id,
        questionId: targetQuestion.id,
      },
    },
  });

  if (existing)
    return res.status(409).json({ error: "Duplicate answer rejected" });

  const now = new Date();
  const startedAt = session.questionStartedAt ?? now;
  const responseTimeMs = Math.max(
    0,
    now.getTime() - new Date(startedAt).getTime(),
  );

  const { isCorrect, pointsAwarded } = evaluateSubmission(
    safeAnswer,
    targetQuestion.correctAnswer,
    targetQuestion.points,
  );

  const submission = await prisma.submission.create({
    data: {
      participantId: participant.id,
      questionId: targetQuestion.id,
      answer: safeAnswer,
      isCorrect,
      questionStartedAt: startedAt,
      submissionTimestamp: now,
      responseTimeMs,
      pointsAwarded,
    },
  });

  await prisma.participant.update({
    where: { id: participant.id },
    data: {
      score: { increment: pointsAwarded },
      correctCount: { increment: isCorrect ? 1 : 0 },
      attemptCount: { increment: 1 },
    },
  });

  await prisma.club.update({
    where: { id: participant.clubId },
    data: {
      score: { increment: pointsAwarded },
    },
  });

  io.emit("participant:submitted", {
    participantId: participant.id,
    participantName: participant.name,
    questionId: targetQuestion.id,
    isCorrect,
    pointsAwarded,
    responseTimeMs,
    club: participant.club.name,
  });

  io.emit("leaderboard:update", {
    type: "submission",
    submission,
  });

  res.json({ ok: true, submission: { ...submission, responseTimeMs } });
});

app.get("/api/admin/questions", requireAdmin, async (_req, res) => {
  const questions = await prisma.question.findMany({
    orderBy: [{ order: "asc" }],
    include: { round: true },
  });
  res.json(questions);
});

app.post("/api/admin/start-question", requireAdmin, async (req, res) => {
  const { questionId } = req.body ?? {};
  const question = await prisma.question.findUnique({
    where: { id: Number(questionId) },
  });
  if (!question) return res.status(404).json({ error: "Question not found" });

  const now = new Date();
  await prisma.quizSession.upsert({
    where: { id: 1 },
    update: {
      status: "LIVE",
      currentQuestionId: question.id,
      questionStartedAt: now,
      currentRoundId: question.roundId,
      updatedAt: now,
    },
    create: {
      id: 1,
      status: "LIVE",
      currentQuestionId: question.id,
      questionStartedAt: now,
      currentRoundId: question.roundId,
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "QUESTION_STARTED",
      adminIdentifier: "admin",
      metadata: JSON.stringify({
        questionId: question.id,
        questionNumber: question.questionNumber,
        startedAt: now.toISOString(),
      }),
    },
  });

  io.emit("quiz:state", {
    status: "LIVE",
    currentQuestionId: question.id,
    questionStartedAt: now.toISOString(),
  });
  io.emit("quiz:question", { question: { ...question } });
  res.json({ ok: true, currentQuestion: question });
});

app.post("/api/admin/lock-answers", requireAdmin, async (_req, res) => {
  const session = await getCurrentSession();
  if (!session) return res.status(400).json({ error: "No active session" });
  const now = new Date();
  await prisma.quizSession.update({
    where: { id: session.id },
    data: { status: "LOCKED", updatedAt: now },
  });
  await prisma.auditLog.create({
    data: {
      action: "ANSWERS_LOCKED",
      adminIdentifier: "admin",
      metadata: JSON.stringify({
        questionId: session.currentQuestionId,
        timestamp: now.toISOString(),
      }),
    },
  });
  io.emit("quiz:state", { status: "LOCKED" });
  res.json({ ok: true, status: "LOCKED" });
});

app.post("/api/admin/reveal-answer", requireAdmin, async (_req, res) => {
  const session = await getCurrentSession();
  if (!session) return res.status(400).json({ error: "No active session" });
  const question = await prisma.question.findUnique({
    where: { id: session.currentQuestionId! },
  });
  if (!question) return res.status(404).json({ error: "Question not found" });

  const submissions = await prisma.submission.findMany({
    where: { questionId: question.id },
    include: { participant: { include: { club: true } } },
  });

  const answers = submissions.map((sub) => ({
    participantName: sub.participant.name,
    club: sub.participant.club.name,
    responseTimeMs: sub.responseTimeMs,
    isCorrect: sub.isCorrect,
    answer: sub.answer,
    pointsAwarded: sub.pointsAwarded,
  }));

  await prisma.quizSession.update({
    where: { id: session.id },
    data: { status: "REVEALED", updatedAt: new Date() },
  });
  await prisma.auditLog.create({
    data: {
      action: "ANSWER_REVEALED",
      adminIdentifier: "admin",
      metadata: JSON.stringify({
        questionId: question.id,
        correctAnswer: question.correctAnswer,
        answers,
      }),
    },
  });

  io.emit("quiz:state", {
    status: "REVEALED",
    correctAnswer: question.correctAnswer,
    answers,
  });
  io.emit("display:update", {
    event: "reveal",
    correctAnswer: question.correctAnswer,
    questionNumber: question.questionNumber,
    answers,
  });
  res.json({ ok: true, correctAnswer: question.correctAnswer, answers });
});

app.post("/api/admin/next-question", requireAdmin, async (req, res) => {
  const question = await prisma.question.findFirst({
    where: { questionNumber: { gt: Number(req.body?.questionNumber ?? 0) } },
    orderBy: { questionNumber: "asc" },
  });
  const target =
    question ??
    (await prisma.question.findFirst({ orderBy: { questionNumber: "asc" } }));
  if (!target) return res.status(404).json({ error: "No questions available" });

  await prisma.quizSession.upsert({
    where: { id: 1 },
    update: {
      status: "READY",
      currentQuestionId: target.id,
      updatedAt: new Date(),
      questionStartedAt: null,
    },
    create: { id: 1, status: "READY", currentQuestionId: target.id },
  });
  await prisma.auditLog.create({
    data: {
      action: "NEXT_QUESTION",
      adminIdentifier: "admin",
      metadata: JSON.stringify({
        nextQuestionId: target.id,
        nextQuestionNumber: target.questionNumber,
      }),
    },
  });
  io.emit("quiz:state", { status: "READY", currentQuestionId: target.id });
  res.json({ ok: true, currentQuestion: target });
});

app.post(
  "/api/admin/reset-current-question",
  requireAdmin,
  async (_req, res) => {
    const session = await getCurrentSession();
    if (!session) return res.status(400).json({ error: "No active session" });

    await prisma.submission.deleteMany({
      where: { questionId: session.currentQuestionId ?? 0 },
    });
    await prisma.quizSession.update({
      where: { id: session.id },
      data: {
        status: "WAITING",
        questionStartedAt: null,
        updatedAt: new Date(),
      },
    });
    await prisma.auditLog.create({
      data: {
        action: "CURRENT_QUESTION_RESET",
        adminIdentifier: "admin",
        metadata: JSON.stringify({ questionId: session.currentQuestionId }),
      },
    });
    io.emit("quiz:state", { status: "WAITING" });
    res.json({ ok: true });
  },
);

app.post("/api/admin/reset-quiz", requireAdmin, async (_req, res) => {
  await prisma.submission.deleteMany({});
  await prisma.participant.updateMany({
    data: { score: 0, correctCount: 0, attemptCount: 0 },
  });
  await prisma.club.updateMany({ data: { score: 0 } });
  await prisma.quizSession.upsert({
    where: { id: 1 },
    update: {
      status: "WAITING",
      currentQuestionId: null,
      currentRoundId: null,
      questionStartedAt: null,
      updatedAt: new Date(),
    },
    create: { id: 1, status: "WAITING" },
  });
  await prisma.auditLog.create({
    data: {
      action: "QUIZ_RESET",
      adminIdentifier: "admin",
      metadata: JSON.stringify({ resetAt: new Date().toISOString() }),
    },
  });
  io.emit("quiz:state", { status: "WAITING" });
  res.json({ ok: true });
});

app.post("/api/admin/end-quiz", requireAdmin, async (_req, res) => {
  const session = await getCurrentSession();
  if (!session) return res.status(400).json({ error: "No active session" });
  await prisma.quizSession.update({
    where: { id: session.id },
    data: { status: "FINISHED", updatedAt: new Date() },
  });
  await prisma.auditLog.create({
    data: {
      action: "QUIZ_ENDED",
      adminIdentifier: "admin",
      metadata: JSON.stringify({ finishedAt: new Date().toISOString() }),
    },
  });
  io.emit("quiz:state", { status: "FINISHED" });
  res.json({ ok: true, status: "FINISHED" });
});

io.on("connection", (socket) => {
  socket.emit("connection:ready", { ok: true });

  socket.on("participant:identify", async ({ token }) => {
    if (!token) return;
    const participant = await prisma.participant.findUnique({
      where: { sessionToken: String(token) },
      include: { club: true },
    });
    if (!participant) return;
    socket.emit("participant:session", {
      participant: {
        id: participant.id,
        name: participant.name,
        club: participant.club.name,
        score: participant.score,
      },
    });
  });

  socket.on("admin:request-state", async () => {
    const session = await getCurrentSession();
    socket.emit("quiz:state", session ?? { status: "WAITING" });
  });
});

app.use(express.static(distDir));

app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

const port = config.port;
server.listen(port, "0.0.0.0", () => {
  console.log(`QuizBattle backend running on http://0.0.0.0:${port}`);
});
