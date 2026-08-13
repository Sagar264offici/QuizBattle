import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import { config } from "../server/src/config.js";
import { quizStore } from "../server/src/services/quizStore.js";

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

// Robust body parser for Vercel Serverless
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

const adminPassword = config.adminPassword || "MadeBySagar";
const adminPasswordHash = bcrypt.hashSync(adminPassword, 10);

function requireAdmin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const authHeader = req.headers["x-admin-password"] || req.headers["authorization"];
  const isAuth =
    authHeader === adminPassword ||
    (req.headers.cookie && req.headers.cookie.includes("quiz_admin=1"));

  if (!isAuth) {
    return res.status(401).json({ error: "Unauthorized admin session" });
  }
  next();
}

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

  res.setHeader("Set-Cookie", "quiz_admin=1; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400");
  res.json({ ok: true, message: "Logged in successfully" });
});

apiRouter.post("/admin/logout", (_req, res) => {
  res.setHeader("Set-Cookie", "quiz_admin=0; Path=/; HttpOnly; Max-Age=0");
  res.json({ ok: true });
});

// --- Admin Endpoints ---
apiRouter.get("/admin/summary", requireAdmin, (_req, res) => {
  const summary = quizStore.getAdminSummary();
  res.json(summary);
});

apiRouter.get("/admin/questions", requireAdmin, (_req, res) => {
  res.json(quizStore.getAllQuestions());
});

apiRouter.post("/admin/start-countdown", requireAdmin, (req, res) => {
  const { questionId, seconds } = req.body ?? {};
  const state = quizStore.startCountdown(
    questionId ? Number(questionId) : undefined,
    Number(seconds) || 3,
  );
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
  res.json({ ok: true, state });
});

apiRouter.post("/admin/lock-answers", requireAdmin, (_req, res) => {
  const state = quizStore.lockAnswers();
  res.json({ ok: true, state });
});

apiRouter.post("/admin/reveal-answer", requireAdmin, (_req, res) => {
  const result = quizStore.revealAnswer();
  res.json({ ok: true, ...result });
});

apiRouter.post("/admin/next-question", requireAdmin, (req, res) => {
  const { questionNumber } = req.body ?? {};
  const state = quizStore.nextQuestion(
    questionNumber ? Number(questionNumber) : undefined,
  );
  res.json({ ok: true, state });
});

apiRouter.post("/admin/prev-question", requireAdmin, (_req, res) => {
  const state = quizStore.prevQuestion();
  res.json({ ok: true, state });
});

apiRouter.post("/admin/select-question", requireAdmin, (req, res) => {
  const { questionNumber } = req.body ?? {};
  if (!questionNumber) {
    return res.status(400).json({ error: "Question number is required" });
  }
  const state = quizStore.selectQuestion(Number(questionNumber));
  res.json({ ok: true, state });
});

apiRouter.post("/admin/reset-current-question", requireAdmin, (_req, res) => {
  const state = quizStore.resetCurrentQuestion();
  res.json({ ok: true, state });
});

// --- 1-CLICK RESET ACTIONS FOR TEACHER TESTING ---
apiRouter.post("/admin/reset-scores", requireAdmin, (_req, res) => {
  const state = quizStore.resetScoresForTesting();
  res.json({
    ok: true,
    message: "Scores and responses reset successfully. Participants retained.",
    state,
  });
});

apiRouter.post("/admin/reset-all-fresh", requireAdmin, (_req, res) => {
  const state = quizStore.clearAllFresh();
  res.json({
    ok: true,
    message: "All participants, responses, and scores cleared fresh.",
    state,
  });
});

apiRouter.post("/admin/reset-quiz", requireAdmin, (_req, res) => {
  const state = quizStore.resetScoresForTesting();
  res.json({ ok: true, state });
});

apiRouter.post("/admin/end-quiz", requireAdmin, (_req, res) => {
  const state = quizStore.endQuiz();
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

    res.json({
      ok: true,
      submission: result.submission,
      participantScore: result.participant.score,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Submission failed" });
  }
});

// Dual-mount router on both /api and / so all Vercel path formats match
app.use("/api", apiRouter);
app.use("/", apiRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "API route not found" });
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("API error:", err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

export default function handler(req: any, res: any) {
  return app(req, res);
}
