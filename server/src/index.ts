import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import session from "express-session";
import http from "http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server as SocketIOServer } from "socket.io";
import { config } from "./config.js";
import { quizStore } from "./services/quizStore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
const distDir = path.join(rootDir, "dist");

export const app = express();
export const server = http.createServer(app);

// Socket.io initialization with graceful fallback
let io: SocketIOServer | null = null;
try {
  io = new SocketIOServer(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });
} catch (e) {
  console.warn("Socket.io initialization skipped (serverless environment)");
}

function broadcast(event: string, data: any) {
  if (io) {
    try {
      io.emit(event, data);
    } catch (_) {}
  }
}

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

// Robust body parsing handling both standard Express and Vercel serverless pre-parsed bodies
app.use((req, res, next) => {
  if (typeof req.body === "string" && req.body) {
    try {
      req.body = JSON.parse(req.body);
    } catch (_) {}
    return next();
  }
  if (req.body && typeof req.body === "object") {
    return next();
  }
  express.json()(req, res, next);
});
app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 1000 * 60 * 60 * 24, // 24 hours
    },
  }),
);

const adminPassword = config.adminPassword || "MadeBySagar";
const adminPasswordHash = bcrypt.hashSync(adminPassword, 10);

function requireAdmin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const isAuth =
    (req.session as any)?.isAdmin ||
    req.headers["x-admin-password"] === adminPassword;
  if (!isAuth) {
    return res.status(401).json({ error: "Unauthorized admin session" });
  }
  next();
}

// Router that works whether mounted on /api or /
const apiRouter = express.Router();

// --- Health ---
apiRouter.get("/health", (_req, res) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    status: quizStore.getState().status,
  });
});

// --- Admin Auth ---
apiRouter.post("/admin/login", (req, res) => {
  const { password } = req.body ?? {};
  if (
    !password ||
    (password !== adminPassword && !bcrypt.compareSync(String(password), adminPasswordHash))
  ) {
    return res.status(401).json({ error: "Invalid admin password" });
  }

  (req.session as any).isAdmin = true;
  res.json({ ok: true, message: "Logged in successfully" });
});

apiRouter.post("/admin/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// --- Admin Endpoints ---
apiRouter.get("/admin/summary", requireAdmin, (_req, res) => {
  const summary = quizStore.getAdminSummary();
  res.json(summary);
});

apiRouter.get("/admin/questions", requireAdmin, (_req, res) => {
  res.json(quizStore.getAllQuestions());
});

// Start Question with 3-second Countdown Timer
apiRouter.post("/admin/start-countdown", requireAdmin, (req, res) => {
  const { questionId, seconds } = req.body ?? {};
  const state = quizStore.startCountdown(
    questionId ? Number(questionId) : undefined,
    Number(seconds) || 3,
  );
  broadcast("quiz:state", state);
  res.json({ ok: true, state });
});

apiRouter.post("/admin/start-question", requireAdmin, (req, res) => {
  const { questionId, withCountdown } = req.body ?? {};
  let state;
  if (withCountdown !== false) {
    state = quizStore.startCountdown(
      questionId ? Number(questionId) : undefined,
      3,
    );
  } else {
    state = quizStore.startQuestionDirect(
      questionId ? Number(questionId) : undefined,
    );
  }
  broadcast("quiz:state", state);
  res.json({ ok: true, state });
});

apiRouter.post("/admin/lock-answers", requireAdmin, (_req, res) => {
  const state = quizStore.lockAnswers();
  broadcast("quiz:state", state);
  res.json({ ok: true, state });
});

apiRouter.post("/admin/reveal-answer", requireAdmin, (_req, res) => {
  const result = quizStore.revealAnswer();
  broadcast("quiz:state", result.state);
  broadcast("display:reveal", result);
  res.json({ ok: true, ...result });
});

apiRouter.post("/admin/next-question", requireAdmin, (req, res) => {
  const { questionNumber } = req.body ?? {};
  const state = quizStore.nextQuestion(
    questionNumber ? Number(questionNumber) : undefined,
  );
  broadcast("quiz:state", state);
  res.json({ ok: true, state });
});

apiRouter.post("/admin/prev-question", requireAdmin, (_req, res) => {
  const state = quizStore.prevQuestion();
  broadcast("quiz:state", state);
  res.json({ ok: true, state });
});

apiRouter.post("/admin/select-question", requireAdmin, (req, res) => {
  const { questionNumber } = req.body ?? {};
  if (!questionNumber) {
    return res.status(400).json({ error: "Question number is required" });
  }
  const state = quizStore.selectQuestion(Number(questionNumber));
  broadcast("quiz:state", state);
  res.json({ ok: true, state });
});

apiRouter.post("/admin/reset-current-question", requireAdmin, (_req, res) => {
  const state = quizStore.resetCurrentQuestion();
  broadcast("quiz:state", state);
  res.json({ ok: true, state });
});

// --- 1-CLICK RESET ACTIONS FOR TESTING WITH TEACHER ---
apiRouter.post("/admin/reset-scores", requireAdmin, (_req, res) => {
  const state = quizStore.resetScoresForTesting();
  broadcast("quiz:state", state);
  broadcast("leaderboard:update", { clubs: quizStore.clubScores });
  res.json({
    ok: true,
    message: "Scores and responses reset successfully. Participants retained.",
    state,
  });
});

apiRouter.post("/admin/reset-all-fresh", requireAdmin, (_req, res) => {
  const state = quizStore.clearAllFresh();
  broadcast("quiz:state", state);
  broadcast("leaderboard:update", { clubs: quizStore.clubScores });
  res.json({
    ok: true,
    message: "All participants, responses, and scores cleared fresh.",
    state,
  });
});

apiRouter.post("/admin/reset-quiz", requireAdmin, (_req, res) => {
  const state = quizStore.resetScoresForTesting();
  broadcast("quiz:state", state);
  res.json({ ok: true, state });
});

apiRouter.post("/admin/end-quiz", requireAdmin, (_req, res) => {
  const state = quizStore.endQuiz();
  broadcast("quiz:state", state);
  res.json({ ok: true, state });
});

// --- Public & Student Endpoints ---
apiRouter.get("/quiz-state", (_req, res) => {
  const state = quizStore.getState();
  res.json({
    session: state,
    currentQuestion: state.currentQuestion,
  });
});

apiRouter.get("/leaderboard", (_req, res) => {
  res.json({
    clubs: [
      { name: "STACK_PUSH", score: quizStore.clubScores.STACK_PUSH },
      { name: "IT_INNOVATORS", score: quizStore.clubScores.IT_INNOVATORS },
    ],
  });
});

apiRouter.post("/participants/register", (req, res) => {
  try {
    const { name, club } = req.body ?? {};
    const participant = quizStore.registerParticipant(String(name || ""), String(club || ""));
    broadcast("participant:joined", participant);
    res.json({
      ok: true,
      participant: {
        id: participant.id,
        name: participant.name,
        club: participant.club,
        sessionToken: participant.sessionToken,
        score: participant.score,
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to register" });
  }
});

apiRouter.get("/participants/session", (req, res) => {
  const token = String(req.query.token ?? "");
  if (!token) {
    return res.status(400).json({ error: "Missing session token" });
  }

  const participant = quizStore.getParticipantByToken(token);
  if (!participant) {
    return res.status(404).json({ error: "Participant not found" });
  }

  const state = quizStore.getState();
  const currentQ = state.currentQuestion;
  const submission = currentQ ? quizStore.getSubmission(participant.id, currentQ.id) : null;

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
    userSubmission: submission,
    currentQuestion: currentQ,
    sessionStatus: state.status,
    countdownEndsAt: state.countdownEndsAt,
    correctAnswer: state.correctAnswer,
  });
});

apiRouter.post("/questions/submit", (req, res) => {
  try {
    const { token, answer, questionId } = req.body ?? {};
    const result = quizStore.submitAnswer(
      String(token || ""),
      Number(questionId),
      String(answer || ""),
    );

    broadcast("participant:submitted", {
      participantId: result.participant.id,
      participantName: result.participant.name,
      club: result.participant.club,
      questionId: Number(questionId),
      isCorrect: result.submission.isCorrect,
      pointsAwarded: result.submission.pointsAwarded,
      responseTimeMs: result.submission.responseTimeMs,
    });

    broadcast("leaderboard:update", {
      clubs: quizStore.clubScores,
    });

    res.json({
      ok: true,
      submission: result.submission,
      participantScore: result.participant.score,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Submission failed" });
  }
});

// Dual-mount router on both /api and / so it never 404s on Vercel path rewrites
app.use("/api", apiRouter);
app.use("/", apiRouter);

// Socket.io handlers
if (io) {
  io.on("connection", (socket) => {
    socket.emit("connection:ready", { ok: true, state: quizStore.getState() });

    socket.on("participant:identify", ({ token }) => {
      if (!token) return;
      const participant = quizStore.getParticipantByToken(String(token));
      if (participant) {
        socket.emit("participant:session", { participant });
      }
    });

    socket.on("admin:request-state", () => {
      socket.emit("quiz:state", quizStore.getState());
    });
  });
}

// Serve Vite frontend when running standalone locally (not in serverless environment)
if (!process.env.VERCEL) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
} else {
  // On Vercel serverless, return JSON 404 for unknown endpoints
  app.use((_req, res) => {
    res.status(404).json({ error: "Endpoint not found" });
  });
}

// Global error handler so exceptions return JSON instead of crashing
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("API error:", err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

// Start local server if not running as a Vercel serverless function or in test mode
if (!process.env.VERCEL && process.env.NODE_ENV !== "test" && !process.env.VITEST) {
  const port = config.port || 3000;
  server.listen(port, "0.0.0.0", () => {
    console.log(`QuizBattle Server running on http://0.0.0.0:${port}`);
  });
}

export default app;
