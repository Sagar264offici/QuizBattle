import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? "file:./dev.db",
  adminPassword: process.env.ADMIN_PASSWORD ?? "MadeBySagar",
  sessionSecret: process.env.SESSION_SECRET ?? "quizbattle-dev-secret",
  clientUrl: process.env.CLIENT_URL ?? "http://localhost:5173",
  nodeEnv: process.env.NODE_ENV ?? "development",
};
