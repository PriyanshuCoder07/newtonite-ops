import { beforeEach, describe, expect, it } from "vitest";
import { addMember, createItem, createTeam, createUser, login, resetDb } from "./helpers";

describe("search and pagination", () => {
  beforeEach(resetDb);

  it("combines filters and paginates on the server", async () => {
    const team = await createTeam("CS", "cs");
    const other = await createTeam("Eng", "eng");
    const maya = await createUser({ email: "maya@n.local", name: "Maya" });
    const priya = await createUser({ email: "priya@n.local", name: "Priya" });
    await addMember(maya.id, team.id, "MANAGER");
    await addMember(priya.id, other.id, "MANAGER");
    const a = await login("maya@n.local");
    for (let i = 0; i < 5; i++) {
      await createItem(a, {
        teamId: team.id,
        title: `Billing issue ${i}`,
        description: "Customer billing investigation required for this account.",
        priority: i === 0 ? "CRITICAL" : "LOW"
      });
    }
    const b = await login("priya@n.local");
    await createItem(b, {
      teamId: other.id,
      title: "Billing issue secret",
      description: "Should not leak across teams even if the query matches."
    });

    const page1 = await a.get("/api/work-items").query({
      q: "Billing",
      priority: "CRITICAL",
      page: 1,
      pageSize: 2
    });
    expect(page1.status).toBe(200);
    expect(page1.body.items).toHaveLength(1);
    expect(page1.body.pageSize).toBe(2);
    expect(page1.body.items[0].title).toContain("Billing issue 0");
    expect(page1.body.items.every((i: { title: string }) => !i.title.includes("secret"))).toBe(true);

    const leaked = await a.get("/api/work-items").query({ teamId: other.id });
    expect(leaked.status).toBe(404);
  });

  it("rejects invalid query parameters", async () => {
    const team = await createTeam("CS", "cs");
    const maya = await createUser({ email: "maya@n.local", name: "Maya" });
    await addMember(maya.id, team.id, "MANAGER");
    const a = await login("maya@n.local");
    const res = await a.get("/api/work-items").query({ pageSize: 500 });
    expect(res.status).toBe(400);
  });
});
