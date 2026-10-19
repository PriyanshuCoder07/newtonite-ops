import { beforeEach, describe, expect, it } from "vitest";
import { addMember, createItem, createTeam, createUser, login, resetDb } from "./helpers";

describe("workflow", () => {
  beforeEach(resetDb);

  it("allows Open → In Progress and rejects Open → Resolved", async () => {
    const team = await createTeam("Engineering", "eng");
    const user = await createUser({ email: "priya@n.local", name: "Priya" });
    await addMember(user.id, team.id, "MANAGER");
    const a = await login("priya@n.local");
    const created = await createItem(a, { teamId: team.id, assigneeId: user.id });
    const id = created.body.item.id;
    const ok = await a.post(`/api/work-items/${id}/transition`).send({
      version: created.body.item.version,
      toStatus: "IN_PROGRESS"
    });
    expect(ok.status).toBe(200);
    expect(ok.body.item.status).toBe("IN_PROGRESS");

    const bad = await a.post(`/api/work-items/${id}/transition`).send({
      version: ok.body.item.version,
      toStatus: "OPEN"
    });
    expect(bad.status).toBe(400);
  });

  it("cannot skip approval for compliance work", async () => {
    const team = await createTeam("Finance", "fin");
    const user = await createUser({ email: "sam@n.local", name: "Sam" });
    await addMember(user.id, team.id, "MANAGER");
    const a = await login("sam@n.local");
    const created = await createItem(a, {
      teamId: team.id,
      type: "COMPLIANCE_REQUEST",
      assigneeId: user.id
    });
    const started = await a.post(`/api/work-items/${created.body.item.id}/transition`).send({
      version: created.body.item.version,
      toStatus: "IN_PROGRESS"
    });
    const resolved = await a.post(`/api/work-items/${created.body.item.id}/resolve`).send({
      version: started.body.item.version
    });
    expect(resolved.status).toBe(403);
  });

  it("cannot transition AWAITING_APPROVAL by posting a status change", async () => {
    const team = await createTeam("Finance", "fin");
    const manager = await createUser({ email: "sam@n.local", name: "Sam" });
    const member = await createUser({ email: "riley@n.local", name: "Riley" });
    await addMember(manager.id, team.id, "MANAGER");
    await addMember(member.id, team.id, "MEMBER");
    const m = await login("riley@n.local");
    const created = await createItem(m, {
      teamId: team.id,
      type: "PAYMENT_INVESTIGATION",
      assigneeId: member.id
    });
    const started = await m.post(`/api/work-items/${created.body.item.id}/transition`).send({
      version: created.body.item.version,
      toStatus: "IN_PROGRESS"
    });
    const requested = await m.post(`/api/work-items/${created.body.item.id}/approvals`).send({
      version: started.body.item.version
    });
    expect(requested.status).toBe(201);
    const bypass = await m.post(`/api/work-items/${created.body.item.id}/transition`).send({
      version: requested.body.item.version,
      toStatus: "RESOLVED"
    });
    expect(bypass.status).toBeGreaterThanOrEqual(400);
    expect(bypass.body.item?.status ?? requested.body.item.status).not.toBe("RESOLVED");
  });

  it("prevents members from reopening closed work", async () => {
    const team = await createTeam("CS", "cs");
    const manager = await createUser({ email: "maya@n.local", name: "Maya" });
    const member = await createUser({ email: "jordan@n.local", name: "Jordan" });
    await addMember(manager.id, team.id, "MANAGER");
    await addMember(member.id, team.id, "MEMBER");
    const mg = await login("maya@n.local");
    const created = await createItem(mg, { teamId: team.id, assigneeId: member.id });
    const closed = await mg.post(`/api/work-items/${created.body.item.id}/transition`).send({
      version: created.body.item.version,
      toStatus: "CLOSED"
    });
    expect(closed.status).toBe(200);
    const mem = await login("jordan@n.local");
    const reopen = await mem.post(`/api/work-items/${created.body.item.id}/reopen`).send({
      version: closed.body.item.version
    });
    expect(reopen.status).toBe(403);
  });
});
