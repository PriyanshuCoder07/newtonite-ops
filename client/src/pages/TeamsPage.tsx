import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Card, Spinner } from "../components/ui";
import { useAuth } from "../lib/auth";

type Team = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  workItemCount: number;
  members: { id: string; role: string; user: { id: string; name: string; email: string; isActive: boolean } }[];
};

export function TeamsPage() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<{ teams: Team[] }>("/api/teams")
  });
  if (q.isLoading) return <Spinner />;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Teams</h1>
        <p className="text-sm text-ink-500">
          Signed in as {user?.name}. Membership is stored as explicit user–team–role records.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {q.data?.teams.map((t) => (
          <Card key={t.id} className="p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">{t.name}</h2>
              <span className="text-xs text-ink-500">{t.workItemCount} work items</span>
            </div>
            <p className="mt-1 text-sm text-ink-500">{t.description}</p>
            <ul className="mt-3 space-y-1 text-sm">
              {t.members.map((m) => (
                <li key={m.id} className="flex justify-between">
                  <span>
                    {m.user.name}{" "}
                    {!m.user.isActive && <span className="text-xs text-ink-400">(inactive)</span>}
                  </span>
                  <span className="text-xs uppercase text-ink-500">{m.role}</span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
