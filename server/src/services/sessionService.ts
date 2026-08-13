import crypto from "crypto";
import { prisma } from "../database.js";

export async function getOrCreateClub(
  clubName: "STACK_PUSH" | "IT_INNOVATORS",
) {
  return prisma.club.upsert({
    where: { name: clubName },
    update: {},
    create: { name: clubName, score: 0 },
  });
}

export function createSessionToken() {
  return crypto.randomBytes(24).toString("hex");
}

export async function getCurrentSession() {
  return prisma.quizSession.findFirst({
    orderBy: { id: "desc" },
  });
}
