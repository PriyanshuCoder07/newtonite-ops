import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { listNotifications, markRead, unreadCount } from "../services/notificationService";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const [notifications, unread] = await Promise.all([
      listNotifications(req.authUser!),
      unreadCount(req.authUser!)
    ]);
    res.json({ notifications, unread });
  })
);

notificationsRouter.post(
  "/:id/read",
  asyncHandler(async (req, res) => {
    const notification = await markRead(req.authUser!, req.params.id);
    res.json({ notification });
  })
);
