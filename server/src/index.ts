import http from "node:http";
import { app } from "../../api/index.js";
import { attachRealtime } from "./realtime.js";

export { app };
export const server = http.createServer(app);

// Realtime push layer — Socket.IO attached to the persistent server only.
// On Vercel (serverless) this module isn't the entry point, so `io` stays
// detached and the API falls back to REST polling on the client.
attachRealtime(server);

if (!process.env.VERCEL && process.env.NODE_ENV !== "test" && !process.env.VITEST) {
  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, "0.0.0.0", () => {
    console.log(`QuizBattle server running on http://localhost:${port}`);
  });
}
