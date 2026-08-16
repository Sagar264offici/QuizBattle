/**
 * Local boot entry for the quiz server.
 *
 * Runs the ENTIRE quiz from this machine with no external services:
 *  - QUIZ_STORE=memory → the in-memory store replaces Upstash Redis entirely
 *    (no quota, no cost, no network round-trips).
 *  - NODE_ENV=development → server/src/index.ts binds 0.0.0.0:3000.
 *  - If client/dist has been built (npm run build), the same server also
 *    serves the frontend, so ONE URL serves everything.
 *
 * Event usage:
 *   1. npm run build
 *   2. npm run server:dev   (or: node --import tsx api/local.ts)
 *   3. Expose it publicly for remote students:
 *        cloudflared tunnel --url http://localhost:3000   (free, no account)
 *        ngrok http 3000                                   (free, needs account)
 *      — or keep it LAN-only: students join http://<laptop-ip>:3000
 */

process.env.QUIZ_STORE = process.env.QUIZ_STORE || "memory";
process.env.NODE_ENV = process.env.NODE_ENV || "development";

const { server } = await import("../server/src/index.js");

export { server };
