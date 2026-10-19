import { prisma } from "../lib/prisma";
import { assertCan, canComment } from "../domain/permissions";
import type { AuthUser } from "../lib/publicUser";
import { serializeComment } from "../lib/serialize";
import { loadVisible } from "./workItemService";

export async function listComments(user: AuthUser, workItemId: string) {
  await loadVisible(user, workItemId);
  const rows = await prisma.comment.findMany({
    where: { workItemId },
    include: { author: true },
    orderBy: { createdAt: "asc" }
  });
  return rows.map(serializeComment);
}

export async function addComment(user: AuthUser, workItemId: string, body: string) {
  const item = await loadVisible(user, workItemId);
  assertCan(canComment(user, item.teamId), "You cannot comment on this work item");
  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.comment.create({
      data: { workItemId, authorId: user.id, body },
      include: { author: true }
    });
    await tx.activityEvent.create({
      data: {
        workItemId,
        actorId: user.id,
        type: "COMMENT_ADDED",
        summary: "Added a comment"
      }
    });
    return created;
  });
  return serializeComment(comment);
}
