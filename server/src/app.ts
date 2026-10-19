import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { loadSession } from "./middleware/auth";
import { idempotency } from "./middleware/idempotency";
import { errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./routes/auth";
import { workItemsRouter } from "./routes/workItems";
import { approvalsRouter } from "./routes/approvals";
import { teamsRouter } from "./routes/teams";
import { usersRouter } from "./routes/users";
import { activityRouter, dashboardRouter } from "./routes/dashboard";
import { notificationsRouter } from "./routes/notifications";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: env.clientOrigin,
      credentials: true
    })
  );
  app.use(express.json({ limit: "200kb" }));
  app.use(cookieParser());
  app.use(loadSession);
  app.use(idempotency);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "newtonite-ops", time: new Date().toISOString() });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/work-items", workItemsRouter);
  app.use("/api/approvals", approvalsRouter);
  app.use("/api/teams", teamsRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/activity", activityRouter);
  app.use("/api/notifications", notificationsRouter);

  app.use(errorHandler);
  return app;
}
