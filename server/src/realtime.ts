/**
 * QuizBattle realtime layer — Socket.IO push for live quiz state.
 *
 * Attached to the persistent HTTP server (local / LAN / Procfile host). Every
 * REST handler that changes authoritative state publishes events here, so all
 * connected clients update instantly instead of polling.
 *
 * On Vercel the serverless function never calls attachRealtime(), so `io` stays
 * null and every emit is a cheap no-op — clients there gracefully fall back to
 * the REST polling path. This keeps the exact same API working everywhere while
 * giving persistent deployments true push.
 */

import { Server } from "socket.io";
import type { Server as HttpServer } from "node:http";

export type RealtimeMode = "live" | "test";

let io: Server | null = null;

/** Attach the Socket.IO server to a persistent HTTP server. Idempotent. */
export function attachRealtime(server: HttpServer): Server {
  if (io) return io;
  io = new Server(server, {
    cors: { origin: true, credentials: true },
    transports: ["websocket", "polling"],
  });
  io.on("connection", (socket) => {
    // Clients announce which quiz mode (live/test) they belong to so events
    // are scoped per room and never cross modes.
    socket.on("join", (mode: unknown) => {
      if (mode === "live" || mode === "test") {
        socket.join(mode);
      }
    });
  });
  return io;
}

/** Broadcast an event to every client in one quiz mode. No-op when detached. */
export function emitRealtime(mode: RealtimeMode, event: string, payload: unknown) {
  try {
    if (io) io.to(mode).emit(event, payload);
  } catch (err) {
    console.error("Realtime emit error:", err);
  }
}

/** Number of currently connected Socket.IO clients (0 when detached). */
export function realtimeClientCount(): number {
  try {
    return io ? io.engine.clientsCount : 0;
  } catch {
    return 0;
  }
}

/** True when Socket.IO is attached to a persistent server. */
export function isRealtimeAttached(): boolean {
  return io !== null;
}
