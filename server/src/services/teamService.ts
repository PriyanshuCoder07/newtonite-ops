import { prisma } from "../lib/prisma";
import { NotFoundError, ValidationError } from "../lib/errors";
import type { AuthUser } from "../lib/publicUser";
import { publicUser } from "../lib/publicUser";
import { assertTeamAccess, isAdmin, visibleTeamIds } from "../domain/permissions";

export async function listTeams(user: AuthUser) {
  const ids = visibleTeamIds(user);
  const teams = await prisma.team.findMany({
    where: ids ? { id: { in: ids } } : undefined,
    include: {
      memberships: { include: { user: true } },
      _count: { select: { workItems: true } }
    },
    orderBy: { name: "asc" }
  });
  return teams.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    description: t.description,
    isActive: t.isActive,
    workItemCount: t._count.workItems,
    members: t.memberships.map((m) => ({
      id: m.id,
      role: m.role,
      user: publicUser(m.user)
    }))
  }));
}

export async function getTeam(user: AuthUser, id: string) {
  const teams = await listTeams(user);
  const team = teams.find((t) => t.id === id);
  if (!team) throw new NotFoundError("Resource not found");
  return team;
}

export async function createTeam(
  _user: AuthUser,
  input: { name: string; slug: string; description?: string }
) {
  if (!input.name.trim()) throw new ValidationError("Name is required");
  return prisma.team.create({
    data: {
      name: input.name.trim(),
      slug: input.slug.trim().toLowerCase(),
      description: input.description
    }
  });
}

export async function addMembership(teamId: string, userId: string, role: "MANAGER" | "MEMBER" | "VIEWER") {
  const [team, user] = await Promise.all([
    prisma.team.findUnique({ where: { id: teamId } }),
    prisma.user.findUnique({ where: { id: userId } })
  ]);
  if (!team) throw new NotFoundError("Team not found");
  if (!user) throw new ValidationError("User not found");
  return prisma.teamMembership.create({
    data: { teamId, userId, role }
  });
}

export async function listUsers(user: AuthUser) {
  if (!isAdmin(user)) {
    const teamIds = user.memberships.map((m) => m.teamId);
    const memberships = await prisma.teamMembership.findMany({
      where: { teamId: { in: teamIds } },
      include: { user: true }
    });
    const unique = new Map(memberships.map((m) => [m.user.id, m.user]));
    return [...unique.values()].filter((u) => u.isActive).map(publicUser);
  }
  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  return users.map(publicUser);
}

export async function listEligibleAssignees(user: AuthUser, teamId: string) {
  assertTeamAccess(user, teamId);
  const memberships = await prisma.teamMembership.findMany({
    where: { teamId, role: { in: ["MANAGER", "MEMBER"] }, user: { isActive: true } },
    include: { user: true }
  });
  return memberships.map((m) => ({ ...publicUser(m.user), teamRole: m.role }));
}
