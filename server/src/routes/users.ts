import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { listUsers } from "../services/teamService";
import { createUser } from "../services/authService";
import { publicUser } from "../lib/publicUser";

export const usersRouter = Router();
usersRouter.use(requireAuth);

usersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const users = await listUsers(req.authUser!);
    res.json({ users });
  })
);

usersRouter.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        email: z.string().email(),
        name: z.string().min(2),
        password: z.string().min(10),
        platformRole: z.enum(["ADMIN", "USER"]).optional()
      })
      .parse(req.body);
    const user = await createUser(body);
    res.status(201).json({ user: publicUser(user) });
  })
);
