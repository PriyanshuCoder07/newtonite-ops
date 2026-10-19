import { beforeEach, describe, expect, it } from "vitest";
import { addMember, createItem, createTeam, createUser, login, resetDb } from "./helpers";

describe("audit history", () => {
  beforeEach(resetDb);

  it("records creation, assignment, and priority change in one consistent history", async () => {
    const team = await createTeam("CS", "cs");
    const maya = await createUser({ email: "maya@n.local", name: "Maya" });
    const jordan = await createUser({ email: "jordan@n.local", name: "Jordan" });
    await addMember(maya.id, team.id, "MANAGER");
    await addMember(jordan.id, team.id, "MEMBER");
    const a = await login("maya@n.local");
    const created = await createItem(a, { teamId: team.id });
    const assigned = await a.post(`/api/work-items/${created.body.item.id}/assign`).send({
      version: created.body.item.version,
      assigneeId: jordan.id
    });
    await a.patch(`/api/work-items/${created.body.item.id}`).send({
      version: assigned.body.item.version,
      priority: "CRITICAL"
    });
    const history = await a.get(`/api/work-items/${created.body.item.id}/activity`);
    const types = history.body.activity.map((e: { type: string }) => e.type);
    expect(types).toContain("CREATED");
    expect(types).toContain("ASSIGNED");
    expect(types).toContain("PRIORITY_CHANGED");
  });

  it("does not record a success event when a stale update fails", async () => {
    const team = await createTeam("CS", "cs");
    const maya = await createUser({ email: "maya@n.local", name: "Maya" });
    await addMember(maya.id, team.id, "MANAGER");
    const a = await login("maya@n.local");
    const created = await createItem(a, { teamId: team.id });
    const first = await a.patch(`/api/work-items/${created.body.item.id}`).send({
      version: created.body.item.version,
      title: "First successful title update here"
    });
    expect(first.status).toBe(200);
    const stale = await a.patch(`/api/work-items/${created.body.item.id}`).send({
      version: created.body.item.version,
      title: "This stale title must not appear"
    });
    expect(stale.status).toBe(409);
    const history = await a.get(`/api/work-items/${created.body.item.id}/activity`);
    const summaries = history.body.activity.map((e: { summary: string }) => e.summary).join(" ");
    expect(summaries).not.toContain("This stale title must not appear");
  });
});
