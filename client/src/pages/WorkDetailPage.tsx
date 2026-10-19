import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { api } from "../lib/api";
import {
  Button,
  Card,
  ErrorBanner,
  Input,
  Label,
  Modal,
  PriorityBadge,
  Select,
  Spinner,
  StatusBadge,
  SuccessBanner,
  Textarea
} from "../components/ui";
import { STATUS_LABEL, TYPE_LABEL } from "../lib/cn";
import { useAuth } from "../lib/auth";
import { ApiError, type ActivityPage, type Comment, type User, type WorkItem } from "../types";

// How often an open item is re-fetched so changes made by other people appear without a reload.
const REFRESH_MS = 15_000;

type Draft = { title?: string; description?: string; priority?: WorkItem["priority"] };

const NEXT: Record<string, string[]> = {
  OPEN: ["IN_PROGRESS", "CLOSED"],
  IN_PROGRESS: ["BLOCKED", "IN_REVIEW", "RESOLVED"],
  BLOCKED: ["IN_PROGRESS"],
  IN_REVIEW: ["IN_PROGRESS", "RESOLVED"],
  AWAITING_APPROVAL: [],
  RESOLVED: ["CLOSED", "IN_PROGRESS"],
  CLOSED: ["IN_PROGRESS"]
};

export function WorkDetailPage() {
  const { id } = useParams();
  const { user, canManageTeam } = useAuth();
  const qc = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);

  const itemQ = useQuery({
    queryKey: ["work-item", id],
    queryFn: () => api.get<{ item: WorkItem }>(`/api/work-items/${id}`),
    refetchInterval: REFRESH_MS
  });
  const commentsQ = useQuery({
    queryKey: ["comments", id],
    queryFn: () => api.get<{ comments: Comment[] }>(`/api/work-items/${id}/comments`)
  });
  const activityQ = useInfiniteQuery({
    queryKey: ["activity", id],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.get<ActivityPage>(`/api/work-items/${id}/activity?page=${pageParam}&pageSize=20`),
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    refetchInterval: REFRESH_MS
  });
  const activity = activityQ.data?.pages.flatMap((p) => p.activity) ?? [];
  const activityTotal = activityQ.data?.pages[0]?.total ?? 0;
  const assigneesQ = useQuery({
    queryKey: ["item-assignees", id],
    queryFn: () => api.get<{ assignees: User[] }>(`/api/work-items/${id}/assignees`),
    enabled: Boolean(id)
  });

  const item = itemQ.data?.item;

  // Edit form state. `baseVersion` is the version the user STARTED editing from. It is what we send
  // on save, so if someone else changes the item meanwhile the server answers 409 instead of the
  // newer data being silently overwritten (a background refetch must not advance it).
  const [draft, setDraft] = useState<Draft>({});
  const [baseVersion, setBaseVersion] = useState<number | null>(null);
  const [formKey, setFormKey] = useState(0);
  const dirty = Object.keys(draft).length > 0;
  const outdated = Boolean(item && dirty && baseVersion !== null && item.version !== baseVersion);

  function edit(patch: Draft) {
    if (!dirty && item) setBaseVersion(item.version);
    setDraft((d) => ({ ...d, ...patch }));
  }

  function resetForm() {
    setDraft({});
    setBaseVersion(null);
    setFormKey((k) => k + 1); // remount inputs so they show the server's current values
  }

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ["work-item", id] });
    await qc.invalidateQueries({ queryKey: ["comments", id] });
    await qc.invalidateQueries({ queryKey: ["activity", id] });
    await qc.invalidateQueries({ queryKey: ["dashboard"] });
    await qc.invalidateQueries({ queryKey: ["work-items"] });
    await qc.invalidateQueries({ queryKey: ["approvals"] });
  };

  function onErr(err: unknown) {
    setMessage(null);
    if (err instanceof ApiError && err.status === 409) {
      setError(`${err.message} The item changed elsewhere — refresh to see the current state.`);
    } else if (err instanceof ApiError) {
      const fields = (err.details as { fieldErrors?: Record<string, string[]> } | undefined)?.fieldErrors;
      const detail = fields
        ? Object.entries(fields)
            .map(([k, v]) => `${k}: ${v.join(", ")}`)
            .join("; ")
        : "";
      setError(detail ? `${err.message} (${detail})` : err.message);
    } else {
      setError("Something went wrong. Please try again.");
    }
  }

  async function refreshAll() {
    setError(null);
    setMessage(null);
    resetForm();
    await invalidate();
  }

  const save = useMutation({
    mutationFn: () =>
      api.patch<{ item: WorkItem }>(`/api/work-items/${id}`, {
        version: baseVersion ?? item!.version,
        ...draft // only fields the user actually changed
      }),
    onSuccess: async () => {
      setMessage("Changes saved.");
      setError(null);
      resetForm();
      await invalidate();
    },
    onError: onErr
  });

  const assign = useMutation({
    mutationFn: (assigneeId: string | null) =>
      api.post<{ item: WorkItem }>(`/api/work-items/${id}/assign`, { version: item!.version, assigneeId }),
    onSuccess: async () => {
      setMessage("Assignment updated.");
      await invalidate();
    },
    onError: onErr
  });

  const transition = useMutation({
    mutationFn: (toStatus: string) =>
      api.post<{ item: WorkItem }>(`/api/work-items/${id}/transition`, { version: item!.version, toStatus }),
    onSuccess: async () => {
      setMessage("Workflow updated.");
      setConfirmClose(false);
      await invalidate();
    },
    onError: onErr
  });

  const requestApproval = useMutation({
    mutationFn: () =>
      api.post<{ item: WorkItem }>(`/api/work-items/${id}/approvals`, { version: item!.version }),
    onSuccess: async () => {
      setMessage("Approval requested.");
      await invalidate();
    },
    onError: onErr
  });

  const addComment = useMutation({
    mutationFn: () => api.post(`/api/work-items/${id}/comments`, { body: comment }),
    onSuccess: async () => {
      setComment("");
      await invalidate();
    },
    onError: onErr
  });

  if (itemQ.isLoading) return <Spinner />;
  if (itemQ.error) return <ErrorBanner message="This work item is not available." />;
  if (!item) return null;

  const next = NEXT[item.status] ?? [];
  // Inputs are uncontrolled, so they must be remounted to show new server values. While the user
  // is editing, the key is pinned to their base version so typing is never wiped by a refetch.
  const formVersion = baseVersion ?? item.version;

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs text-ink-500">
          <Link to="/work" className="hover:underline">
            Work items
          </Link>{" "}
          / {item.reference}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{item.title}</h1>
          <StatusBadge status={item.status} />
          <PriorityBadge priority={item.priority} />
        </div>
        <p className="mt-1 text-sm text-ink-500">{item.attention.label}</p>
      </div>
      {error && (
        <div className="space-y-2">
          <ErrorBanner message={error} />
          <Button variant="secondary" onClick={() => void refreshAll()}>
            {dirty ? "Discard my edits and load latest" : "Refresh current state"}
          </Button>
        </div>
      )}
      {outdated && !error && (
        <div className="space-y-2">
          <ErrorBanner message="Someone else changed this item while you were editing. Saving now will be rejected so their changes are not overwritten." />
          <Button variant="secondary" onClick={() => void refreshAll()}>
            Discard my edits and load latest
          </Button>
        </div>
      )}
      {message && <SuccessBanner message={message} />}
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Card className="space-y-3 p-5">
            <div>
              <Label>Title</Label>
              <Input
                key={`title-${formKey}-${formVersion}`}
                defaultValue={item.title}
                onChange={(e) => edit({ title: e.target.value })}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                key={`desc-${formKey}-${formVersion}`}
                defaultValue={item.description}
                rows={6}
                onChange={(e) => edit({ description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Priority</Label>
                <Select
                  key={`prio-${formKey}-${formVersion}`}
                  defaultValue={item.priority}
                  onChange={(e) => edit({ priority: e.target.value as WorkItem["priority"] })}
                >
                  {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Version</Label>
                <Input value={item.version} readOnly />
              </div>
            </div>
            <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
              Save changes
            </Button>
          </Card>
          <Card className="p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">Collaboration</h2>
            <div className="mt-3 space-y-3">
              {(commentsQ.data?.comments ?? []).length === 0 && (
                <p className="text-sm text-ink-500">No comments yet. Add context for the next person who picks this up.</p>
              )}
              {commentsQ.data?.comments.map((c) => (
                <div key={c.id} className="rounded-md bg-ink-50 p-3">
                  <div className="text-sm font-medium">{c.author.name}</div>
                  <div className="text-xs text-ink-500">
                    {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                  </div>
                  <p className="mt-1 text-sm">{c.body}</p>
                </div>
              ))}
              <Textarea
                rows={3}
                placeholder="Add a comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <Button disabled={!comment.trim() || addComment.isPending} onClick={() => addComment.mutate()}>
                Post comment
              </Button>
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">Activity timeline</h2>
            <ol className="mt-3 space-y-3">
              {activity.map((e) => (
                <li key={e.id} className="border-l-2 border-ink-200 pl-3 text-sm">
                  <div className="font-medium text-ink-800">{e.summary}</div>
                  <div className="text-xs text-ink-500">
                    {e.actor.name} · {formatDistanceToNow(new Date(e.createdAt), { addSuffix: true })}
                  </div>
                </li>
              ))}
            </ol>
            {activityQ.hasNextPage && (
              <Button
                variant="secondary"
                className="mt-3"
                onClick={() => void activityQ.fetchNextPage()}
                disabled={activityQ.isFetchingNextPage}
              >
                {activityQ.isFetchingNextPage ? "Loading…" : `Load older activity (${activity.length} of ${activityTotal})`}
              </Button>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">Details</h2>
            <Row label="Type" value={TYPE_LABEL[item.type]} />
            <Row label="Team" value={item.team.name} />
            <Row label="Creator" value={item.creator.name} />
            <Row label="Created" value={formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })} />
            <Row
              label="Due"
              value={item.dueAt ? formatDistanceToNow(new Date(item.dueAt), { addSuffix: true }) : "None"}
            />
            <div>
              <Label>Assignee</Label>
              <Select
                value={item.assignee?.id ?? ""}
                onChange={(e) => assign.mutate(e.target.value || null)}
                disabled={!canManageTeam(item.team.id) || assign.isPending}
              >
                <option value="">Unassigned</option>
                {assigneesQ.data?.assignees.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </div>
          </Card>
          <Card className="space-y-2 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">Workflow</h2>
            <p className="text-sm text-ink-600">Current: {STATUS_LABEL[item.status]}</p>
            {item.status === "IN_PROGRESS" || item.status === "IN_REVIEW" ? (
              <Button variant="secondary" onClick={() => requestApproval.mutate()} disabled={requestApproval.isPending}>
                Request approval
              </Button>
            ) : null}
            {next.map((status) => (
              <Button
                key={status}
                variant={status === "CLOSED" ? "danger" : "secondary"}
                onClick={() => (status === "CLOSED" ? setConfirmClose(true) : transition.mutate(status))}
                disabled={transition.isPending}
              >
                Move to {STATUS_LABEL[status]}
              </Button>
            ))}
            {item.status === "AWAITING_APPROVAL" && (
              <p className="text-sm text-amber-800">
                Waiting on an authorized approver. Status cannot be changed from this screen.
                {user && canManageTeam(item.team.id) ? (
                  <>
                    {" "}
                    <Link to="/approvals" className="underline">
                      Open approvals
                    </Link>
                  </>
                ) : null}
              </p>
            )}
          </Card>
        </div>
      </div>
      <Modal open={confirmClose} title="Close this work item?" onClose={() => setConfirmClose(false)}>
        <p className="text-sm text-ink-600">Closed items leave the active queue. Managers can reopen later if needed.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmClose(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => transition.mutate("CLOSED")}>
            Close item
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-ink-500">{label}</span>
      <span className="text-ink-800">{value}</span>
    </div>
  );
}
