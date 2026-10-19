import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Activity,
  Bell,
  CheckSquare,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  Users,
  Briefcase
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { Avatar } from "./ui";
import { cn } from "../lib/cn";
import type { Notification } from "../types";

const nav = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/my-work", label: "My Work", icon: Briefcase },
  { to: "/work", label: "All Work Items", icon: ClipboardList },
  { to: "/queues", label: "Team Queues", icon: Users },
  { to: "/approvals", label: "Approvals", icon: CheckSquare },
  { to: "/activity", label: "Activity", icon: Activity },
  { to: "/teams", label: "Teams", icon: Users },
  { to: "/settings", label: "Settings", icon: Settings }
];

export function Layout() {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [q, setQ] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const navigate = useNavigate();
  const notes = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<{ notifications: Notification[]; unread: number }>("/api/notifications")
  });

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-ink-50">
      <aside
        className={cn(
          "flex flex-col border-r border-ink-200 bg-ink-900 text-ink-100 transition-all",
          collapsed ? "w-16" : "w-60"
        )}
      >
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-accent text-sm font-bold text-white">N</div>
          {!collapsed && (
            <div>
              <div className="text-sm font-semibold text-white">Newtonite Ops</div>
              <div className="text-[11px] text-ink-400">Every action traceable</div>
            </div>
          )}
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm",
                  isActive ? "bg-white/10 text-white" : "text-ink-300 hover:bg-white/5 hover:text-white"
                )
              }
            >
              <item.icon size={18} />
              {!collapsed && item.label}
            </NavLink>
          ))}
        </nav>
        <button
          className="m-2 rounded-md px-3 py-2 text-left text-xs text-ink-400 hover:bg-white/5"
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? "»" : "Collapse"}
        </button>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-ink-200 bg-white px-4 py-3">
          <button className="md:hidden" onClick={() => setCollapsed((v) => !v)} aria-label="Menu">
            <Menu size={18} />
          </button>
          <form
            className="relative max-w-xl flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(`/work?q=${encodeURIComponent(q)}`);
            }}
          >
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search work items, references, descriptions"
              className="w-full rounded-md border border-ink-200 bg-ink-50 py-2 pl-9 pr-3 text-sm"
            />
          </form>
          <Link to="/work/new">
            <span className="inline-flex rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-700">
              New work item
            </span>
          </Link>
          <div className="relative">
            <button
              className="relative rounded-md p-2 hover:bg-ink-100"
              onClick={() => setShowNotes((v) => !v)}
              aria-label="Notifications"
            >
              <Bell size={18} />
              {(notes.data?.unread ?? 0) > 0 && (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-600" />
              )}
            </button>
            {showNotes && (
              <div className="absolute right-0 z-20 mt-2 w-80 rounded-md border border-ink-200 bg-white shadow-lg">
                <div className="border-b px-3 py-2 text-xs font-semibold uppercase text-ink-500">Notifications</div>
                <div className="max-h-80 overflow-auto">
                  {(notes.data?.notifications ?? []).length === 0 && (
                    <p className="px-3 py-6 text-sm text-ink-500">No notifications yet.</p>
                  )}
                  {notes.data?.notifications.map((n) => (
                    <button
                      key={n.id}
                      className={cn("block w-full px-3 py-2 text-left text-sm hover:bg-ink-50", !n.readAt && "bg-accent-50")}
                      onClick={async () => {
                        await api.post(`/api/notifications/${n.id}/read`);
                        notes.refetch();
                        if (n.workItemId) navigate(`/work/${n.workItemId}`);
                        setShowNotes(false);
                      }}
                    >
                      <div className="font-medium text-ink-800">{n.title}</div>
                      <div className="text-xs text-ink-500">{n.body}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="relative">
            <button className="flex items-center gap-2" onClick={() => setShowProfile((v) => !v)}>
              <Avatar name={user.name} />
              <div className="hidden text-left md:block">
                <div className="text-sm font-medium">{user.name}</div>
                <div className="text-xs text-ink-500">{user.platformRole === "ADMIN" ? "Administrator" : "Team member"}</div>
              </div>
            </button>
            {showProfile && (
              <div className="absolute right-0 z-20 mt-2 w-56 rounded-md border border-ink-200 bg-white py-1 shadow-lg">
                <div className="px-3 py-2 text-xs text-ink-500">{user.email}</div>
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-ink-50"
                  onClick={() => logout()}
                >
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            )}
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
