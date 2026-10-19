import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { api } from "../lib/api";
import { Card, PriorityBadge, Spinner, StatusBadge } from "../components/ui";
import type { Activity, WorkItem } from "../types";

type Summary = {
  metrics: {
    totalActive: number;
    mine: number;
    criticalHigh: number;
    blocked: number;
    awaitingApproval: number;
    overdue: number;
    unassigned: number;
    stale: number;
  };
  recentlyUpdated: WorkItem[];
  recentActivity: Activity[];
};

const tiles: { key: keyof Summary["metrics"]; label: string; to: string }[] = [
  { key: "totalActive", label: "Active work", to: "/work?active=1" },
  { key: "mine", label: "Assigned to me", to: "/my-work" },
  { key: "criticalHigh", label: "Critical / high", to: "/work?priority=CRITICAL&priority=HIGH" },
  { key: "blocked", label: "Blocked", to: "/work?status=BLOCKED" },
  { key: "awaitingApproval", label: "Awaiting approval", to: "/approvals" },
  { key: "overdue", label: "Overdue", to: "/work?overdue=true" },
  { key: "unassigned", label: "Unassigned", to: "/work?unassigned=true" },
  { key: "stale", label: "Not updated recently", to: "/work?stale=true" }
];

export function OverviewPage() {
  const q = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<Summary>("/api/dashboard/summary")
  });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <p className="text-red-700">Could not load the dashboard.</p>;
  const data = q.data!;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-sm text-ink-500">What needs attention across the teams you can access.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.key} to={t.to}>
            <Card className="p-4 hover:border-accent">
              <div className="text-xs uppercase tracking-wide text-ink-500">{t.label}</div>
              <div className="mt-2 text-3xl font-semibold">{data.metrics[t.key]}</div>
            </Card>
          </Link>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">Recently updated</h2>
          <ul className="mt-3 divide-y">
            {data.recentlyUpdated.map((item) => (
              <li key={item.id} className="py-3">
                <Link to={`/work/${item.id}`} className="block hover:text-accent">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs text-ink-500">{item.reference}</span>
                    <StatusBadge status={item.status} />
                  </div>
                  <div className="mt-1 font-medium">{item.title}</div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-ink-500">
                    <PriorityBadge priority={item.priority} />
                    <span>{item.team.name}</span>
                    <span>{item.assignee?.name ?? "Unassigned"}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">Recent activity</h2>
          <ul className="mt-3 space-y-3">
            {data.recentActivity.map((e) => (
              <li key={e.id} className="text-sm">
                <div className="text-ink-800">
                  <span className="font-medium">{e.actor.name}</span> {e.summary}
                </div>
                <div className="text-xs text-ink-500">
                  {e.workItem?.reference} · {formatDistanceToNow(new Date(e.createdAt), { addSuffix: true })}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
