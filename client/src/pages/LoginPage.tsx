import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Button, ErrorBanner, Input, Label } from "../components/ui";
import { ApiError } from "../types";

const ACCOUNTS = [
  { email: "admin@newtonite.local", role: "Platform admin" },
  { email: "maya.chen@newtonite.local", role: "CS manager" },
  { email: "jordan.lee@newtonite.local", role: "CS member" },
  { email: "casey.nguyen@newtonite.local", role: "CS viewer" },
  { email: "priya.shah@newtonite.local", role: "Engineering manager" },
  { email: "alex.kim@newtonite.local", role: "Engineering member" },
  { email: "sam.okonkwo@newtonite.local", role: "Finance manager" },
  { email: "riley.patel@newtonite.local", role: "Finance member" }
];

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("maya.chen@newtonite.local");
  const [password, setPassword] = useState("Password123!");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to sign in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <div className="hidden w-[42%] flex-col justify-between bg-ink-900 p-10 text-white lg:flex">
        <div>
          <div className="text-sm uppercase tracking-[0.2em] text-ink-400">Newtonite</div>
          <h1 className="mt-6 text-4xl font-semibold leading-tight">Operations Under Pressure</h1>
          <p className="mt-4 max-w-sm text-ink-300">
            Every request accounted for. Every action traceable. Coordinate operational work without losing
            ownership, history, or control.
          </p>
        </div>
        <p className="text-xs text-ink-500">Internal coordination platform · assessment build</p>
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md">
          <h2 className="text-2xl font-semibold text-ink-900">Sign in to Newtonite Ops</h2>
          <p className="mt-1 text-sm text-ink-500">Use a seeded demo account. Password is the same for all users.</p>
          <form className="mt-8 space-y-4" onSubmit={onSubmit}>
            {error && <ErrorBanner message={error} />}
            <div>
              <Label>Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
            </div>
            <div>
              <Label>Password</Label>
              <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <div className="mt-8 rounded-lg border border-ink-200 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">Demo accounts</div>
            <p className="mt-1 text-xs text-ink-500">Password: Password123!</p>
            <ul className="mt-3 space-y-2">
              {ACCOUNTS.map((a) => (
                <li key={a.email}>
                  <button
                    className="w-full rounded px-2 py-1 text-left text-sm hover:bg-ink-50"
                    onClick={() => setEmail(a.email)}
                    type="button"
                  >
                    <span className="font-medium">{a.email}</span>
                    <span className="ml-2 text-ink-500">{a.role}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
