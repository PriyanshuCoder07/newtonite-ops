import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { sha256 } from "../lib/hash";
import { UnauthorizedError, ForbiddenError } from "../lib/errors";
import type { AuthUser } from "../lib/publicUser";

export async function loadSession(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[env.sessionCookieName] as string | undefined;
    if (!token) return next();
    const tokenHash = sha256(token);
    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            memberships: { include: { team: true } }
          }
        }
      }
    });
    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
      }
      return next();
    }
    const user = session.user;
    const authUser: AuthUser = {
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
    req.authUser = authUser;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.authUser) return next(new UnauthorizedError());
  if (!req.authUser.isActive) return next(new ForbiddenError("Account is inactive"));
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.authUser) return next(new UnauthorizedError());
  if (req.authUser.platformRole !== "ADMIN") return next(new ForbiddenError());
  next();
}
