import { useEffect, useRef, useState } from "react";
import { socket, joinRealtimeRoom } from "../socket";
import type { QuizMode } from "./api";

export interface ClubScore {
  name: string;
  score: number;
}

export interface QuizStateEvent {
  session: {
    status: string;
    currentQuestionId: number | null;
    countdownEndsAt: string | null;
    questionEndsAt: string | null;
    durationSeconds?: number;
    correctAnswer: string | null;
    portalOpen?: boolean;
    [key: string]: unknown;
  };
  currentQuestion: Record<string, unknown> | null;
  clubs?: ClubScore[];
  participantsCount?: number;
}

export interface LeaderboardEvent {
  clubs?: ClubScore[];
  topStudents?: Array<{ rank: number; name: string; club: string; score: number; correctCount: number }>;
  fastestTap?: unknown;
}

export interface ParticipantEvent {
  name?: string | null;
  club?: string;
  participantsCount?: number;
}

export interface SubmittedEvent {
  participantId?: number;
  participantName?: string;
  club?: string;
  answer?: string;
  questionNumber?: number;
  responseTimeMs?: number;
}

export interface RevealEvent {
  correctAnswer?: string | null;
}

interface RealtimeOptions {
  mode: QuizMode;
  /** Full authoritative resync — called on mount, on (re)connect, and by polling. */
  resync: () => void;
  /** Fallback poll cadence while the socket is DISCONNECTED (Vercel / outages). */
  pollMs: number;
  /** Heartbeat cadence while the socket is connected (safety net). Default 30s. */
  heartbeatMs?: number;
  onState?: (payload: QuizStateEvent) => void;
  onLeaderboard?: (payload: LeaderboardEvent) => void;
  onJoined?: (payload: ParticipantEvent) => void;
  onLeft?: (payload: ParticipantEvent) => void;
  onSubmitted?: (payload: SubmittedEvent) => void;
  onReveal?: (payload: RevealEvent) => void;
  onFinished?: (payload: { mode?: QuizMode }) => void;
}

/**
 * Single realtime synchronization path for a page.
 *
 * - Joins the Socket.IO room for the quiz mode.
 * - Subscribes to all realtime events, filtered by mode, and forwards payloads
 *   to the provided handlers (clients render from payloads — no refetch).
 * - Calls `resync` once on mount and once after every connect/reconnect.
 * - Polls ONLY while the socket is disconnected (graceful Vercel/fallback
 *   path); while connected it uses a slow heartbeat as a safety net.
 */
export function useRealtime({
  mode,
  resync,
  pollMs,
  heartbeatMs = 30000,
  onState,
  onLeaderboard,
  onJoined,
  onLeft,
  onSubmitted,
  onReveal,
  onFinished,
}: RealtimeOptions) {
  const [connected, setConnected] = useState<boolean>(socket.connected);

  // Keep the latest handlers in a ref so the effect below binds once per mode.
  const handlersRef = useRef({ resync, onState, onLeaderboard, onJoined, onLeft, onSubmitted, onReveal, onFinished });
  handlersRef.current = { resync, onState, onLeaderboard, onJoined, onLeft, onSubmitted, onReveal, onFinished };

  useEffect(() => {
    const h = () => handlersRef.current;
    const matches = (payload: { mode?: string } | null | undefined) =>
      !payload || !payload.mode || payload.mode === mode;

    const onConnect = () => {
      joinRealtimeRoom(mode);
      setConnected(true);
      h().resync();
    };
    const onDisconnect = () => setConnected(false);

    const onStateEvt = (payload: QuizStateEvent) => {
      if (!matches(payload as { mode?: string })) return;
      h().onState?.(payload);
    };
    const onLeaderboardEvt = (payload: LeaderboardEvent) => {
      if (!matches(payload as { mode?: string })) return;
      h().onLeaderboard?.(payload);
    };
    const onJoinedEvt = (payload: ParticipantEvent) => {
      if (!matches(payload as { mode?: string })) return;
      h().onJoined?.(payload);
    };
    const onLeftEvt = (payload: ParticipantEvent) => {
      if (!matches(payload as { mode?: string })) return;
      h().onLeft?.(payload);
    };
    const onSubmittedEvt = (payload: SubmittedEvent) => {
      if (!matches(payload as { mode?: string })) return;
      h().onSubmitted?.(payload);
    };
    const onRevealEvt = (payload: RevealEvent) => {
      if (!matches(payload as { mode?: string })) return;
      h().onReveal?.(payload);
    };
    const onFinishedEvt = (payload: { mode?: QuizMode }) => {
      if (!matches(payload)) return;
      h().onFinished?.(payload);
    };

    socket.on("connect", onConnect);
    socket.on("reconnect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("quiz:state", onStateEvt);
    socket.on("leaderboard:update", onLeaderboardEvt);
    socket.on("participant:joined", onJoinedEvt);
    socket.on("participant:left", onLeftEvt);
    socket.on("participant:submitted", onSubmittedEvt);
    socket.on("display:reveal", onRevealEvt);
    socket.on("quiz:finished", onFinishedEvt);

    if (socket.connected) joinRealtimeRoom(mode);

    // Initial authoritative sync.
    h().resync();

    return () => {
      socket.off("connect", onConnect);
      socket.off("reconnect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("quiz:state", onStateEvt);
      socket.off("leaderboard:update", onLeaderboardEvt);
      socket.off("participant:joined", onJoinedEvt);
      socket.off("participant:left", onLeftEvt);
      socket.off("participant:submitted", onSubmittedEvt);
      socket.off("display:reveal", onRevealEvt);
      socket.off("quiz:finished", onFinishedEvt);
    };
  }, [mode]);

  // Adaptive cadence: fast-ish fallback while disconnected, slow heartbeat
  // while connected. No per-second polling in either mode.
  useEffect(() => {
    const ms = connected ? heartbeatMs : pollMs;
    if (ms <= 0) return;
    const timer = setInterval(() => handlersRef.current.resync(), ms);
    return () => clearInterval(timer);
  }, [connected, pollMs, heartbeatMs]);

  return connected;
}
