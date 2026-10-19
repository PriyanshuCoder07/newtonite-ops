import { prisma } from "../lib/prisma";
import type { AuthUser } from "../lib/publicUser";
import { serializeNotification } from "../lib/serialize";
import { NotFoundError } from "../lib/errors";

export async function listNotifications(user: AuthUser) {
  const rows = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50
  });
  return rows.map(serializeNotification);
}

export async function markRead(user: AuthUser, id: string) {
  const n = await prisma.notification.findUnique({ where: { id } });
  if (!n || n.userId !== user.id) throw new NotFoundError("Resource not found");
  const updated = await prisma.notification.update({
    where: { id },
    data: { readAt: n.readAt ?? new Date() }
  });
  return serializeNotification(updated);
}

export async function unreadCount(user: AuthUser) {
  return prisma.notification.count({ where: { userId: user.id, readAt: null } });
}
