import { describe, expect, it } from "vitest";
import {
    ensureUniqueSubmission,
    evaluateSubmission,
    getClubScore,
    isValidClub,
    sortFastestCorrect,
} from "../server/src/lib/quizLogic";

describe("quiz logic", () => {
  it("calculates score correctly for correct and incorrect answers", () => {
    expect(evaluateSubmission("A", "A", 5)).toEqual({
      isCorrect: true,
      pointsAwarded: 5,
    });
    expect(evaluateSubmission("B", "A", 5)).toEqual({
      isCorrect: false,
      pointsAwarded: 0,
    });
  });

  it("aggregates club totals from participant scores", () => {
    const participants = [
      { club: "STACK_PUSH", score: 10 },
      { club: "STACK_PUSH", score: 5 },
      { club: "IT_INNOVATORS", score: 7 },
    ];

    expect(getClubScore(participants, "STACK_PUSH")).toBe(15);
    expect(getClubScore(participants, "IT_INNOVATORS")).toBe(7);
  });

  it("sorts fastest correct responses by server timestamp", () => {
    const submissions = [
      {
        participantName: "Ravi",
        club: "IT_INNOVATORS",
        questionNumber: 20,
        responseTimeMs: 1800,
        isCorrect: true,
      },
      {
        participantName: "Rahul",
        club: "STACK_PUSH",
        questionNumber: 20,
        responseTimeMs: 1200,
        isCorrect: true,
      },
      {
        participantName: "Aman",
        club: "IT_INNOVATORS",
        questionNumber: 20,
        responseTimeMs: 2200,
        isCorrect: false,
      },
    ];

    expect(sortFastestCorrect(submissions)[0].participantName).toBe("Rahul");
  });

  it("prevents duplicate submissions for the same participant and question", () => {
    const existing = new Set(["p1:q10"]);
    expect(ensureUniqueSubmission(existing, "p1", 10)).toBe(false);
    expect(ensureUniqueSubmission(existing, "p2", 10)).toBe(true);
  });

  it("accepts only valid clubs", () => {
    expect(isValidClub("STACK_PUSH")).toBe(true);
    expect(isValidClub("IT_INNOVATORS")).toBe(true);
    expect(isValidClub("GUEST")).toBe(false);
  });
});
