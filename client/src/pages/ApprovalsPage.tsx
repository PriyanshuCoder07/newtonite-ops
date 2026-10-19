import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Button, Card, EmptyState, ErrorBanner, Spinner, StatusBadge, Textarea } from "../components/ui";
import { useAuth } from "../lib/auth";
import { ApiError, type Approval } from "../types";
import { useState } from "react";

export function ApprovalsPage() {
  const { canManageTeam, user } = useAuth();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState<Record<string, string>>({});
  const q = useQuery({
    queryKey: ["approvals"],
    queryFn: () => api.get<{ approvals: Approval[] }>("/api/approvals?status=PENDING")
  });
  const decide = useMutation({
    mutationFn: (input: { id: string; decision: "APPROVED" | "REJECTED" }) =>
      api.post(`/api/approvals/${input.id}/decision`, {
        decision: input.decision,
        comment: comment[input.id]
      }),
    onSuccess: async () => {
      setError(null);
      await qc.invalidateQueries();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Decision failed")
  });

  if (q.isLoading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Approvals</h1>
        <p className="text-sm text-ink-500">Pending requests across teams you can access.</p>
      </div>
      {error && <ErrorBanner message={error} />}
      {(q.data?.approvals.length ?? 0) === 0 && (
        <EmptyState title="Nothing waiting" body="When a teammate requests approval, it will appear here." />
      )}
      <div className="space-y-3">
        {q.data?.approvals.map((a) => {
          const canDecide =
            canManageTeam(a.workItem.team.id) && a.requestedBy.id !== user?.id;
          return (
            <Card key={a.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link to={`/work/${a.workItem.id}`} className="font-medium hover:underline">
                  {a.workItem.reference} · {a.workItem.title}
                </Link>
                <StatusBadge status={a.workItem.status} />
              </div>
              <p className="mt-1 text-sm text-ink-600">
                Requested by {a.requestedBy.name}
                {a.requestComment ? ` — ${a.requestComment}` : ""}
              </p>
              {canDecide ? (
                <div className="mt-3 space-y-2">
                  <Textarea
                    rows={2}
                    placeholder="Decision comment (optional)"
                    value={comment[a.id] ?? ""}
                    onChange={(e) => setComment((c) => ({ ...c, [a.id]: e.target.value }))}
                  />
                  <div className="flex gap-2">
                    <Button onClick={() => decide.mutate({ id: a.id, decision: "APPROVED" })}>Approve</Button>
                    <Button variant="secondary" onClick={() => decide.mutate({ id: a.id, decision: "REJECTED" })}>
                      Reject
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-xs text-ink-500">You can view this request but cannot decide it.</p>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
