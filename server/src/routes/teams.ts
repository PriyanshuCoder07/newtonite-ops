import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { addMembership, createTeam, getTeam, listEligibleAssignees, listTeams } from "../services/teamService";

export const teamsRouter = Router();
teamsRouter.use(requireAuth);

teamsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const teams = await listTeams(req.authUser!);
    res.json({ teams });
  })
);

teamsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const team = await getTeam(req.authUser!, req.params.id);
    res.json({ team });
  })
);

teamsRouter.get(
  "/:id/assignees",
  asyncHandler(async (req, res) => {
    const assignees = await listEligibleAssignees(req.authUser!, req.params.id);
    res.json({ assignees });
  })
);

teamsRouter.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(2),
        slug: z.string().min(2),
        description: z.string().optional()
      })
      .parse(req.body);
    const team = await createTeam(req.authUser!, body);
    res.status(201).json({ team });
  })
);

teamsRouter.post(
  "/:id/members",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        userId: z.string(),
        role: z.enum(["MANAGER", "MEMBER", "VIEWER"])
      })
      .parse(req.body);
    const membership = await addMembership(req.params.id, body.userId, body.role);
    res.status(201).json({ membership });
  })
);
