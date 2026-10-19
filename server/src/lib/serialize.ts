import type {
  Approval,
  Comment,
  ActivityEvent,
  Team,
  User,
  WorkItem,
  Notification
} from "@prisma/client";
import { computeAttention } from "../domain/workflow";
import { env } from "../config/env";
import { publicUser } from "./publicUser";

type UserLite = Pick<User, "id" | "email" | "name" | "platformRole" | "isActive">;

export function serializeWorkItem(
  item: WorkItem & {
    creator: UserLite;
    assignee: UserLite | null;
    team: Pick<Team, "id" | "name" | "slug">;
  },
  extras?: { pendingApproval?: Approval | null }
) {
  const attention = computeAttention({
    status: item.status,
    assigneeId: item.assigneeId,
    dueAt: item.dueAt,
    updatedAt: item.updatedAt,
    staleAfterHours: env.staleAfterHours
  });
  return {
    id: item.id,
    reference: item.reference,
    title: item.title,
    description: item.description,
    type: item.type,
    status: item.status,
    priority: item.priority,
    version: item.version,
    dueAt: item.dueAt,
    resolvedAt: item.resolvedAt,
    closedAt: item.closedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    team: item.team,
    creator: publicUser(item.creator),
    assignee: item.assignee ? publicUser(item.assignee) : null,
    attention,
    pendingApproval: extras?.pendingApproval
      ? {
          id: extras.pendingApproval.id,
          status: extras.pendingApproval.status,
          requestedAt: extras.pendingApproval.requestedAt
        }
      : null
  };
}

export function serializeComment(
  comment: Comment & { author: UserLite }
) {
  return {
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt,
    author: publicUser(comment.author)
  };
}

export function serializeActivity(
  event: ActivityEvent & { actor: UserLite; workItem?: Pick<WorkItem, "id" | "reference" | "title"> }
) {
  return {
    id: event.id,
    type: event.type,
    field: event.field,
    previousValue: event.previousValue,
    newValue: event.newValue,
    summary: event.summary,
    createdAt: event.createdAt,
    actor: publicUser(event.actor),
    workItem: event.workItem
      ? { id: event.workItem.id, reference: event.workItem.reference, title: event.workItem.title }
      : undefined
  };
}

export function serializeNotification(n: Notification) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    workItemId: n.workItemId,
    readAt: n.readAt,
    createdAt: n.createdAt
  };
}
