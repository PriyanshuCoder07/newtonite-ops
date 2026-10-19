import {
  Prisma,
  type Approval,
  type WorkItemStatus
} from "@prisma/client";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError
} from "../lib/errors";
import type { AuthUser } from "../lib/publicUser";
import {
  assertCan,
  assertTeamAccess,
  canAssign,
  canCloseOrReopen,
  canCreateWorkItem,
  canEditMetadata,
  canTransitionStatus,
  visibleTeamIds
} from "../domain/permissions";
import {
  canTransition,
  priorityRank,
  requiresApproval
} from "../domain/workflow";
import { serializeWorkItem } from "../lib/serialize";

const include = {
  creator: true,
  assignee: true,
  team: true
} as const;

async function nextReference(tx: Prisma.TransactionClient) {
  const row = await tx.counter.update({
    where: { name: "workItem" },
    data: { value: { increment: 1 } }
  });
  return `OPS-${row.value}`;
}

async function assertEligibleAssignee(teamId: string, assigneeId: string | null | undefined) {
  if (!assigneeId) return;
  const membership = await prisma.teamMembership.findUnique({
    where: { userId_teamId: { userId: assigneeId, teamId } },
    include: { user: true }
  });
  if (!membership || !membership.user.isActive) {
    throw new ValidationError("Assignee must be an active member of the owning team");
  }
  if (membership.role === "VIEWER") {
    throw new ValidationError("Viewers cannot be assigned work items");
  }
}

function scopedWhere(user: AuthUser, extra: Prisma.WorkItemWhereInput = {}): Prisma.WorkItemWhereInput {
  const teams = visibleTeamIds(user);
  if (teams === null) return extra;
  return { AND: [{ teamId: { in: teams } }, extra] };
}

async function loadVisible(user: AuthUser, id: string) {
  const item = await prisma.workItem.findUnique({ where: { id }, include });
  if (!item) throw new NotFoundError("Resource not found");
  assertTeamAccess(user, item.teamId);
  return item;
}

/**
 * Optimistic concurrency: the version check and the write are a single conditional UPDATE
 * (`WHERE id = ? AND version = ?`), so there is no read-then-write window. If zero rows
 * match, someone else changed the item first and the caller gets a 409.
 */
export async function mutateByVersion(
  tx: Prisma.TransactionClient,
  id: string,
  version: number,
  data: Prisma.WorkItemUncheckedUpdateManyInput
) {
  const result = await tx.workItem.updateMany({
    where: { id, version },
    data: { ...data, version: { increment: 1 } }
  });
  if (result.count === 0) {
    const current = await tx.workItem.findUnique({ where: { id } });
    throw new ConflictError(
      "This work item was updated by someone else. Refresh and try again.",
      current
        ? { currentVersion: current.version, status: current.status, updatedAt: current.updatedAt }
        : undefined
    );
  }
}

async function pendingApproval(workItemId: string) {
  return prisma.approval.findFirst({
    where: { workItemId, status: "PENDING" }
  });
}

export async function createWorkItem(
  user: AuthUser,
  input: {
    title: string;
    description: string;
    type: Prisma.WorkItemCreateInput["type"];
    priority: Prisma.WorkItemCreateInput["priority"];
    teamId: string;
    assigneeId?: string | null;
    dueAt?: string | null;
  }
) {
  assertCan(canCreateWorkItem(user, input.teamId), "You cannot create work for this team");
  const team = await prisma.team.findUnique({ where: { id: input.teamId } });
  if (!team) throw new NotFoundError("Resource not found");
  if (!team.isActive) throw new ValidationError("This team is inactive and cannot receive new work");
  await assertEligibleAssignee(input.teamId, input.assigneeId);

  const item = await prisma.$transaction(async (tx) => {
    const reference = await nextReference(tx);
    const created = await tx.workItem.create({
      data: {
        reference,
        title: input.title,
        description: input.description,
        type: input.type,
        priority: input.priority,
        priorityRank: priorityRank(input.priority as never),
        teamId: input.teamId,
        creatorId: user.id,
        assigneeId: input.assigneeId ?? null,
        dueAt: input.dueAt ? new Date(input.dueAt) : null
      },
      include
    });
    await tx.activityEvent.create({
      data: {
        workItemId: created.id,
        actorId: user.id,
        type: "CREATED",
        summary: `Created ${created.reference}: ${created.title}`
      }
    });
    if (created.assigneeId && created.assigneeId !== user.id) {
      await tx.notification.create({
        data: {
          userId: created.assigneeId,
          workItemId: created.id,
          type: "ASSIGNED",
          title: `${created.reference} assigned to you`,
          body: created.title
        }
      });
    }
    return created;
  });
  return serializeWorkItem(item);
}

export async function getWorkItem(user: AuthUser, id: string) {
  const item = await loadVisible(user, id);
  const pending = await pendingApproval(id);
  return serializeWorkItem(item, { pendingApproval: pending });
}

export async function listWorkItems(
  user: AuthUser,
  query: {
    q?: string;
    status?: string | string[];
    priority?: string | string[];
    type?: string | string[];
    teamId?: string;
    assigneeId?: string;
    creatorId?: string;
    unassigned?: string;
    overdue?: string;
    stale?: string;
    mine?: string;
    dueBefore?: string;
    dueAfter?: string;
    updatedBefore?: string;
    updatedAfter?: string;
    createdBefore?: string;
    createdAfter?: string;
    sort?: string;
    page: number;
    pageSize: number;
  }
) {
  const now = new Date();
  const staleCutoff = new Date(now.getTime() - env.staleAfterHours * 60 * 60 * 1000);
  const asArray = (v?: string | string[]) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]);

  const filters: Prisma.WorkItemWhereInput[] = [];
  if (query.q) {
    filters.push({
      OR: [
        { title: { contains: query.q } },
        { description: { contains: query.q } },
        { reference: { contains: query.q } }
      ]
    });
  }
  const statuses = asArray(query.status);
  if (statuses) filters.push({ status: { in: statuses as WorkItemStatus[] } });
  const priorities = asArray(query.priority);
  if (priorities) filters.push({ priority: { in: priorities as never } });
  const types = asArray(query.type);
  if (types) filters.push({ type: { in: types as never } });
  if (query.teamId) {
    assertTeamAccess(user, query.teamId);
    filters.push({ teamId: query.teamId });
  }
  if (query.assigneeId) filters.push({ assigneeId: query.assigneeId });
  if (query.creatorId) filters.push({ creatorId: query.creatorId });
  if (query.unassigned === "true") filters.push({ assigneeId: null });
  if (query.mine === "true") filters.push({ assigneeId: user.id });
  if (query.overdue === "true") {
    filters.push({ dueAt: { lt: now }, status: { notIn: ["RESOLVED", "CLOSED"] } });
  }
  if (query.stale === "true") {
    filters.push({ updatedAt: { lt: staleCutoff }, status: { notIn: ["RESOLVED", "CLOSED"] } });
  }
  if (query.dueBefore) filters.push({ dueAt: { lte: new Date(query.dueBefore) } });
  if (query.dueAfter) filters.push({ dueAt: { gte: new Date(query.dueAfter) } });
  if (query.updatedBefore) filters.push({ updatedAt: { lte: new Date(query.updatedBefore) } });
  if (query.updatedAfter) filters.push({ updatedAt: { gte: new Date(query.updatedAfter) } });
  if (query.createdBefore) filters.push({ createdAt: { lte: new Date(query.createdBefore) } });
  if (query.createdAfter) filters.push({ createdAt: { gte: new Date(query.createdAfter) } });

  const where = scopedWhere(user, filters.length ? { AND: filters } : {});

  const orderBy: Prisma.WorkItemOrderByWithRelationInput[] = [];
  switch (query.sort) {
    case "updated_asc":
      orderBy.push({ updatedAt: "asc" });
      break;
    case "due_asc":
      // Earliest due date first; items without a due date go last.
      orderBy.push({ dueAt: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" });
      break;
    case "created_desc":
      orderBy.push({ createdAt: "desc" });
      break;
    case "created_asc":
      orderBy.push({ createdAt: "asc" });
      break;
    case "priority_desc":
      // Highest priority first, then most recently updated (ordered by the database, so
      // the ordering is correct across pages).
      orderBy.push({ priorityRank: "desc" }, { updatedAt: "desc" });
      break;
    default:
      orderBy.push({ updatedAt: "desc" });
  }
  orderBy.push({ id: "desc" }); // deterministic tiebreaker so pages never overlap or skip rows

  const [total, rows] = await Promise.all([
    prisma.workItem.count({ where }),
    prisma.workItem.findMany({
      where,
      include,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize
    })
  ]);

  const items = rows.map((r) => serializeWorkItem(r));

  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize))
  };
}

export async function updateWorkItem(
  user: AuthUser,
  id: string,
  input: {
    version: number;
    title?: string;
    description?: string;
    priority?: Prisma.WorkItemUpdateInput["priority"];
    dueAt?: string | null;
  }
) {
  const current = await loadVisible(user, id);
  assertCan(canEditMetadata(user, current.teamId, current.assigneeId), "You cannot edit this work item");

  const events: Prisma.ActivityEventUncheckedCreateWithoutWorkItemInput[] = [];
  const data: Prisma.WorkItemUncheckedUpdateManyInput = {};
  if (input.title && input.title !== current.title) {
    data.title = input.title;
    events.push({
      actorId: user.id,
      type: "UPDATED",
      field: "title",
      previousValue: current.title,
      newValue: input.title,
      summary: `Updated title`
    });
  }
  if (input.description && input.description !== current.description) {
    data.description = input.description;
    events.push({
      actorId: user.id,
      type: "UPDATED",
      field: "description",
      previousValue: current.description.slice(0, 80),
      newValue: input.description.slice(0, 80),
      summary: `Updated description`
    });
  }
  if (input.priority && input.priority !== current.priority) {
    data.priority = input.priority;
    data.priorityRank = priorityRank(input.priority as never);
    events.push({
      actorId: user.id,
      type: "PRIORITY_CHANGED",
      field: "priority",
      previousValue: current.priority,
      newValue: String(input.priority),
      summary: `Changed priority from ${current.priority} to ${input.priority}`
    });
  }
  const nextDue = input.dueAt === undefined ? undefined : input.dueAt ? new Date(input.dueAt) : null;
  if (nextDue !== undefined && (nextDue?.getTime() ?? null) !== (current.dueAt?.getTime() ?? null)) {
    data.dueAt = nextDue;
    events.push({
      actorId: user.id,
      type: "UPDATED",
      field: "dueAt",
      previousValue: current.dueAt?.toISOString() ?? null,
      newValue: nextDue?.toISOString() ?? null,
      summary: nextDue ? `Set due date` : `Cleared due date`
    });
  }

  if (Object.keys(data).length === 0) {
    return serializeWorkItem(current, { pendingApproval: await pendingApproval(id) });
  }

  const updated = await prisma.$transaction(async (tx) => {
    await mutateByVersion(tx, id, input.version, data);
    for (const event of events) {
      await tx.activityEvent.create({ data: { ...event, workItemId: id } });
    }
    return tx.workItem.findUniqueOrThrow({ where: { id }, include });
  });
  return serializeWorkItem(updated, { pendingApproval: await pendingApproval(id) });
}

export async function assignWorkItem(
  user: AuthUser,
  id: string,
  input: { version: number; assigneeId: string | null }
) {
  const current = await loadVisible(user, id);
  assertCan(canAssign(user, current.teamId), "Only team managers can assign work");
  await assertEligibleAssignee(current.teamId, input.assigneeId);

  if (current.assigneeId === input.assigneeId) {
    return serializeWorkItem(current, { pendingApproval: await pendingApproval(id) });
  }

  const updated = await prisma.$transaction(async (tx) => {
    await mutateByVersion(tx, id, input.version, { assigneeId: input.assigneeId });
    await tx.activityEvent.create({
      data: {
        workItemId: id,
        actorId: user.id,
        type: "ASSIGNED",
        field: "assigneeId",
        previousValue: current.assigneeId,
        newValue: input.assigneeId,
        summary: input.assigneeId ? `Reassigned work item` : `Unassigned work item`
      }
    });
    if (input.assigneeId && input.assigneeId !== user.id) {
      await tx.notification.create({
        data: {
          userId: input.assigneeId,
          workItemId: id,
          type: current.assigneeId ? "REASSIGNED" : "ASSIGNED",
          title: `${current.reference} assigned to you`,
          body: current.title
        }
      });
    }
    return tx.workItem.findUniqueOrThrow({ where: { id }, include });
  });
  return serializeWorkItem(updated);
}

export async function transitionWorkItem(
  user: AuthUser,
  id: string,
  input: { version: number; toStatus: WorkItemStatus; comment?: string }
) {
  const current = await loadVisible(user, id);
  if (!canTransition(current.status, input.toStatus)) {
    throw new ValidationError(
      `Cannot transition from ${current.status} to ${input.toStatus}`,
      { from: current.status, to: input.toStatus }
    );
  }

  if (input.toStatus === "AWAITING_APPROVAL") {
    throw new ValidationError("Request an approval instead of transitioning directly to AWAITING_APPROVAL");
  }

  const closing = input.toStatus === "CLOSED";
  const reopening = current.status === "RESOLVED" || current.status === "CLOSED";
  if (closing || (reopening && input.toStatus === "IN_PROGRESS" && current.status !== "OPEN")) {
    if (current.status === "RESOLVED" && input.toStatus === "IN_PROGRESS") {
      assertCan(canCloseOrReopen(user, current.teamId), "Only managers can reopen work");
    } else if (current.status === "CLOSED") {
      assertCan(canCloseOrReopen(user, current.teamId), "Only managers can reopen closed work");
    } else if (closing) {
      assertCan(canCloseOrReopen(user, current.teamId), "Only managers can close work");
    }
  } else {
    assertCan(
      canTransitionStatus(user, current.teamId, current.assigneeId, input.toStatus),
      "You cannot perform this workflow action"
    );
  }

  if (input.toStatus === "RESOLVED") {
    if (requiresApproval(current.type)) {
      const latest = await prisma.approval.findFirst({
        where: { workItemId: id },
        orderBy: { requestedAt: "desc" }
      });
      if (latest?.status !== "APPROVED") {
        throw new ForbiddenError("This work type requires an approved request before it can be resolved");
      }
    }
  }

  if (current.status === "AWAITING_APPROVAL") {
    throw new ForbiddenError("Items awaiting approval can only change through an approval decision");
  }

  const activityType =
    input.toStatus === "RESOLVED"
      ? "RESOLVED"
      : input.toStatus === "CLOSED"
        ? "CLOSED"
        : current.status === "RESOLVED" || current.status === "CLOSED"
          ? "REOPENED"
          : "STATUS_CHANGED";

  const extra: Prisma.WorkItemUncheckedUpdateManyInput = {
    status: input.toStatus,
    resolvedAt: input.toStatus === "RESOLVED" ? new Date() : current.status === "RESOLVED" ? null : current.resolvedAt,
    closedAt: input.toStatus === "CLOSED" ? new Date() : input.toStatus === "IN_PROGRESS" ? null : current.closedAt
  };

  const updated = await prisma.$transaction(async (tx) => {
    await mutateByVersion(tx, id, input.version, extra);
    await tx.activityEvent.create({
      data: {
        workItemId: id,
        actorId: user.id,
        type: activityType,
        field: "status",
        previousValue: current.status,
        newValue: input.toStatus,
        summary: input.comment
          ? `Status ${current.status} → ${input.toStatus}: ${input.comment}`
          : `Status ${current.status} → ${input.toStatus}`
      }
    });
    if (input.toStatus === "BLOCKED" && current.priority === "CRITICAL" && current.assigneeId) {
      await tx.notification.create({
        data: {
          userId: current.assigneeId,
          workItemId: id,
          type: "CRITICAL_BLOCKED",
          title: `${current.reference} is blocked`,
          body: "A critical item is blocked and needs attention."
        }
      });
    }
    return tx.workItem.findUniqueOrThrow({ where: { id }, include });
  });
  return serializeWorkItem(updated);
}

export { loadVisible, include as workItemInclude, pendingApproval };
export type { Approval };
