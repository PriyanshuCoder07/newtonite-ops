import type { PlatformRole, TeamRole, User } from "@prisma/client";

export function publicUser(user: Pick<User, "id" | "email" | "name" | "platformRole" | "isActive">) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    platformRole: user.platformRole,
    isActive: user.isActive
  };
}

export type MembershipInfo = {
  teamId: string;
  teamName: string;
  teamSlug: string;
  role: TeamRole;
};

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  platformRole: PlatformRole;
  isActive: boolean;
  memberships: MembershipInfo[];
};
