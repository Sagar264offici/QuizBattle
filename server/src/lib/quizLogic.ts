export type ClubName = "STACK_PUSH" | "IT_INNOVATORS";

export interface SubmissionRecord {
  participantName: string;
  club: ClubName;
  questionNumber: number;
  responseTimeMs: number;
  isCorrect: boolean;
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

export function sortFastestCorrect(items: SubmissionRecord[]) {
  return [...items]
    .filter((entry) => entry.isCorrect)
    .sort((a, b) => a.responseTimeMs - b.responseTimeMs);
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
