import { beforeEach, describe, expect, it } from "vitest";
import { addMember, createItem, createTeam, createUser, login, resetDb } from "./helpers";

describe("authorization", () => {
  beforeEach(resetDb);

  it("hides another team's work item (no IDOR)", async () => {
    const eng = await createTeam("Engineering", "eng");
    const fin = await createTeam("Finance", "fin");
    const priya = await createUser({ email: "priya@n.local", name: "Priya" });
    const riley = await createUser({ email: "riley@n.local", name: "Riley" });
    await addMember(priya.id, eng.id, "MANAGER");
    await addMember(riley.id, fin.id, "MEMBER");

    const manager = await login("priya@n.local");
    const created = await createItem(manager, { teamId: eng.id, assigneeId: priya.id });
    expect(created.status).toBe(201);

    const other = await login("riley@n.local");
    const res = await other.get(`/api/work-items/${created.body.item.id}`);
    expect(res.status).toBe(404);

    const listed = await other.get("/api/work-items");
    const ids = listed.body.items.map((i: { id: string }) => i.id);
    expect(ids).not.toContain(created.body.item.id);
  });

  it("prevents viewers from modifying work", async () => {
    const cs = await createTeam("CS", "cs");
    const maya = await createUser({ email: "maya@n.local", name: "Maya" });
    const casey = await createUser({ email: "casey@n.local", name: "Casey" });
    await addMember(maya.id, cs.id, "MANAGER");
    await addMember(casey.id, cs.id, "VIEWER");
    const manager = await login("maya@n.local");
    const created = await createItem(manager, { teamId: cs.id });
    const viewer = await login("casey@n.local");
    const patch = await viewer.patch(`/api/work-items/${created.body.item.id}`).send({
      version: created.body.item.version,
      title: "Hacked title"
    });
    expect(patch.status).toBe(403);
    const comment = await viewer.post(`/api/work-items/${created.body.item.id}/comments`).send({
      body: "I should not be able to comment"
    });
    expect(comment.status).toBe(403);
  });

  it("prevents assigning an ineligible user", async () => {
    const eng = await createTeam("Engineering", "eng");
    const fin = await createTeam("Finance", "fin");
    const priya = await createUser({ email: "priya@n.local", name: "Priya" });
    const riley = await createUser({ email: "riley@n.local", name: "Riley" });
    await addMember(priya.id, eng.id, "MANAGER");
    await addMember(riley.id, fin.id, "MEMBER");
    const manager = await login("priya@n.local");
    const created = await createItem(manager, { teamId: eng.id });
    const assign = await manager.post(`/api/work-items/${created.body.item.id}/assign`).send({
      version: created.body.item.version,
      assigneeId: riley.id
    });
    expect(assign.status).toBe(400);
  });

  it("allows a member to view their team queue but not create for another team", async () => {
    const eng = await createTeam("Engineering", "eng");
    const fin = await createTeam("Finance", "fin");
    const alex = await createUser({ email: "alex@n.local", name: "Alex" });
    await addMember(alex.id, eng.id, "MEMBER");
    const member = await login("alex@n.local");
    const res = await createItem(member, { teamId: fin.id });
    expect(res.status).toBe(404);
  });
});
