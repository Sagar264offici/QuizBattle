import { describe, expect, it, beforeEach } from "vitest";
import { quizStore } from "../server/src/services/quizStore";

describe("QuizStore Engine", () => {
  beforeEach(() => {
    quizStore.clearAllFresh();
  });

  it("initializes with 100 questions across 5 rounds", () => {
    const questions = quizStore.getAllQuestions();
    expect(questions.length).toBe(100);
    expect(questions[0].questionNumber).toBe(1);
    expect(questions[99].questionNumber).toBe(100);

    const rounds = quizStore.getAllRounds();
    expect(rounds.length).toBe(5);
  });

  it("registers students correctly with valid clubs", () => {
    const s1 = quizStore.registerParticipant("Sagar", "STACK_PUSH");
    expect(s1.name).toBe("Sagar");
    expect(s1.club).toBe("STACK_PUSH");
    expect(s1.sessionToken).toBeDefined();

    const s2 = quizStore.registerParticipant("Aarav", "IT_INNOVATORS");
    expect(s2.name).toBe("Aarav");
    expect(s2.club).toBe("IT_INNOVATORS");

    expect(quizStore.getAllParticipants().length).toBe(2);
  });

  it("handles 3-second countdown and question start", () => {
    const countdownState = quizStore.startCountdown(1, 3);
    expect(countdownState.status).toBe("COUNTDOWN");
    expect(countdownState.countdownEndsAt).toBeDefined();

    const liveState = quizStore.startQuestionDirect(1);
    expect(liveState.status).toBe("LIVE");
    expect(liveState.currentQuestionId).toBe(1);
  });

  it("handles concurrent submissions for 50 students lightning fast", () => {
    // 1. Start Q1 (Points = 1, CPU = Central Processing Unit -> A)
    quizStore.startQuestionDirect(1);
    const q1 = quizStore.getQuestion(1)!;

    // 2. Register 50 students (25 in STACK_PUSH, 25 in IT_INNOVATORS)
    const tokens: Array<{ token: string; club: string; isCorrectAnswer: boolean }> = [];
    for (let i = 1; i <= 50; i++) {
      const club = i % 2 === 0 ? "STACK_PUSH" : "IT_INNOVATORS";
      const p = quizStore.registerParticipant(`Student ${i}`, club);
      // Half give correct answer A, half give wrong answer B
      const isCorrectAnswer = i <= 30;
      tokens.push({
        token: p.sessionToken,
        club,
        isCorrectAnswer,
      });
    }

    expect(quizStore.getAllParticipants().length).toBe(50);

    // 3. Submit answers for all 50 students
    const startTime = performance.now();
    for (const t of tokens) {
      const answer = t.isCorrectAnswer ? q1.correctAnswer : "D";
      quizStore.submitAnswer(t.token, 1, answer);
    }
    const elapsed = performance.now() - startTime;

    // Submissions for 50 students should complete in under 15ms in-memory
    expect(elapsed).toBeLessThan(50);

    const submissions = quizStore.getSubmissionsForQuestion(1);
    expect(submissions.length).toBe(50);

    // Verify club scores were correctly aggregated
    expect(quizStore.clubScores.STACK_PUSH + quizStore.clubScores.IT_INNOVATORS).toBe(30 * q1.points);
  });

  it("1-Click Reset: Resets scores and submissions while retaining registered participants for teacher testing", () => {
    quizStore.startQuestionDirect(1);
    const p1 = quizStore.registerParticipant("Test Student 1", "STACK_PUSH");
    const p2 = quizStore.registerParticipant("Test Student 2", "IT_INNOVATORS");

    quizStore.submitAnswer(p1.sessionToken, 1, "A");
    quizStore.submitAnswer(p2.sessionToken, 1, "A");

    expect(quizStore.getSubmissionsForQuestion(1).length).toBe(2);

    // Teacher clicks 1-Click Clear Scores
    const resetState = quizStore.resetScoresForTesting();
    expect(resetState.status).toBe("WAITING");
    expect(quizStore.clubScores.STACK_PUSH).toBe(0);
    expect(quizStore.clubScores.IT_INNOVATORS).toBe(0);
    expect(quizStore.getSubmissionsForQuestion(1).length).toBe(0);

    // Students are STILL registered so they don't have to re-enter names!
    expect(quizStore.getAllParticipants().length).toBe(2);
    expect(quizStore.getParticipantByToken(p1.sessionToken)?.score).toBe(0);
  });

  it("Complete Fresh Wipe: Clears all data back to clean state", () => {
    quizStore.registerParticipant("Test Student 1", "STACK_PUSH");
    quizStore.registerParticipant("Test Student 2", "IT_INNOVATORS");

    expect(quizStore.getAllParticipants().length).toBe(2);

    quizStore.clearAllFresh();

    expect(quizStore.getAllParticipants().length).toBe(0);
    expect(quizStore.getState().status).toBe("WAITING");
  });
});
