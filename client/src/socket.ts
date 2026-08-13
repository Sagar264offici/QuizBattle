import { io } from "socket.io-client";

// Connect to window.location.origin in production, or localhost in dev
const socketUrl =
  typeof window !== "undefined"
    ? window.location.hostname === "localhost"
      ? "http://localhost:3000"
      : window.location.origin
    : "";

export const socket = io(socketUrl, {
  transports: ["websocket", "polling"],
  reconnectionAttempts: 3,
  timeout: 3000,
  autoConnect: true,
});
