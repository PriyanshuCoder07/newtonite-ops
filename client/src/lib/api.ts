import { ApiError } from "../types";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { headers, ...rest } = init;
  const res = await fetch(path, {
    credentials: "include",
    ...rest,
    // Merge (don't replace) so custom headers such as Idempotency-Key keep Content-Type.
    headers: { "Content-Type": "application/json", ...(headers ?? {}) }
  });
  const text = await res.text();
  let body: { error?: { code?: string; message?: string; details?: unknown } } = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    if (res.ok) throw new ApiError(res.status, "bad_response", "The server returned an unreadable response");
  }
  if (!res.ok) {
    throw new ApiError(
      res.status,
      body.error?.code ?? "error",
      body.error?.message ?? "Request failed",
      body.error?.details
    );
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined, headers }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) })
};
