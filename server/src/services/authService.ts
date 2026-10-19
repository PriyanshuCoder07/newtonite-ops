import type { Response } from "express";
import { prisma } from "../lib/prisma";
import { hashPassword, randomToken, sha256, verifyPassword } from "../lib/hash";
import { env } from "../config/env";
import { UnauthorizedError, ValidationError } from "../lib/errors";
import type { AuthUser } from "../lib/publicUser";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.isProd,
  path: "/",
  maxAge: env.sessionTtlHours * 60 * 60 * 1000
};

export function setSessionCookie(res: Response, token: string) {
  res.cookie(env.sessionCookieName, token, cookieOptions);
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(env.sessionCookieName, { path: "/", httpOnly: true, sameSite: "lax", secure: env.isProd });
}

export async function login(email: string, password: string, res: Response): Promise<AuthUser> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { memberships: { include: { team: true } } }
  });
  if (!user || !user.isActive) throw new UnauthorizedError("Invalid email or password");
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw new UnauthorizedError("Invalid email or password");

  const token = randomToken();
  const expiresAt = new Date(Date.now() + env.sessionTtlHours * 60 * 60 * 1000);
  await prisma.session.create({
    data: { userId: user.id, tokenHash: sha256(token), expiresAt }
  });
  setSessionCookie(res, token);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    platformRole: user.platformRole,
    isActive: user.isActive,
    memberships: user.memberships.map((m) => ({
      teamId: m.teamId,
      teamName: m.team.name,
      teamSlug: m.team.slug,
      role: m.role
    }))
  };
}

export async function logout(token: string | undefined, res: Response) {
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  }
  clearSessionCookie(res);
}

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
  platformRole?: "ADMIN" | "USER";
}) {
  if (input.password.length < 10) throw new ValidationError("Password must be at least 10 characters");
  return prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      name: input.name,
      passwordHash: await hashPassword(input.password),
      platformRole: input.platformRole ?? "USER"
    }
  });
}
