import { createContext, useContext, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { AuthUser } from "../types";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  canManageTeam: (teamId: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        const res = await api.get<{ user: AuthUser }>("/api/auth/me");
        return res.user;
      } catch (err: unknown) {
        const status = (err as { status?: number }).status;
        if (status === 401) return null;
        throw err;
      }
    },
    retry: false
  });

  const loginMut = useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      api.post<{ user: AuthUser }>("/api/auth/login", input),
    onSuccess: async () => {
      await qc.invalidateQueries();
    }
  });

  const logoutMut = useMutation({
    mutationFn: () => api.post("/api/auth/logout"),
    onSuccess: async () => {
      qc.clear();
    }
  });

  const value = useMemo<AuthContextValue>(() => {
    const user = me.data ?? null;
    return {
      user,
      loading: me.isLoading,
      login: async (email, password) => {
        await loginMut.mutateAsync({ email, password });
      },
      logout: async () => {
        await logoutMut.mutateAsync();
      },
      isAdmin: user?.platformRole === "ADMIN",
      canManageTeam: (teamId: string) =>
        user?.platformRole === "ADMIN" ||
        user?.memberships.some((m) => m.teamId === teamId && m.role === "MANAGER") === true
    };
  }, [me.data, me.isLoading, loginMut, logoutMut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
