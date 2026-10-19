import { beforeEach, describe, expect, it } from "vitest";
import { addMember, createItem, createTeam, createUser, login, resetDb } from "./helpers";

describe("concurrency", () => {
  beforeEach(resetDb);

  it("rejects a stale update instead of overwriting newer data", async () => {
    const team = await createTeam("Engineering", "eng");
    const aUser = await createUser({ email: "priya@n.local", name: "Priya" });
    const bUser = await createUser({ email: "alex@n.local", name: "Alex" });
    // Two managers edit the same item. (A plain member who is not the assignee would be
    // rejected with 403 before the version check, which is a different behaviour.)
    await addMember(aUser.id, team.id, "MANAGER");
    await addMember(bUser.id, team.id, "MANAGER");
    const a = await login("priya@n.local");
    const created = await createItem(a, { teamId: team.id, assigneeId: aUser.id });
    const id = created.body.item.id;
    const version = created.body.item.version;

    const first = await a.patch(`/api/work-items/${id}`).send({
      version,
      title: "Updated by Priya"
    });
    expect(first.status).toBe(200);
    expect(first.body.item.version).toBe(version + 1);

    const b = await login("alex@n.local");
    const stale = await b.patch(`/api/work-items/${id}`).send({
      version,
      title: "Updated by Alex with stale version"
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("conflict");

    const current = await a.get(`/api/work-items/${id}`);
    expect(current.body.item.title).toBe("Updated by Priya");
  });

  it("makes competing assignments deterministic via version checks", async () => {
    const team = await createTeam("Engineering", "eng");
    const priya = await createUser({ email: "priya@n.local", name: "Priya" });
    const admin = await createUser({ email: "admin@n.local", name: "Admin", platformRole: "ADMIN" });
    const alex = await createUser({ email: "alex@n.local", name: "Alex" });
    await addMember(priya.id, team.id, "MANAGER");
    await addMember(alex.id, team.id, "MEMBER");
    const a = await login("priya@n.local");
    const created = await createItem(a, { teamId: team.id });
    const id = created.body.item.id;
    const version = created.body.item.version;

    const first = await a.post(`/api/work-items/${id}/assign`).send({
      version,
      assigneeId: alex.id
    });
    expect(first.status).toBe(200);

    const b = await login("admin@n.local");
    const second = await b.post(`/api/work-items/${id}/assign`).send({
      version,
      assigneeId: priya.id
    });
    expect(second.status).toBe(409);

    const current = await a.get(`/api/work-items/${id}`);
    expect(current.body.item.assignee.id).toBe(alex.id);
  });

  it("replays idempotent POSTs instead of creating duplicate work items", async () => {
    const team = await createTeam("CS", "cs");
    const user = await createUser({ email: "maya@n.local", name: "Maya" });
    await addMember(user.id, team.id, "MANAGER");
    const a = await login("maya@n.local");
    const payload = {
      title: "Idempotent create",
      description: "This request may be retried after a timeout.",
      type: "OPERATIONAL_TASK",
      priority: "LOW",
      teamId: team.id
    };
    const first = await a.post("/api/work-items").set("Idempotency-Key", "create-1").send(payload);
    const second = await a.post("/api/work-items").set("Idempotency-Key", "create-1").send(payload);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.item.id).toBe(first.body.item.id);
    expect(second.headers["idempotency-replayed"]).toBe("true");
  });
});
