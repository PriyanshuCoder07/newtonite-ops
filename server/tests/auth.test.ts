import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import { addMember, app, createTeam, createUser, login, resetDb, agent } from "./helpers";

describe("authentication", () => {
  beforeEach(resetDb);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects invalid credentials without revealing whether the email exists", async () => {
    await createUser({ email: "a@n.local", name: "A" });
    const res = await agent().post("/api/auth/login").send({ email: "a@n.local", password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthenticated");
  });

  it("creates a session cookie and returns the user without a password hash", async () => {
    await createUser({ email: "a@n.local", name: "Avery" });
    const res = await agent().post("/api/auth/login").send({ email: "a@n.local", password: "Password123!" });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("a@n.local");
    expect(res.body.user.passwordHash).toBeUndefined();
    expect((res.headers["set-cookie"] as unknown as string[]).join("")).toContain("newtonite_session");
  });

  it("blocks unauthenticated access to protected routes", async () => {
    const res = await agent().get("/api/work-items");
    expect(res.status).toBe(401);
  });

  it("blocks inactive users from logging in", async () => {
    await createUser({ email: "x@n.local", name: "X", isActive: false });
    const res = await agent().post("/api/auth/login").send({ email: "x@n.local", password: "Password123!" });
    expect(res.status).toBe(401);
  });

  it("logs out and invalidates the session", async () => {
    await createUser({ email: "a@n.local", name: "A" });
    const a = await login("a@n.local");
    await a.post("/api/auth/logout");
    const me = await a.get("/api/auth/me");
    expect(me.status).toBe(401);
  });
});
