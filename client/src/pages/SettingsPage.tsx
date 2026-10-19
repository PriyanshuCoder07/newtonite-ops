import { useAuth } from "../lib/auth";
import { Card } from "../components/ui";

export function SettingsPage() {
  const { user } = useAuth();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Card className="space-y-2 p-4 text-sm">
        <div>
          <span className="text-ink-500">Name</span>
          <div className="font-medium">{user?.name}</div>
        </div>
        <div>
          <span className="text-ink-500">Email</span>
          <div className="font-medium">{user?.email}</div>
        </div>
        <div>
          <span className="text-ink-500">Platform role</span>
          <div className="font-medium">{user?.platformRole}</div>
        </div>
        <div>
          <span className="text-ink-500">Team memberships</span>
          <ul className="mt-1 list-disc pl-5">
            {user?.memberships.map((m) => (
              <li key={m.teamId}>
                {m.teamName} — {m.role}
              </li>
            ))}
          </ul>
        </div>
      </Card>
      <Card className="p-4 text-sm text-ink-600">
        User provisioning is administrator-managed. Public registration is disabled for this internal tool. Demo
        accounts are documented in the README.
      </Card>
    </div>
  );
}
