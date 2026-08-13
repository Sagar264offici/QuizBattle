import { io } from "socket.io-client";

const isLocalhost =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

const socketUrl = isLocalhost ? "http://localhost:3000" : "";

export const socket = io(socketUrl, {
  transports: ["websocket", "polling"],
  reconnectionAttempts: 1,
  timeout: 2000,
  autoConnect: isLocalhost,
});
