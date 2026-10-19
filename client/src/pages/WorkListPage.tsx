import { useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { api } from "../lib/api";
import { Button, EmptyState, Input, PriorityBadge, Select, Spinner, StatusBadge } from "../components/ui";
import { TYPE_LABEL } from "../lib/cn";
import type { WorkItem } from "../types";
import { useAuth } from "../lib/auth";

type ListResponse = {
  items: WorkItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function WorkListPage({ preset }: { preset?: "mine" | "queues" }) {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const queryString = useMemo(() => {
    const p = new URLSearchParams(params);
    if (preset === "mine") p.set("mine", "true");
    if (params.get("active") === "1") {
      p.delete("active");
      ["OPEN", "IN_PROGRESS", "BLOCKED", "IN_REVIEW", "AWAITING_APPROVAL"].forEach((s) => p.append("status", s));
    }
    return p.toString();
  }, [params, preset]);

  const q = useQuery({
    queryKey: ["work-items", queryString, preset],
    queryFn: () => api.get<ListResponse>(`/api/work-items?${queryString}`)
  });

  function set(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (!value) next.delete(key);
    else next.set(key, value);
    next.set("page", "1");
    setParams(next);
  }

  const title = preset === "mine" ? "My work" : preset === "queues" ? "Team queues" : "All work items";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-ink-500">{q.data ? `${q.data.total} matching items` : "Loading…"}</p>
        </div>
        <Button onClick={() => navigate("/work/new")}>New work item</Button>
      </div>
      <div className="grid gap-2 rounded-lg border border-ink-200 bg-white p-3 md:grid-cols-6">
        <Input
          placeholder="Search"
          defaultValue={params.get("q") ?? ""}
          onBlur={(e) => set("q", e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") set("q", (e.target as HTMLInputElement).value);
          }}
        />
        <Select value={params.get("status") ?? ""} onChange={(e) => set("status", e.target.value)}>
          <option value="">Any status</option>
          {["OPEN", "IN_PROGRESS", "BLOCKED", "IN_REVIEW", "AWAITING_APPROVAL", "RESOLVED", "CLOSED"].map((s) => (
            <option key={s} value={s}>
              {s.replaceAll("_", " ")}
            </option>
          ))}
        </Select>
        <Select value={params.get("priority") ?? ""} onChange={(e) => set("priority", e.target.value)}>
          <option value="">Any priority</option>
          {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select value={params.get("type") ?? ""} onChange={(e) => set("type", e.target.value)}>
          <option value="">Any type</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select value={params.get("teamId") ?? ""} onChange={(e) => set("teamId", e.target.value)}>
          <option value="">Any team</option>
          {user?.memberships.map((m) => (
            <option key={m.teamId} value={m.teamId}>
              {m.teamName}
            </option>
          ))}
        </Select>
        <Select value={params.get("sort") ?? "updated_desc"} onChange={(e) => set("sort", e.target.value)}>
          <option value="updated_desc">Recently updated</option>
          <option value="updated_asc">Oldest updated</option>
          <option value="priority_desc">Highest priority</option>
          <option value="due_asc">Earliest due</option>
          <option value="created_desc">Newest created</option>
          <option value="created_asc">Oldest created</option>
        </Select>
      </div>
      {q.isLoading && <Spinner />}
      {q.data && q.data.items.length === 0 && (
        <EmptyState title="No matching work" body="Try clearing filters or create a new work item." />
      )}
      {q.data && q.data.items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-ink-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-3 py-2">Ref</th>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Priority</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {q.data.items.map((item) => (
                <tr key={item.id} className="border-b last:border-0 hover:bg-ink-50">
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link to={`/work/${item.id}`} className="text-accent hover:underline">
                      {item.reference}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Link to={`/work/${item.id}`} className="font-medium hover:underline">
                      {item.title}
                    </Link>
                    <div className="text-xs text-ink-500">{item.attention.label}</div>
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-3 py-2">
                    <PriorityBadge priority={item.priority} />
                  </td>
                  <td className="px-3 py-2 text-ink-600">{item.team.name}</td>
                  <td className="px-3 py-2 text-ink-600">{item.assignee?.name ?? "Unassigned"}</td>
                  <td className="px-3 py-2 text-xs text-ink-500">
                    {formatDistanceToNow(new Date(item.updatedAt), { addSuffix: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-3 py-2 text-sm">
            <span>
              Page {q.data.page} of {q.data.totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={q.data.page <= 1}
                onClick={() => set("page", String(q.data!.page - 1))}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                disabled={q.data.page >= q.data.totalPages}
                onClick={() => set("page", String(q.data!.page + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
