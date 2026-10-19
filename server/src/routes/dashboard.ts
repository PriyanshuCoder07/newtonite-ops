import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { getSummary, listActivity } from "../services/dashboardService";
import { serializeWorkItem } from "../lib/serialize";
import { pageQuerySchema } from "../validators/workItems";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const summary = await getSummary(req.authUser!);
    res.json({
      metrics: summary.metrics,
      staleAfterHours: summary.staleAfterHours,
      recentlyUpdated: summary.recentlyUpdated.map((item) => serializeWorkItem(item)),
      recentActivity: summary.recentActivity
    });
  })
);

export const activityRouter = Router();
activityRouter.use(requireAuth);
activityRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, pageSize } = pageQuerySchema.parse(req.query);
    const result = await listActivity(req.authUser!, page, pageSize);
    res.json(result);
  })
);
