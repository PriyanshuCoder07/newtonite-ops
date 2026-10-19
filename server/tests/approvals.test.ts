import { beforeEach, describe, expect, it } from "vitest";
import { addMember, createItem, createTeam, createUser, login, resetDb } from "./helpers";

describe("approvals", () => {
  beforeEach(resetDb);

  async function pendingApproval() {
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
    const list = await m.get("/api/approvals?status=PENDING");
    return {
      memberClient: m,
      managerClient: await login("sam@n.local"),
      approvalId: list.body.approvals[0].id,
      itemId: created.body.item.id
    };
  }

  it("rejects a decision from the requester", async () => {
    const ctx = await pendingApproval();
    const res = await ctx.memberClient.post(`/api/approvals/${ctx.approvalId}/decision`).send({
      decision: "APPROVED"
    });
    expect(res.status).toBe(403);
  });

  it("accepts a manager decision and moves the item to In Review", async () => {
    const ctx = await pendingApproval();
    const res = await ctx.managerClient.post(`/api/approvals/${ctx.approvalId}/decision`).send({
      decision: "APPROVED",
      comment: "Looks good"
    });
    expect(res.status).toBe(200);
    expect(res.body.item.status).toBe("IN_REVIEW");
  });

  it("does not allow a second decision on the same approval", async () => {
    const ctx = await pendingApproval();
    const first = await ctx.managerClient.post(`/api/approvals/${ctx.approvalId}/decision`).send({
      decision: "APPROVED"
    });
    expect(first.status).toBe(200);
    const second = await ctx.managerClient.post(`/api/approvals/${ctx.approvalId}/decision`).send({
      decision: "REJECTED"
    });
    expect(second.status).toBe(409);
    const item = await ctx.managerClient.get(`/api/work-items/${ctx.itemId}`);
    expect(item.body.item.status).toBe("IN_REVIEW");
  });

  it("prevents a second pending approval via unique pendingKey", async () => {
    const ctx = await pendingApproval();
    const item = await ctx.memberClient.get(`/api/work-items/${ctx.itemId}`);
    const again = await ctx.memberClient.post(`/api/work-items/${ctx.itemId}/approvals`).send({
      version: item.body.item.version
    });
    expect(again.status).toBeGreaterThanOrEqual(400);
  });
});
