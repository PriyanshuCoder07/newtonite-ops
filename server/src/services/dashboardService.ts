import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import type { AuthUser } from "../lib/publicUser";
import { visibleTeamIds } from "../domain/permissions";
import { serializeActivity } from "../lib/serialize";
import type { Prisma } from "@prisma/client";

export async function getSummary(user: AuthUser) {
  const teams = visibleTeamIds(user);
  const scope: Prisma.WorkItemWhereInput = teams ? { teamId: { in: teams } } : {};
  const now = new Date();
  const staleCutoff = new Date(now.getTime() - env.staleAfterHours * 60 * 60 * 1000);
  const active: Prisma.WorkItemWhereInput = { ...scope, status: { notIn: ["RESOLVED", "CLOSED"] } };

  const [
    totalActive,
    mine,
    criticalHigh,
    blocked,
    awaitingApproval,
    overdue,
    unassigned,
    stale,
    recentlyUpdated,
    recentActivity
  ] = await Promise.all([
    prisma.workItem.count({ where: active }),
    prisma.workItem.count({ where: { ...active, assigneeId: user.id } }),
    prisma.workItem.count({ where: { ...active, priority: { in: ["CRITICAL", "HIGH"] } } }),
    prisma.workItem.count({ where: { ...scope, status: "BLOCKED" } }),
    prisma.workItem.count({ where: { ...scope, status: "AWAITING_APPROVAL" } }),
    prisma.workItem.count({
      where: { ...active, dueAt: { lt: now } }
    }),
    prisma.workItem.count({ where: { ...active, assigneeId: null } }),
    prisma.workItem.count({ where: { ...active, updatedAt: { lt: staleCutoff } } }),
    prisma.workItem.findMany({
      where: scope,
      include: { creator: true, assignee: true, team: true },
      orderBy: { updatedAt: "desc" },
      take: 8
    }),
    prisma.activityEvent.findMany({
      where: teams ? { workItem: { teamId: { in: teams } } } : undefined,
      include: { actor: true, workItem: { select: { id: true, reference: true, title: true } } },
      orderBy: { createdAt: "desc" },
      take: 15
    })
  ]);

  return {
    metrics: {
      totalActive,
      mine,
      criticalHigh,
      blocked,
      awaitingApproval,
      overdue,
      unassigned,
      stale
    },
    recentlyUpdated,
    recentActivity: recentActivity.map(serializeActivity),
    staleAfterHours: env.staleAfterHours
  };
}

export async function listActivity(user: AuthUser, page = 1, pageSize = 30) {
  const teams = visibleTeamIds(user);
  const where = teams ? { workItem: { teamId: { in: teams } } } : undefined;
  const [total, rows] = await Promise.all([
    prisma.activityEvent.count({ where }),
    prisma.activityEvent.findMany({
      where,
      include: { actor: true, workItem: { select: { id: true, reference: true, title: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ]);
  return {
    items: rows.map(serializeActivity),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}
