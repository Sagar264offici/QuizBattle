export type ClubName = "STACK_PUSH" | "IT_INNOVATORS";

export interface SubmissionRecord {
  participantName: string;
  club: ClubName;
  questionNumber: number;
  responseTimeMs: number;
  isCorrect: boolean;
  submittedAt?: string;
  participantId?: number;
}

export function evaluateSubmission(
  answer: string,
  correctAnswer: string,
  points: number,
) {
  const isCorrect = answer === correctAnswer;
  return {
    isCorrect,
    pointsAwarded: isCorrect ? points : 0,
  };
}

export function getClubScore(
  participants: Array<{ club: ClubName; score: number }>,
  club: ClubName,
) {
  return participants
    .filter((p) => p.club === club)
    .reduce((sum, p) => sum + p.score, 0);
}

/**
 * Deterministic fastest-correct ordering:
 *   1. responseTimeMs ASC
 *   2. server submission timestamp ASC (tie-break)
 *   3. participant id ASC (final tie-break)
 *
 * Once a submission is recorded its position never moves unless a genuinely
 * better (faster) result is added.
 */
export function sortFastestCorrect(items: SubmissionRecord[]) {
  return [...items]
    .filter((entry) => entry.isCorrect)
    .sort((a, b) => {
      const t = (a.responseTimeMs || 0) - (b.responseTimeMs || 0);
      if (t !== 0) return t;
      const ts =
        String(a.submittedAt || "").localeCompare(String(b.submittedAt || ""));
      if (ts !== 0) return ts;
      return (a.participantId || 0) - (b.participantId || 0);
    });
}

export function ensureUniqueSubmission(
  existing: Set<string>,
  participantId: string,
  questionId: number,
) {
  const key = `${participantId}:q${questionId}`;
  return !existing.has(key);
}

export function isValidClub(club: string): club is ClubName {
  return club === "STACK_PUSH" || club === "IT_INNOVATORS";
}
