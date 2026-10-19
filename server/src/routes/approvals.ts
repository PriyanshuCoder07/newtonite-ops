import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { decideApproval, listApprovals } from "../services/approvalService";
import { approvalDecisionSchema, approvalListQuerySchema } from "../validators/workItems";

export const approvalsRouter = Router();
approvalsRouter.use(requireAuth);

approvalsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { status } = approvalListQuerySchema.parse(req.query);
    const approvals = await listApprovals(req.authUser!, status);
    res.json({ approvals });
  })
);

approvalsRouter.post(
  "/:id/decision",
  asyncHandler(async (req, res) => {
    const body = approvalDecisionSchema.parse(req.body);
    const item = await decideApproval(req.authUser!, req.params.id, body);
    res.json({ item });
  })
);
