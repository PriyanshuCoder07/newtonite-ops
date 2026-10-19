import { execSync } from "child_process";
import path from "path";
import fs from "fs";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "file:./test.db";
process.env.SESSION_SECRET = "test-secret";
process.env.SESSION_COOKIE_NAME = "newtonite_session";
process.env.STALE_AFTER_HOURS = "72";

const dbPath = path.resolve(__dirname, "../prisma/test.db");
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

// Apply the real, versioned migrations (not `db push`) so the tests exercise the same
// schema that a fresh clone gets from `npm run db:migrate:deploy`.
execSync("npx prisma migrate deploy", {
  cwd: path.resolve(__dirname, ".."),
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: "file:./test.db" }
});
