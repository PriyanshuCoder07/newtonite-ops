import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { ApiError } from "../types";

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body)
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("api client", () => {
  it("keeps Content-Type when extra headers (Idempotency-Key) are supplied", async () => {
    const fetchMock = mockFetch(201, { ok: true });
    await api.post("/api/work-items", { a: 1 }, { "Idempotency-Key": "abc" });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.headers).toMatchObject({ "Content-Type": "application/json", "Idempotency-Key": "abc" });
    expect(init.credentials).toBe("include");
    expect(init.method).toBe("POST");
  });

  it("surfaces the server's status, code, message and details as an ApiError", async () => {
    mockFetch(409, { error: { code: "conflict", message: "Updated by someone else", details: { currentVersion: 5 } } });
    const err = await api.patch("/api/work-items/1", { version: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: "conflict", details: { currentVersion: 5 } });
  });
});
