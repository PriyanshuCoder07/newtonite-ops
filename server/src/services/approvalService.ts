import { prisma } from "../lib/prisma";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError
} from "../lib/errors";
import type { AuthUser } from "../lib/publicUser";
import { assertCan, assertTeamAccess, canApprove, canTransitionStatus } from "../domain/permissions";
import { serializeWorkItem } from "../lib/serialize";
import { loadVisible, mutateByVersion, workItemInclude } from "./workItemService";
import { Prisma } from "@prisma/client";

export async function requestApproval(
  user: AuthUser,
  workItemId: string,
  input: { version: number; comment?: string }
) {
  const item = await loadVisible(user, workItemId);
  assertCan(
    canTransitionStatus(user, item.teamId, item.assigneeId, "AWAITING_APPROVAL"),
    "You cannot request approval for this item"
  );
  if (item.status !== "IN_PROGRESS" && item.status !== "IN_REVIEW") {
    throw new ValidationError("Approval can only be requested from In Progress or In Review");
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      await mutateByVersion(tx, workItemId, input.version, { status: "AWAITING_APPROVAL" });
      const approval = await tx.approval.create({
        data: {
          workItemId,
          requestedById: user.id,
          requestComment: input.comment,
          pendingKey: workItemId,
          status: "PENDING"
        }
      });
      await tx.activityEvent.create({
        data: {
          workItemId,
          actorId: user.id,
          type: "APPROVAL_REQUESTED",
          field: "status",
          previousValue: item.status,
          newValue: "AWAITING_APPROVAL",
          summary: input.comment
            ? `Requested approval: ${input.comment}`
            : "Requested approval"
        }
      });
      const managers = await tx.teamMembership.findMany({
        where: { teamId: item.teamId, role: "MANAGER", userId: { not: user.id } }
      });
      for (const manager of managers) {
        await tx.notification.create({
          data: {
            userId: manager.userId,
            workItemId,
            type: "APPROVAL_REQUESTED",
            title: `${item.reference} needs approval`,
            body: item.title
          }
        });
      }
      const updated = await tx.workItem.findUniqueOrThrow({
        where: { id: workItemId },
        include: workItemInclude
      });
      return { approval, updated };
    });
    return serializeWorkItem(result.updated, { pendingApproval: result.approval });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ConflictError("An approval is already pending for this work item");
    }
    throw err;
  }
}

export async function listApprovals(user: AuthUser, status?: string) {
  const teamIds = user.platformRole === "ADMIN" ? undefined : user.memberships.map((m) => m.teamId);
  const rows = await prisma.approval.findMany({
    where: {
      status: (status as "PENDING") ?? undefined,
      workItem: teamIds ? { teamId: { in: teamIds } } : undefined
    },
    include: {
      workItem: { include: workItemInclude },
      requestedBy: true,
      decidedBy: true
    },
    orderBy: { requestedAt: "desc" },
    take: 100
  });
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    requestComment: row.requestComment,
    decisionComment: row.decisionComment,
    requestedAt: row.requestedAt,
    decidedAt: row.decidedAt,
    requestedBy: {
      id: row.requestedBy.id,
      name: row.requestedBy.name,
      email: row.requestedBy.email
    },
    decidedBy: row.decidedBy
      ? { id: row.decidedBy.id, name: row.decidedBy.name, email: row.decidedBy.email }
      : null,
    workItem: serializeWorkItem(row.workItem)
  }));
}

export async function decideApproval(
  user: AuthUser,
  approvalId: string,
  input: { decision: "APPROVED" | "REJECTED"; comment?: string }
) {
  const approval = await prisma.approval.findUnique({
    where: { id: approvalId },
    include: { workItem: { include: workItemInclude } }
  });
  if (!approval) throw new NotFoundError("Resource not found");
  const item = approval.workItem;
  // Users outside the owning team get 404 (existence is not revealed); assertTeamAccess throws it.
  assertTeamAccess(user, item.teamId);

  assertCan(canApprove(user, item.teamId, approval.requestedById), "You are not an authorized approver");

  // Fast-path for repeated/duplicate decisions. This is only an optimisation for a clearer
  // message: the authoritative guard is the conditional UPDATE inside the transaction below.
  if (approval.status !== "PENDING") {
    throw new ConflictError(`This approval has already been decided (${approval.status.toLowerCase()})`, {
      status: approval.status,
      decidedAt: approval.decidedAt
    });
  }
  if (item.status !== "AWAITING_APPROVAL") {
    throw new ValidationError("This work item is not awaiting approval");
  }

  const nextStatus = input.decision === "APPROVED" ? "IN_REVIEW" : "IN_PROGRESS";

  const decided = await prisma.$transaction(async (tx) => {
    const claimed = await tx.approval.updateMany({
      where: { id: approvalId, status: "PENDING" },
      data: {
        status: input.decision,
        decidedById: user.id,
        decidedAt: new Date(),
        decisionComment: input.comment,
        pendingKey: null
      }
    });
    // Two approvers deciding at once: exactly one UPDATE matches `status = PENDING`; the
    // other sees count 0, rolls back, and receives a 409. No duplicate decision is possible.
    if (claimed.count === 0) {
      throw new ConflictError("This approval has already been decided");
    }
    await tx.workItem.update({
      where: { id: item.id },
      data: { status: nextStatus, version: { increment: 1 } }
    });
    await tx.activityEvent.create({
      data: {
        workItemId: item.id,
        actorId: user.id,
        type: "APPROVAL_DECIDED",
        field: "status",
        previousValue: "AWAITING_APPROVAL",
        newValue: nextStatus,
        summary: `${input.decision === "APPROVED" ? "Approved" : "Rejected"} approval${
          input.comment ? `: ${input.comment}` : ""
        }`
      }
    });
    await tx.notification.create({
      data: {
        userId: approval.requestedById,
        workItemId: item.id,
        type: "APPROVAL_DECIDED",
        title: `${item.reference} approval ${input.decision.toLowerCase()}`,
        body: item.title
      }
    });
    return tx.workItem.findUniqueOrThrow({ where: { id: item.id }, include: workItemInclude });
  });

  return serializeWorkItem(decided);
}
