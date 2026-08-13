import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { QuestionItem, QUESTIONS, ROUNDS } from "../data/questionsData.js";
import { evaluateSubmission, isValidClub } from "../lib/quizLogic.js";

export type QuizStatus =
  | "WAITING"
  | "COUNTDOWN"
  | "LIVE"
  | "LOCKED"
  | "REVEALED"
  | "FINISHED";

export interface Participant {
  id: number;
  name: string;
  club: "STACK_PUSH" | "IT_INNOVATORS";
  sessionToken: string;
  score: number;
  correctCount: number;
  attemptCount: number;
  joinedAt: string;
}

export interface Submission {
  id: number;
  participantId: number;
  participantName: string;
  club: "STACK_PUSH" | "IT_INNOVATORS";
  questionId: number;
  questionNumber: number;
  answer: "A" | "B" | "C" | "D";
  isCorrect: boolean;
  pointsAwarded: number;
  responseTimeMs: number;
  submittedAt: string;
}

export interface QuizState {
  status: QuizStatus;
  currentQuestionId: number | null;
  currentQuestion: QuestionItem | null;
  questionStartedAt: string | null;
  countdownEndsAt: string | null;
  correctAnswer: string | null;
  updatedAt: string;
}

interface PersistedData {
  state: {
    status: QuizStatus;
    currentQuestionId: number | null;
    questionStartedAt: string | null;
    countdownEndsAt: string | null;
    correctAnswer: string | null;
    updatedAt: string;
  };
  clubScores: {
    STACK_PUSH: number;
    IT_INNOVATORS: number;
  };
  participants: Participant[];
  submissions: Submission[];
  version: number;
}

const STORAGE_FILE = path.join(os.tmpdir(), "quizbattle_store.json");

export function encodeSessionToken(p: { id: number; name: string; club: string }): string {
  const payload = JSON.stringify({
    id: p.id,
    name: p.name,
    club: p.club,
    t: Date.now(),
  });
  return Buffer.from(payload).toString("base64url");
}

export function decodeSessionToken(token: string): { id: number; name: string; club: "STACK_PUSH" | "IT_INNOVATORS" } | null {
  try {
    const json = Buffer.from(token, "base64url").toString("utf8");
    const data = JSON.parse(json);
    if (data && data.name && (data.club === "STACK_PUSH" || data.club === "IT_INNOVATORS")) {
      return {
        id: Number(data.id) || 1,
        name: String(data.name).trim(),
        club: data.club,
      };
    }
  } catch (_) {}
  return null;
}

class QuizStore {
  private participantsByToken = new Map<string, Participant>();
  private participantsById = new Map<number, Participant>();
  private submissions = new Map<string, Submission>(); // key: `${participantId}:${questionId}`
  private nextParticipantId = 1;
  private nextSubmissionId = 1;
  private lastLoadedMtime = 0;

  public clubScores = {
    STACK_PUSH: 0,
    IT_INNOVATORS: 0,
  };

  public state: QuizState = {
    status: "WAITING",
    currentQuestionId: 1,
    currentQuestion: QUESTIONS[0] ?? null,
    questionStartedAt: null,
    countdownEndsAt: null,
    correctAnswer: null,
    updatedAt: new Date().toISOString(),
  };

  private questionsByNumber = new Map<number, QuestionItem>();

  constructor() {
    for (const q of QUESTIONS) {
      this.questionsByNumber.set(q.questionNumber, q);
    }
    this.loadFromDisk();
  }

  // --- Disk Persistence (Shared across Vercel Lambdas) ---
  private saveToDisk() {
    try {
      const data: PersistedData = {
        state: {
          status: this.state.status,
          currentQuestionId: this.state.currentQuestionId,
          questionStartedAt: this.state.questionStartedAt,
          countdownEndsAt: this.state.countdownEndsAt,
          correctAnswer: this.state.correctAnswer,
          updatedAt: this.state.updatedAt,
        },
        clubScores: this.clubScores,
        participants: Array.from(this.participantsById.values()),
        submissions: Array.from(this.submissions.values()),
        version: Date.now(),
      };
      fs.writeFileSync(STORAGE_FILE, JSON.stringify(data), "utf8");
    } catch (_) {}
  }

  private loadFromDisk() {
    try {
      if (!fs.existsSync(STORAGE_FILE)) return;
      const stat = fs.statSync(STORAGE_FILE);
      if (stat.mtimeMs <= this.lastLoadedMtime) return;

      this.lastLoadedMtime = stat.mtimeMs;
      const raw = fs.readFileSync(STORAGE_FILE, "utf8");
      const data: PersistedData = JSON.parse(raw);

      if (data && data.state) {
        this.state = {
          ...data.state,
          currentQuestion: data.state.currentQuestionId
            ? this.getQuestion(data.state.currentQuestionId)
            : null,
        };
        this.clubScores = data.clubScores || { STACK_PUSH: 0, IT_INNOVATORS: 0 };

        if (Array.isArray(data.participants)) {
          for (const p of data.participants) {
            this.participantsById.set(p.id, p);
            if (p.sessionToken) this.participantsByToken.set(p.sessionToken, p);
            if (p.id >= this.nextParticipantId) this.nextParticipantId = p.id + 1;
          }
        }

        if (Array.isArray(data.submissions)) {
          for (const s of data.submissions) {
            this.submissions.set(`${s.participantId}:${s.questionId}`, s);
            if (s.id >= this.nextSubmissionId) this.nextSubmissionId = s.id + 1;
          }
        }
      }
    } catch (_) {}
  }

  // --- Questions ---
  public getAllQuestions(): QuestionItem[] {
    return QUESTIONS;
  }

  public getAllRounds() {
    return ROUNDS;
  }

  public getQuestion(idOrNumber: number): QuestionItem | null {
    return this.questionsByNumber.get(idOrNumber) ?? null;
  }

  // --- State & Session ---
  public getState(): QuizState {
    this.loadFromDisk();

    // If status is COUNTDOWN and time has passed, transition to LIVE automatically
    if (this.state.status === "COUNTDOWN" && this.state.countdownEndsAt) {
      const remaining = new Date(this.state.countdownEndsAt).getTime() - Date.now();
      if (remaining <= 0) {
        this.state.status = "LIVE";
        this.state.questionStartedAt = new Date().toISOString();
        this.state.countdownEndsAt = null;
        this.state.updatedAt = new Date().toISOString();
        this.saveToDisk();
      }
    }

    return {
      ...this.state,
      currentQuestion: this.state.currentQuestionId
        ? this.getQuestion(this.state.currentQuestionId)
        : null,
    };
  }

  // --- Participant Registration ---
  public registerParticipant(name: string, club: string): Participant {
    this.loadFromDisk();
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error("Name is required");
    if (!isValidClub(club)) throw new Error("Valid club is required");

    const id = this.nextParticipantId++;
    const safeClub = club as "STACK_PUSH" | "IT_INNOVATORS";
    const token = encodeSessionToken({ id, name: trimmedName, club: safeClub });

    const participant: Participant = {
      id,
      name: trimmedName,
      club: safeClub,
      sessionToken: token,
      score: 0,
      correctCount: 0,
      attemptCount: 0,
      joinedAt: new Date().toISOString(),
    };

    this.participantsByToken.set(token, participant);
    this.participantsById.set(id, participant);
    this.saveToDisk();
    return participant;
  }

  public getParticipantByToken(token: string): Participant | null {
    if (!token) return null;
    this.loadFromDisk();

    // Check in-memory map
    let p = this.participantsByToken.get(token);
    if (p) return p;

    // If not in map (e.g. fresh lambda), decode stateless token and restore
    const decoded = decodeSessionToken(token);
    if (decoded) {
      // Check if participant id exists
      p = this.participantsById.get(decoded.id);
      if (!p) {
        p = {
          id: decoded.id,
          name: decoded.name,
          club: decoded.club,
          sessionToken: token,
          score: 0,
          correctCount: 0,
          attemptCount: 0,
          joinedAt: new Date().toISOString(),
        };
        this.participantsById.set(p.id, p);
      }
      this.participantsByToken.set(token, p);
      this.saveToDisk();
      return p;
    }

    return null;
  }

  public getAllParticipants(): Participant[] {
    this.loadFromDisk();
    return Array.from(this.participantsById.values());
  }

  // --- Submission Handling ---
  public submitAnswer(token: string, questionId: number, answer: string): {
    submission: Submission;
    participant: Participant;
  } {
    this.loadFromDisk();
    const participant = this.getParticipantByToken(token);
    if (!participant) throw new Error("Participant not found");

    const currentState = this.getState();
    if (currentState.status !== "LIVE") {
      throw new Error("Question is not currently live for submissions");
    }

    const currentQ = this.getQuestion(currentState.currentQuestionId ?? 0);
    if (!currentQ || currentQ.id !== questionId) {
      throw new Error("Submitted answer is not for the current question");
    }

    const safeAnswer = answer.trim().toUpperCase() as "A" | "B" | "C" | "D";
    if (!["A", "B", "C", "D"].includes(safeAnswer)) {
      throw new Error("Answer must be A, B, C, or D");
    }

    const subKey = `${participant.id}:${currentQ.id}`;
    if (this.submissions.has(subKey)) {
      throw new Error("You have already submitted an answer for this question");
    }

    const now = Date.now();
    const startedAt = currentState.questionStartedAt
      ? new Date(currentState.questionStartedAt).getTime()
      : now;
    const responseTimeMs = Math.max(0, now - startedAt);

    const { isCorrect, pointsAwarded } = evaluateSubmission(
      safeAnswer,
      currentQ.correctAnswer,
      currentQ.points,
    );

    const submission: Submission = {
      id: this.nextSubmissionId++,
      participantId: participant.id,
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

    this.submissions.set(subKey, submission);

    // Update participant scores
    participant.score += pointsAwarded;
    participant.attemptCount += 1;
    if (isCorrect) participant.correctCount += 1;

    // Update club scores
    this.recalculateClubScores();
    this.saveToDisk();

    return { submission, participant };
  }

  public getSubmission(participantId: number, questionId: number): Submission | null {
    this.loadFromDisk();
    return this.submissions.get(`${participantId}:${questionId}`) ?? null;
  }

  public getSubmissionsForQuestion(questionId: number): Submission[] {
    this.loadFromDisk();
    const list: Submission[] = [];
    for (const sub of this.submissions.values()) {
      if (sub.questionId === questionId) {
        list.push(sub);
      }
    }
    return list.sort((a, b) => a.responseTimeMs - b.responseTimeMs);
  }

  private recalculateClubScores() {
    let stack = 0;
    let innovators = 0;
    for (const p of this.participantsById.values()) {
      if (p.club === "STACK_PUSH") stack += p.score;
      if (p.club === "IT_INNOVATORS") innovators += p.score;
    }
    this.clubScores.STACK_PUSH = stack;
    this.clubScores.IT_INNOVATORS = innovators;
  }

  // --- Host Actions ---
  public startCountdown(questionId?: number, seconds: number = 3) {
    this.loadFromDisk();
    const targetQId = questionId ?? this.state.currentQuestionId ?? 1;
    const q = this.getQuestion(targetQId) ?? QUESTIONS[0];

    const endsAt = new Date(Date.now() + seconds * 1000).toISOString();
    this.state = {
      status: "COUNTDOWN",
      currentQuestionId: q.id,
      currentQuestion: q,
      questionStartedAt: null,
      countdownEndsAt: endsAt,
      correctAnswer: null,
      updatedAt: new Date().toISOString(),
    };
    this.saveToDisk();
    return this.getState();
  }

  public startQuestionDirect(questionId?: number) {
    this.loadFromDisk();
    const targetQId = questionId ?? this.state.currentQuestionId ?? 1;
    const q = this.getQuestion(targetQId) ?? QUESTIONS[0];

    this.state = {
      status: "LIVE",
      currentQuestionId: q.id,
      currentQuestion: q,
      questionStartedAt: new Date().toISOString(),
      countdownEndsAt: null,
      correctAnswer: null,
      updatedAt: new Date().toISOString(),
    };
    this.saveToDisk();
    return this.getState();
  }

  public lockAnswers() {
    this.loadFromDisk();
    this.state.status = "LOCKED";
    this.state.updatedAt = new Date().toISOString();
    this.saveToDisk();
    return this.getState();
  }

  public revealAnswer() {
    this.loadFromDisk();
    const q = this.getQuestion(this.state.currentQuestionId ?? 0);
    this.state.status = "REVEALED";
    this.state.correctAnswer = q ? q.correctAnswer : null;
    this.state.updatedAt = new Date().toISOString();
    this.saveToDisk();
    return {
      state: this.getState(),
      correctAnswer: this.state.correctAnswer,
      submissions: q ? this.getSubmissionsForQuestion(q.id) : [],
    };
  }

  public nextQuestion(targetNumber?: number) {
    this.loadFromDisk();
    const currentNum = this.state.currentQuestionId ?? 0;
    const nextNum = targetNumber ?? currentNum + 1;
    const targetQ = this.getQuestion(nextNum) ?? this.getQuestion(1) ?? QUESTIONS[0];

    this.state = {
      status: "WAITING",
      currentQuestionId: targetQ.id,
      currentQuestion: targetQ,
      questionStartedAt: null,
      countdownEndsAt: null,
      correctAnswer: null,
      updatedAt: new Date().toISOString(),
    };
    this.saveToDisk();
    return this.getState();
  }

  public prevQuestion() {
    this.loadFromDisk();
    const currentNum = this.state.currentQuestionId ?? 1;
    const prevNum = Math.max(1, currentNum - 1);
    const targetQ = this.getQuestion(prevNum) ?? QUESTIONS[0];

    this.state = {
      status: "WAITING",
      currentQuestionId: targetQ.id,
      currentQuestion: targetQ,
      questionStartedAt: null,
      countdownEndsAt: null,
      correctAnswer: null,
      updatedAt: new Date().toISOString(),
    };
    this.saveToDisk();
    return this.getState();
  }

  public selectQuestion(questionNumber: number) {
    this.loadFromDisk();
    const targetQ = this.getQuestion(questionNumber) ?? QUESTIONS[0];
    this.state = {
      ...this.state,
      currentQuestionId: targetQ.id,
      currentQuestion: targetQ,
      updatedAt: new Date().toISOString(),
    };
    this.saveToDisk();
    return this.getState();
  }

  public resetCurrentQuestion() {
    this.loadFromDisk();
    const qId = this.state.currentQuestionId ?? 1;
    for (const [key, sub] of this.submissions.entries()) {
      if (sub.questionId === qId) {
        const p = this.participantsById.get(sub.participantId);
        if (p) {
          p.score = Math.max(0, p.score - sub.pointsAwarded);
          if (sub.isCorrect) p.correctCount = Math.max(0, p.correctCount - 1);
          p.attemptCount = Math.max(0, p.attemptCount - 1);
        }
        this.submissions.delete(key);
      }
    }
    this.recalculateClubScores();

    this.state.status = "WAITING";
    this.state.questionStartedAt = null;
    this.state.countdownEndsAt = null;
    this.state.correctAnswer = null;
    this.state.updatedAt = new Date().toISOString();
    this.saveToDisk();
    return this.getState();
  }

  // --- 1-CLICK RESET METHODS FOR TEACHER TESTING ---
  public resetScoresForTesting() {
    this.loadFromDisk();
    this.submissions.clear();
    for (const p of this.participantsById.values()) {
      p.score = 0;
      p.correctCount = 0;
      p.attemptCount = 0;
    }
    this.clubScores.STACK_PUSH = 0;
    this.clubScores.IT_INNOVATORS = 0;

    const firstQ = QUESTIONS[0];
    this.state = {
      status: "WAITING",
      currentQuestionId: firstQ ? firstQ.id : 1,
      currentQuestion: firstQ ?? null,
      questionStartedAt: null,
      countdownEndsAt: null,
      correctAnswer: null,
      updatedAt: new Date().toISOString(),
    };
    this.saveToDisk();
    return this.getState();
  }

  public clearAllFresh() {
    this.participantsByToken.clear();
    this.participantsById.clear();
    this.submissions.clear();
    this.nextParticipantId = 1;
    this.nextSubmissionId = 1;
    this.clubScores.STACK_PUSH = 0;
    this.clubScores.IT_INNOVATORS = 0;

    const firstQ = QUESTIONS[0];
    this.state = {
      status: "WAITING",
      currentQuestionId: firstQ ? firstQ.id : 1,
      currentQuestion: firstQ ?? null,
      questionStartedAt: null,
      countdownEndsAt: null,
      correctAnswer: null,
      updatedAt: new Date().toISOString(),
    };
    this.saveToDisk();
    return this.getState();
  }

  public endQuiz() {
    this.loadFromDisk();
    this.state.status = "FINISHED";
    this.state.updatedAt = new Date().toISOString();
    this.saveToDisk();
    return this.getState();
  }

  // --- Admin Summary ---
  public getAdminSummary() {
    this.loadFromDisk();
    const participants = this.getAllParticipants();
    const stackParticipants = participants.filter((p) => p.club === "STACK_PUSH");
    const innovatorsParticipants = participants.filter((p) => p.club === "IT_INNOVATORS");

    const currentQId = this.state.currentQuestionId ?? 1;
    const currentSubmissions = this.getSubmissionsForQuestion(currentQId);

    return {
      participantsCount: participants.length,
      stackCount: stackParticipants.length,
      innovatorsCount: innovatorsParticipants.length,
      clubs: [
        { name: "STACK_PUSH", score: this.clubScores.STACK_PUSH },
        { name: "IT_INNOVATORS", score: this.clubScores.IT_INNOVATORS },
      ],
      session: this.getState(),
      answersReceived: currentSubmissions.length,
      answersPending: Math.max(0, participants.length - currentSubmissions.length),
      currentQuestionId: currentQId,
      currentSubmissions,
      allSubmissionsCount: this.submissions.size,
    };
  }
}

export const quizStore = new QuizStore();
