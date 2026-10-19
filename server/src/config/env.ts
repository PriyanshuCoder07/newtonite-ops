import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: process.env.DATABASE_URL ?? "file:./dev.db",
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  sessionSecret: process.env.SESSION_SECRET ?? "dev-only-change-me-in-production",
  sessionCookieName: process.env.SESSION_COOKIE_NAME ?? "newtonite_session",
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? 12),
  staleAfterHours: Number(process.env.STALE_AFTER_HOURS ?? 72),
  isProd: (process.env.NODE_ENV ?? "development") === "production"
};
