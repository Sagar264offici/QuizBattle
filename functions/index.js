import { defineSecret } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";

// Store the admin password in Secret Manager (firebase functions:secrets:set ADMIN_PASSWORD).
const adminPassword = defineSecret("ADMIN_PASSWORD");

// Firebase Functions are request-based, so the existing client uses its REST
// polling fallback there. Shared quiz state is persisted in Firebase Realtime Database.
process.env.QUIZ_STORE = "firebase";

const { app } = await import("./server-dist/api/index.js");

export const quizApi = onRequest(
  {
    region: "asia-south1",
    maxInstances: 10,
    timeoutSeconds: 60,
    memory: "512MiB",
    secrets: [adminPassword],
  },
  app,
);
