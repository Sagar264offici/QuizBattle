import http from "node:http";
import { app } from "../../api/index.js";

export { app };
export const server = http.createServer(app);

if (!process.env.VERCEL && process.env.NODE_ENV !== "test" && !process.env.VITEST) {
  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, "0.0.0.0", () => {
    console.log(`QuizBattle server running on http://localhost:${port}`);
  });
}
