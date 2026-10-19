import type { AuthUser, MembershipInfo } from "../lib/publicUser";
import { ForbiddenError, NotFoundError } from "../lib/errors";
import type { TeamRole, WorkItemStatus } from "@prisma/client";

export function isAdmin(user: AuthUser) {
  return user.platformRole === "ADMIN";
}

export function membershipFor(user: AuthUser, teamId: string): MembershipInfo | undefined {
  return user.memberships.find((m) => m.teamId === teamId);
}

export function visibleTeamIds(user: AuthUser) {
  if (isAdmin(user)) return null; // unrestricted
  return user.memberships.map((m) => m.teamId);
}

export function assertActive(user: AuthUser) {
  if (!user.isActive) throw new ForbiddenError("Account is inactive");
}

export function assertTeamAccess(user: AuthUser, teamId: string) {
  assertActive(user);
  if (isAdmin(user)) return { role: "MANAGER" as TeamRole, admin: true };
  const membership = membershipFor(user, teamId);
  if (!membership) {
    // Hide existence of other teams' resources.
    throw new NotFoundError("Resource not found");
  }
  return { role: membership.role, admin: false };
}

export function canCreateWorkItem(user: AuthUser, teamId: string) {
  const access = assertTeamAccess(user, teamId);
  if (access.admin) return true;
  return access.role === "MANAGER" || access.role === "MEMBER";
}

export function canComment(user: AuthUser, teamId: string) {
  const access = assertTeamAccess(user, teamId);
  if (access.admin) return true;
  return access.role === "MANAGER" || access.role === "MEMBER";
}

export function canAssign(user: AuthUser, teamId: string) {
  const access = assertTeamAccess(user, teamId);
  if (access.admin) return true;
  return access.role === "MANAGER";
}

export function canEditMetadata(user: AuthUser, teamId: string, assigneeId: string | null) {
  const access = assertTeamAccess(user, teamId);
  if (access.admin) return true;
  if (access.role === "MANAGER") return true;
  if (access.role === "MEMBER" && assigneeId === user.id) return true;
  return false;
}

export function canApprove(user: AuthUser, teamId: string, requestedById: string) {
  const access = assertTeamAccess(user, teamId);
  if (access.admin) return true;
  if (access.role !== "MANAGER") return false;
  if (requestedById === user.id) return false;
  return true;
}

export function canCloseOrReopen(user: AuthUser, teamId: string) {
  const access = assertTeamAccess(user, teamId);
  if (access.admin) return true;
  return access.role === "MANAGER";
}

export function canTransitionStatus(
  user: AuthUser,
  teamId: string,
  assigneeId: string | null,
  to: WorkItemStatus
) {
  const access = assertTeamAccess(user, teamId);
  if (access.admin) return true;
  if (access.role === "VIEWER") return false;
  if (to === "CLOSED") return access.role === "MANAGER";
  if (to === "AWAITING_APPROVAL") return access.role === "MANAGER" || assigneeId === user.id;
  if (access.role === "MANAGER") return true;
  if (access.role === "MEMBER") {
    return assigneeId === user.id || !assigneeId;
  }
  return false;
}

export function assertCan(condition: boolean, message?: string) {
  if (!condition) throw new ForbiddenError(message);
}
