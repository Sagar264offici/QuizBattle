export type ClubName = "STACK_PUSH" | "IT_INNOVATORS";
export type QuizState =
  | "WAITING"
  | "READY"
  | "LIVE"
  | "LOCKED"
  | "REVEALED"
  | "RESULTS"
  | "FINISHED";

export interface ParticipantSession {
  participantId: number;
  name: string;
  club: ClubName;
  sessionToken: string;
}

export interface QuizSnapshot {
  status: QuizState;
  roundName?: string;
  currentQuestionNumber?: number;
  currentQuestionId?: number;
  questionStartedAt?: string;
  questionText?: string;
  optionA?: string;
  optionB?: string;
  optionC?: string;
  optionD?: string;
  points?: number;
}
