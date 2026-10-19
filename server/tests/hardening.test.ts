import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import { addMember, createItem, createTeam, createUser, login, resetDb } from "./helpers";

async function world() {
  const team = await createTeam("Payments", "pay");
  const other = await createTeam("Legal", "legal");
  const m1 = await createUser({ email: "m1@n.local", name: "Manager One" });
  const m2 = await createUser({ email: "m2@n.local", name: "Manager Two" });
  const dev = await createUser({ email: "dev@n.local", name: "Dev" });
  const dev2 = await createUser({ email: "dev2@n.local", name: "Dev Two" });
  const outsider = await createUser({ email: "out@n.local", name: "Outsider" });
  await addMember(m1.id, team.id, "MANAGER");
  await addMember(m2.id, team.id, "MANAGER");
  await addMember(dev.id, team.id, "MEMBER");
  await addMember(dev2.id, team.id, "MEMBER");
  await addMember(outsider.id, other.id, "MANAGER");
  return { team, other, m1, m2, dev, dev2, outsider };
}

describe("true concurrency (simultaneous requests)", () => {
  beforeEach(resetDb);

  it("lets exactly one of several simultaneous assignments win and records one audit event", async () => {
    const w = await world();
    const c1 = await login("m1@n.local");
    const c2 = await login("m2@n.local");
    const created = await createItem(c1, { teamId: w.team.id });
    const { id, version } = created.body.item;

    // Both managers loaded the item at the same version and click "assign" at the same instant.
    const results = await Promise.all([
      c1.post(`/api/work-items/${id}/assign`).send({ version, assigneeId: w.dev.id }),
      c2.post(`/api/work-items/${id}/assign`).send({ version, assigneeId: w.dev2.id }),
      c1.post(`/api/work-items/${id}/assign`).send({ version, assigneeId: w.m1.id }),
      c2.post(`/api/work-items/${id}/assign`).send({ version, assigneeId: w.m2.id })
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409, 409, 409]);

    const winner = results.find((r) => r.status === 200)!;
    const stored = await prisma.workItem.findUniqueOrThrow({ where: { id } });
    expect(stored.assigneeId).toBe(winner.body.item.assignee.id);
    expect(stored.version).toBe(version + 1); // incremented exactly once

    const events = await prisma.activityEvent.findMany({ where: { workItemId: id, type: "ASSIGNED" } });
    expect(events).toHaveLength(1);
    expect(events[0].newValue).toBe(stored.assigneeId);
  });

  it("accepts only one of two simultaneous, conflicting approval decisions", async () => {
    const w = await world();
    const dev = await login("dev@n.local");
    const created = await createItem(dev, {
      teamId: w.team.id,
      type: "PAYMENT_INVESTIGATION",
      assigneeId: w.dev.id
    });
    const id = created.body.item.id;
    const started = await dev.post(`/api/work-items/${id}/transition`).send({
      version: created.body.item.version,
      toStatus: "IN_PROGRESS"
    });
    const requested = await dev.post(`/api/work-items/${id}/approvals`).send({
      version: started.body.item.version
    });
    expect(requested.status).toBe(201);
    const approval = await prisma.approval.findFirstOrThrow({ where: { workItemId: id } });

    const c1 = await login("m1@n.local");
    const c2 = await login("m2@n.local");
    const [a, b] = await Promise.all([
      c1.post(`/api/approvals/${approval.id}/decision`).send({ decision: "APPROVED" }),
      c2.post(`/api/approvals/${approval.id}/decision`).send({ decision: "REJECTED" })
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);

    const winnerDecision = a.status === 200 ? "APPROVED" : "REJECTED";
    const stored = await prisma.approval.findUniqueOrThrow({ where: { id: approval.id } });
    expect(stored.status).toBe(winnerDecision);
    expect(stored.pendingKey).toBeNull();

    const item = await prisma.workItem.findUniqueOrThrow({ where: { id } });
    expect(item.status).toBe(winnerDecision === "APPROVED" ? "IN_REVIEW" : "IN_PROGRESS");
    const decided = await prisma.activityEvent.count({ where: { workItemId: id, type: "APPROVAL_DECIDED" } });
    expect(decided).toBe(1);
    const notes = await prisma.notification.count({ where: { workItemId: id, type: "APPROVAL_DECIDED" } });
    expect(notes).toBe(1);
  });
});

describe("approval duplicate decisions", () => {
  beforeEach(resetDb);

  it("returns 409 (not 400/200) when the same approval is decided twice, and writes one event", async () => {
    const w = await world();
    const dev = await login("dev@n.local");
    const created = await createItem(dev, { teamId: w.team.id, type: "COMPLIANCE_REQUEST", assigneeId: w.dev.id });
    const id = created.body.item.id;
    const s = await dev.post(`/api/work-items/${id}/transition`).send({ version: created.body.item.version, toStatus: "IN_PROGRESS" });
    await dev.post(`/api/work-items/${id}/approvals`).send({ version: s.body.item.version });
    const approval = await prisma.approval.findFirstOrThrow({ where: { workItemId: id } });
    const mgr = await login("m1@n.local");
    const first = await mgr.post(`/api/approvals/${approval.id}/decision`).send({ decision: "APPROVED" });
    const retry = await mgr.post(`/api/approvals/${approval.id}/decision`).send({ decision: "APPROVED" });
    expect(first.status).toBe(200);
    expect(retry.status).toBe(409);
    expect(retry.body.error.code).toBe("conflict");
    expect(await prisma.activityEvent.count({ where: { workItemId: id, type: "APPROVAL_DECIDED" } })).toBe(1);
  });
});

describe("search, sorting and pagination correctness", () => {
  beforeEach(resetDb);

  it("orders by priority across pages (database ordering, not per-page)", async () => {
    const w = await world();
    const mgr = await login("m1@n.local");
    const priorities = ["LOW", "CRITICAL", "MEDIUM", "HIGH", "LOW", "CRITICAL", "HIGH", "MEDIUM"] as const;
    for (const [i, p] of priorities.entries()) {
      const r = await createItem(mgr, { teamId: w.team.id, priority: p, title: `Item number ${i}` });
      expect(r.status).toBe(201);
    }
    const rank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 } as Record<string, number>;
    const seen: string[] = [];
    const order: number[] = [];
    for (let page = 1; page <= 4; page++) {
      const res = await mgr.get(`/api/work-items?sort=priority_desc&pageSize=2&page=${page}`);
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(8);
      expect(res.body.totalPages).toBe(4);
      for (const it of res.body.items) {
        seen.push(it.id);
        order.push(rank[it.priority]);
      }
    }
    expect(new Set(seen).size).toBe(8); // no duplicates or gaps between pages
    expect(order).toEqual([...order].sort((a, b) => b - a)); // globally non-increasing
    expect(order[0]).toBe(4);
    expect(order[order.length - 1]).toBe(1);
  });

  it("sorts by due date with items that have no due date last", async () => {
    const w = await world();
    const mgr = await login("m1@n.local");
    const mk = (title: string, dueAt?: string) =>
      mgr.post("/api/work-items").send({
        title,
        description: "A work item used to test due date ordering.",
        type: "OPERATIONAL_TASK",
        priority: "MEDIUM",
        teamId: w.team.id,
        dueAt
      });
    await mk("No due date item");
    await mk("Due later", "2030-02-01T00:00:00.000Z");
    await mk("Due sooner", "2030-01-01T00:00:00.000Z");
    const res = await mgr.get("/api/work-items?sort=due_asc");
    expect(res.body.items.map((i: { title: string }) => i.title)).toEqual([
      "Due sooner",
      "Due later",
      "No due date item"
    ]);
  });

  it("does not let a user reach another team's work by manipulating filters", async () => {
    const w = await world();
    const legal = await login("out@n.local");
    const secret = await createItem(legal, { teamId: w.other.id, title: "Confidential legal matter" });
    expect(secret.status).toBe(201);
    const mgr = await login("m1@n.local");

    const byTeam = await mgr.get(`/api/work-items?teamId=${w.other.id}`);
    expect(byTeam.status).toBe(404);
    const bySearch = await mgr.get("/api/work-items?q=Confidential");
    expect(bySearch.body.total).toBe(0);
    const byCreator = await mgr.get(`/api/work-items?creatorId=${w.outsider.id}`);
    expect(byCreator.body.total).toBe(0);
    const direct = await mgr.get(`/api/work-items/${secret.body.item.id}`);
    expect(direct.status).toBe(404);
    const hist = await mgr.get(`/api/work-items/${secret.body.item.id}/activity`);
    expect(hist.status).toBe(404);
  });

  it("rejects malformed paging parameters instead of failing with a 500", async () => {
    const w = await world();
    const mgr = await login("m1@n.local");
    await createItem(mgr, { teamId: w.team.id });
    expect((await mgr.get("/api/work-items?pageSize=1000")).status).toBe(400);
    expect((await mgr.get("/api/work-items?page=abc")).status).toBe(400);
    expect((await mgr.get("/api/activity?page=abc")).status).toBe(400);
    expect((await mgr.get("/api/approvals?status=NOPE")).status).toBe(400);
  });

  it("paginates the per-item activity feed with metadata", async () => {
    const w = await world();
    const mgr = await login("m1@n.local");
    const created = await createItem(mgr, { teamId: w.team.id });
    const id = created.body.item.id;
    for (let i = 0; i < 5; i++) {
      await mgr.post(`/api/work-items/${id}/comments`).send({ body: `Comment ${i}` });
    }
    const page1 = await mgr.get(`/api/work-items/${id}/activity?pageSize=4&page=1`);
    const page2 = await mgr.get(`/api/work-items/${id}/activity?pageSize=4&page=2`);
    expect(page1.body.total).toBe(6); // 1 created + 5 comments
    expect(page1.body.totalPages).toBe(2);
    expect(page1.body.activity).toHaveLength(4);
    expect(page2.body.activity).toHaveLength(2);
    const ids = [...page1.body.activity, ...page2.body.activity].map((e: { id: string }) => e.id);
    expect(new Set(ids).size).toBe(6);
  });
});

describe("audit trail integrity", () => {
  beforeEach(resetDb);

  it("does not bump the version or log an event for a no-op due-date PATCH", async () => {
    const w = await world();
    const mgr = await login("m1@n.local");
    const created = await createItem(mgr, { teamId: w.team.id });
    const id = created.body.item.id;
    const set = await mgr.patch(`/api/work-items/${id}`).send({ version: 1, dueAt: "2030-01-01T00:00:00.000Z" });
    expect(set.status).toBe(200);
    const before = await prisma.activityEvent.count({ where: { workItemId: id } });
    const again = await mgr.patch(`/api/work-items/${id}`).send({ version: set.body.item.version, dueAt: "2030-01-01T00:00:00.000Z" });
    expect(again.status).toBe(200);
    expect(again.body.item.version).toBe(set.body.item.version);
    expect(await prisma.activityEvent.count({ where: { workItemId: id } })).toBe(before);
  });

  it("creates no audit event for a rejected stale update", async () => {
    const w = await world();
    const mgr = await login("m1@n.local");
    const created = await createItem(mgr, { teamId: w.team.id });
    const id = created.body.item.id;
    await mgr.patch(`/api/work-items/${id}`).send({ version: 1, priority: "HIGH" });
    const before = await prisma.activityEvent.count({ where: { workItemId: id } });
    const stale = await mgr.patch(`/api/work-items/${id}`).send({ version: 1, priority: "CRITICAL" });
    expect(stale.status).toBe(409);
    expect(stale.body.error.details.currentVersion).toBe(2);
    expect(await prisma.activityEvent.count({ where: { workItemId: id } })).toBe(before);
    const stored = await prisma.workItem.findUniqueOrThrow({ where: { id } });
    expect(stored.priority).toBe("HIGH");
    expect(stored.priorityRank).toBe(3);
  });

  it("rolls the state change back when the audit write fails inside the transaction", async () => {
    const w = await world();
    const mgr = await login("m1@n.local");
    const created = await createItem(mgr, { teamId: w.team.id, title: "Original title" });
    const id = created.body.item.id;

    // Inject a real database failure: the audit INSERT for a title change aborts. The work
    // item UPDATE runs first in the same transaction, so this proves it is rolled back.
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER fail_audit_insert BEFORE INSERT ON "ActivityEvent" WHEN NEW."summary" = 'Updated title'
       BEGIN SELECT RAISE(ABORT, 'simulated audit failure'); END;`
    );
    try {
      const res = await mgr.patch(`/api/work-items/${id}`).send({ version: 1, title: "Should not persist" });
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe("internal_error");
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS fail_audit_insert`);
    }

    const stored = await prisma.workItem.findUniqueOrThrow({ where: { id } });
    expect(stored.title).toBe("Original title");
    expect(stored.version).toBe(1);
    expect(await prisma.activityEvent.count({ where: { workItemId: id, type: "UPDATED" } })).toBe(0);

    // The system keeps working afterwards and the same edit now succeeds.
    const retry = await mgr.patch(`/api/work-items/${id}`).send({ version: 1, title: "Now it persists" });
    expect(retry.status).toBe(200);
    expect(retry.body.item.version).toBe(2);
  });
});

describe("request validation and idempotency", () => {
  beforeEach(resetDb);

  it("validates resolve/reopen bodies (missing version is a 400, not a 500)", async () => {
    const w = await world();
    const mgr = await login("m1@n.local");
    const created = await createItem(mgr, { teamId: w.team.id });
    const res = await mgr.post(`/api/work-items/${created.body.item.id}/resolve`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
  });

  it("refuses to replay a stored response when an Idempotency-Key is reused for another request", async () => {
    const w = await world();
    const mgr = await login("m1@n.local");
    const payload = {
      title: "Keyed create",
      description: "Created with an idempotency key for testing.",
      type: "OPERATIONAL_TASK",
      priority: "LOW",
      teamId: w.team.id
    };
    const first = await mgr.post("/api/work-items").set("Idempotency-Key", "k-1").send(payload);
    expect(first.status).toBe(201);
    const created = await createItem(mgr, { teamId: w.team.id });
    const misuse = await mgr
      .post(`/api/work-items/${created.body.item.id}/comments`)
      .set("Idempotency-Key", "k-1")
      .send({ body: "different endpoint" });
    expect(misuse.status).toBe(422);
    expect(misuse.body.error.code).toBe("idempotency_key_reuse");
    expect(await prisma.comment.count()).toBe(0);
  });

  it("does not assign an item to a user from another team (cross-team assignee)", async () => {
    const w = await world();
    const mgr = await login("m1@n.local");
    const created = await createItem(mgr, { teamId: w.team.id });
    const res = await mgr.post(`/api/work-items/${created.body.item.id}/assign`).send({
      version: created.body.item.version,
      assigneeId: w.outsider.id
    });
    expect(res.status).toBe(400);
  });

  it("refuses new work for an inactive team", async () => {
    const w = await world();
    await prisma.team.update({ where: { id: w.team.id }, data: { isActive: false } });
    const mgr = await login("m1@n.local");
    const res = await createItem(mgr, { teamId: w.team.id });
    expect(res.status).toBe(400);
  });
});
