import http from "node:http";
import { app } from "./index.js";

const port = Number(process.env.PORT ?? 3000);
const server = http.createServer(app);

server.listen(port, "0.0.0.0", () => {
  console.log(`QuizBattle API running on http://localhost:${port}`);
});
