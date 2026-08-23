import type { User } from "firebase/auth";
import { afterEach, describe, expect, it, vi } from "vitest";

import { authenticatedJson } from "./authenticated-api";

const user = {
  getIdToken: vi.fn(async () => "test-token"),
} as unknown as User;

describe("authenticatedJson", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    [413, "REQUEST_TOO_LARGE", "送信サイズが上限を超えました"],
    [504, "PLATFORM_TIMEOUT", "サーバーの実行時間内に完了しませんでした"],
  ])("explains non-JSON platform errors (%i)", async (status, code, message) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("platform error", {
      status,
      headers: { "Content-Type": "text/plain" },
    })));

    await expect(authenticatedJson(user, "/api/ai/extract", { body: {} }))
      .rejects.toMatchObject({
        code,
        status,
        message: expect.stringContaining(message),
      });
  });

  it("keeps a safe fallback for an invalid successful response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not json", { status: 200 })));
    await expect(authenticatedJson(user, "/api/ai/status", { method: "GET" }))
      .rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("uses the HttpOnly-cookie path for demo users without requesting a Firebase token", async () => {
    const demoUser = { isDemo: true, getIdToken: vi.fn() };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true })));
    await expect(authenticatedJson<{ ok: boolean }>(demoUser, "/api/ai/extract", { body: { type: "text", text: "recipe" } })).resolves.toEqual({ ok: true });
    expect(demoUser.getIdToken).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith("/api/ai/extract", expect.objectContaining({
      headers: expect.not.objectContaining({ Authorization: expect.anything() }),
    }));
  });
});
