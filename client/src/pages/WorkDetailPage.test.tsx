import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { WorkDetailPage } from "./WorkDetailPage";
import type { WorkItem } from "../types";

vi.mock("../lib/auth", () => ({
  useAuth: () => ({
    user: { id: "u1", name: "Maya", email: "m@n.local", platformRole: "USER", isActive: true, memberships: [] },
    isAdmin: false,
    canManageTeam: () => true
  })
}));

function makeItem(over: Partial<WorkItem> = {}): WorkItem {
  return {
    id: "w1",
    reference: "OPS-1001",
    title: "Investigate failed settlement batch",
    description: "Settlement batch 42 failed overnight and needs investigation.",
    type: "OPERATIONAL_TASK",
    status: "IN_PROGRESS",
    priority: "CRITICAL",
    version: 3,
    dueAt: null,
    resolvedAt: null,
    closedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    team: { id: "t1", name: "Payments", slug: "pay" },
    creator: { id: "u1", name: "Maya", email: "m@n.local", platformRole: "USER", isActive: true },
    assignee: null,
    attention: { kind: "none", label: "In progress" },
    pendingApproval: null,
    ...over
  } as WorkItem;
}

type Call = { url: string; method: string; body?: Record<string, unknown> };

function setup(handlers: { item: () => WorkItem; patch?: () => { status: number; body: unknown } }) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: init?.body ? JSON.parse(init.body as string) : undefined });
      const reply = (status: number, body: unknown) => ({
        ok: status < 300,
        status,
        text: async () => JSON.stringify(body)
      });
      if (method === "PATCH") {
        const r = handlers.patch?.() ?? { status: 200, body: { item: handlers.item() } };
        return reply(r.status, r.body);
      }
      if (url.includes("/comments")) return reply(200, { comments: [] });
      if (url.includes("/activity")) return reply(200, { activity: [], page: 1, pageSize: 20, total: 0, totalPages: 1 });
      if (url.includes("/assignees")) return reply(200, { assignees: [] });
      return reply(200, { item: handlers.item() });
    })
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/work/w1"]}>
        <Routes>
          <Route path="/work/:id" element={<WorkDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { calls, qc };
}

afterEach(() => vi.unstubAllGlobals());

describe("WorkDetailPage edit/concurrency behaviour", () => {
  let current: WorkItem;
  beforeEach(() => {
    current = makeItem();
  });

  it("sends only the changed field and the version the user started from (does not reset priority)", async () => {
    const { calls } = setup({ item: () => current });
    const title = await screen.findByDisplayValue("Investigate failed settlement batch");
    fireEvent.change(title, { target: { value: "Investigate failed settlement batch 42" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.body).toEqual({ version: 3, title: "Investigate failed settlement batch 42" });
    expect(patch.body).not.toHaveProperty("priority");
  });

  it("keeps Save disabled until something is edited", async () => {
    setup({ item: () => current });
    await screen.findByDisplayValue("Investigate failed settlement batch");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("shows the server's 409 and reloads the current server state into the form", async () => {
    const { qc } = setup({
      item: () => current,
      patch: () => ({
        status: 409,
        body: { error: { code: "conflict", message: "This work item was updated by someone else.", details: { currentVersion: 4 } } }
      })
    });
    const title = await screen.findByDisplayValue("Investigate failed settlement batch");
    fireEvent.change(title, { target: { value: "My stale edit" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText(/updated by someone else/i)).toBeInTheDocument();

    // Meanwhile the other user's change is what the server now holds.
    current = makeItem({ version: 4, title: "Title changed by a colleague" });
    fireEvent.click(screen.getByRole("button", { name: /discard my edits and load latest/i }));
    expect(await screen.findByDisplayValue("Title changed by a colleague")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("My stale edit")).not.toBeInTheDocument();
    expect(screen.queryByText(/updated by someone else/i)).not.toBeInTheDocument();
    void qc;
  });

  it("warns when the item changes under an in-progress edit and still submits the ORIGINAL version", async () => {
    const { calls, qc } = setup({
      item: () => current,
      patch: () => ({ status: 409, body: { error: { code: "conflict", message: "Updated elsewhere." } } })
    });
    const title = await screen.findByDisplayValue("Investigate failed settlement batch");
    fireEvent.change(title, { target: { value: "Edited while a colleague also edits" } });

    current = makeItem({ version: 4, priority: "HIGH" }); // background refresh brings a newer version
    await qc.invalidateQueries({ queryKey: ["work-item", "w1"] });
    expect(await screen.findByText(/someone else changed this item while you were editing/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    // Must be the base version (3), NOT the freshly polled 4, so the server can detect the conflict.
    expect(calls.find((c) => c.method === "PATCH")!.body!.version).toBe(3);
  });
});
