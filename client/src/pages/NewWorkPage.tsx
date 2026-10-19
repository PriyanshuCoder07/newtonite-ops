import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Button, Card, ErrorBanner, Input, Label, Select, Textarea } from "../components/ui";
import { TYPE_LABEL } from "../lib/cn";
import { useAuth } from "../lib/auth";
import { ApiError, type User, type WorkItem } from "../types";
import { useEffect, useRef, useState } from "react";

const schema = z.object({
  title: z.string().min(3, "Title is required"),
  description: z.string().min(10, "Describe why this work exists"),
  type: z.string(),
  priority: z.string(),
  teamId: z.string().min(1, "Select a team"),
  assigneeId: z.string().optional(),
  dueAt: z.string().optional()
});

type Form = z.infer<typeof schema>;

export function NewWorkPage() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  // One key per form: a double-click or a retry after a timeout cannot create a second item.
  const idempotencyKey = useRef(crypto.randomUUID());
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: "OPERATIONAL_TASK",
      priority: "MEDIUM",
      teamId: user?.memberships[0]?.teamId ?? ""
    }
  });
  const teamId = form.watch("teamId");
  const teams = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<{ teams: { id: string; name: string }[] }>("/api/teams")
  });
  const assignees = useQuery({
    queryKey: ["assignees", teamId],
    queryFn: () => api.get<{ assignees: User[] }>(`/api/teams/${teamId}/assignees`),
    enabled: Boolean(teamId)
  });

  useEffect(() => {
    if (!form.getValues("teamId") && user?.memberships[0]) {
      form.setValue("teamId", user.memberships[0].teamId);
    }
  }, [user, form]);

  const create = useMutation({
    mutationFn: (values: Form) =>
      api.post<{ item: WorkItem }>(
        "/api/work-items",
        {
          ...values,
          assigneeId: values.assigneeId || null,
          dueAt: values.dueAt ? new Date(values.dueAt).toISOString() : null
        },
        { "Idempotency-Key": idempotencyKey.current }
      ),
    onSuccess: async (res) => {
      await qc.invalidateQueries();
      navigate(`/work/${res.item.id}`);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not create work item")
  });

  const creatableTeams = (teams.data?.teams ?? []).filter((t) => {
    if (isAdmin) return true;
    const m = user?.memberships.find((x) => x.teamId === t.id);
    return m && m.role !== "VIEWER";
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">New work item</h1>
        <p className="text-sm text-ink-500">Capture the request so ownership and history start immediately.</p>
      </div>
      <Card className="p-5">
        <form className="space-y-4" onSubmit={form.handleSubmit((v) => create.mutate(v))}>
          {error && <ErrorBanner message={error} />}
          <div>
            <Label>Title</Label>
            <Input {...form.register("title")} />
            {form.formState.errors.title && (
              <p className="mt-1 text-xs text-red-700">{form.formState.errors.title.message}</p>
            )}
          </div>
          <div>
            <Label>Why this exists</Label>
            <Textarea rows={5} {...form.register("description")} />
            {form.formState.errors.description && (
              <p className="mt-1 text-xs text-red-700">{form.formState.errors.description.message}</p>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Type</Label>
              <Select {...form.register("type")}>
                {Object.entries(TYPE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select {...form.register("priority")}>
                {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Owning team</Label>
              <Select {...form.register("teamId")}>
                <option value="">Select team</option>
                {creatableTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Assignee</Label>
              <Select {...form.register("assigneeId")}>
                <option value="">Unassigned</option>
                {assignees.data?.assignees.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Due date</Label>
              <Input type="datetime-local" {...form.register("dueAt")} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create work item"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
