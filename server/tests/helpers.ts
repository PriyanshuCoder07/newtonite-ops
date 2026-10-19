import request from "supertest";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/hash";
import { createApp } from "../src/app";
import type { TeamRole, WorkItemType, Priority } from "@prisma/client";

export const app = createApp();
export const agent = () => request.agent(app);

export async function resetDb() {
  await prisma.notification.deleteMany();
  await prisma.idempotencyKey.deleteMany();
  await prisma.session.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.activityEvent.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.workItem.deleteMany();
  await prisma.teamMembership.deleteMany();
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();
  await prisma.counter.deleteMany();
  await prisma.counter.create({ data: { name: "workItem", value: 1000 } });
}

export async function createUser(opts: {
  email: string;
  name: string;
  password?: string;
  platformRole?: "ADMIN" | "USER";
  isActive?: boolean;
}) {
  return prisma.user.create({
    data: {
      email: opts.email,
      name: opts.name,
      passwordHash: await hashPassword(opts.password ?? "Password123!"),
      platformRole: opts.platformRole ?? "USER",
      isActive: opts.isActive ?? true
    }
  });
}

export async function createTeam(name: string, slug: string) {
  return prisma.team.create({ data: { name, slug } });
}

export async function addMember(userId: string, teamId: string, role: TeamRole) {
  return prisma.teamMembership.create({ data: { userId, teamId, role } });
}

export async function login(email: string, password = "Password123!") {
  const a = agent();
  const res = await a.post("/api/auth/login").send({ email, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return a;
}

export async function createItem(
  actor: ReturnType<typeof agent>,
  data: {
    title?: string;
    description?: string;
    type?: WorkItemType;
    priority?: Priority;
    teamId: string;
    assigneeId?: string;
  }
) {
  const res = await actor.post("/api/work-items").send({
    title: data.title ?? "Investigate failed settlement batch",
    description: data.description ?? "Ops needs a tracked investigation of the failed settlement batch.",
    type: data.type ?? "OPERATIONAL_TASK",
    priority: data.priority ?? "MEDIUM",
    teamId: data.teamId,
    assigneeId: data.assigneeId
  });
  return res;
}
