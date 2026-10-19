import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { api } from "../lib/api";
import { Button, Card, Spinner } from "../components/ui";
import type { Activity } from "../types";

export function ActivityPage() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") ?? 1);
  const q = useQuery({
    queryKey: ["global-activity", page],
    queryFn: () =>
      api.get<{ items: Activity[]; page: number; totalPages: number; total: number }>(
        `/api/activity?page=${page}&pageSize=30`
      )
  });
  if (q.isLoading) return <Spinner />;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Activity</h1>
        <p className="text-sm text-ink-500">{q.data?.total ?? 0} events in teams you can access.</p>
      </div>
      <Card className="divide-y">
        {q.data?.items.map((e) => (
          <div key={e.id} className="px-4 py-3 text-sm">
            <div>
              <span className="font-medium">{e.actor.name}</span> {e.summary}
            </div>
            <div className="text-xs text-ink-500">
              {e.workItem ? (
                <Link to={`/work/${e.workItem.id}`} className="text-accent hover:underline">
                  {e.workItem.reference}
                </Link>
              ) : null}{" "}
              · {formatDistanceToNow(new Date(e.createdAt), { addSuffix: true })}
            </div>
          </div>
        ))}
      </Card>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) })}>
          Previous
        </Button>
        <Button
          variant="secondary"
          disabled={page >= (q.data?.totalPages ?? 1)}
          onClick={() => setParams({ page: String(page + 1) })}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
