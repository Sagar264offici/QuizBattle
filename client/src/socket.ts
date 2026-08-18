import { io } from "socket.io-client";
import type { QuizMode } from "./services/api";

const isLocalhost =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

const socketUrl = isLocalhost ? "http://localhost:3000" : "";

/**
 * Realtime transport — Socket.IO.
 *
 * The client always attempts a connection (dev → :3000, otherwise same origin)
 * so persistent deployments (LAN host, Procfile host, cloudflare/ngrok tunnel)
 * get instant push. On Vercel the serverless API has no attached Socket.IO
 * server, so the connection fails fast and every page gracefully falls back to
 * its REST polling path (same behavior as before this change). Reconnection is
 * bounded with backoff so a temporary drop recovers with a single resync.
 */
export const socket = io(socketUrl, {
  transports: ["websocket", "polling"],
  reconnectionAttempts: 6,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 4000,
  autoConnect: true,
});

/** Announce which quiz mode (live/test) this client belongs to. */
export function joinRealtimeRoom(mode: QuizMode) {
  socket.emit("join", mode);
}

/** True when the Socket.IO transport is currently up. */
export function isRealtimeConnected(): boolean {
  return socket.connected;
}
