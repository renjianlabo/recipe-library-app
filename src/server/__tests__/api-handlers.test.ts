import { describe, expect, it, vi } from "vitest";

import {
  AI_REQUEST_MAX_BYTES,
  createAiAuthenticator,
  createExtractHandler,
} from "../api-handlers";
import type { AiRecipeService } from "../ai-service";
import { ApiError } from "../api-error";
import type { DemoSessionStore } from "../demo-session";
import { DEMO_COOKIE_NAME, demoSessionKey } from "../demo-session";
import { recipeDraft } from "./fixtures";

const success = {
  draft: recipeDraft(),
  warnings: [],
  needsServingsConfirmation: false,
  detectedServings: 2,
};

const service: AiRecipeService = {
  extract: vi.fn(async () => success),
};

describe("authenticated API handlers", () => {
  it("uses Firebase Bearer auth first and otherwise requires an active demo cookie", async () => {
    const sessionId = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN_1234";
    const firebaseAuth = vi.fn(async () => ({ uid: "firebase-user", email: "user@example.com" }));
    const demoStore: DemoSessionStore = {
      get: vi.fn(async (key) => key === demoSessionKey(sessionId) ? ({ createdAt: 1_000, expiresAt: 10_000, aiUsed: 1, aiLimit: 5 }) : null),
      create: vi.fn(), delete: vi.fn(), consumeAi: vi.fn(),
    };
    const authenticate = createAiAuthenticator({ authenticateFirebase: firebaseAuth, demoStore, now: () => 2_000 });
    await expect(authenticate(new Request("https://example.test/api", { headers: { cookie: `${DEMO_COOKIE_NAME}=${sessionId}` } }))).resolves.toMatchObject({ uid: "demo-user", authKind: "demo" });
    await expect(authenticate(new Request("https://example.test/api", { headers: { authorization: "Bearer token", cookie: `${DEMO_COOKIE_NAME}=${sessionId}` } }))).resolves.toMatchObject({ uid: "firebase-user", authKind: "firebase" });
    expect(firebaseAuth).toHaveBeenCalledTimes(1);
    await expect(authenticate(new Request("https://example.test/api"))).rejects.toMatchObject({ code: "AUTH_REQUIRED", status: 401 });
  });

  it("rejects unauthenticated AI calls with the standard error shape", async () => {
    const handler = createExtractHandler({ service, rateLimit: () => undefined });
    const response = await handler(new Request("https://example.test/api/ai/extract", {
      method: "POST",
      body: JSON.stringify({ type: "text", text: "recipe" }),
    }));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "AUTH_REQUIRED",
        message: "ログインが必要です。もう一度ログインしてください。",
        recoverable: true,
      },
    });
  });

  it("allows an active demo, consumes once, and rejects the sixth request before AI", async () => {
    let aiUsed = 4;
    const demoStore: DemoSessionStore = {
      get: vi.fn(), create: vi.fn(), delete: vi.fn(),
      consumeAi: vi.fn(async () => {
        if (aiUsed >= 5) throw new ApiError("DEMO_AI_LIMIT_REACHED", "デモ上限", 429, false);
        aiUsed += 1;
        return { createdAt: 1, expiresAt: 99_999, aiUsed, aiLimit: 5 };
      }),
    };
    const demoService = { extract: vi.fn(async () => success) };
    const handler = createExtractHandler({
      service: demoService,
      demoStore,
      authenticate: async () => ({ uid: "demo-user", email: null, authKind: "demo", demoSessionKey: "safe-key" }),
      rateLimit: () => undefined,
    });
    const makeRequest = () => new Request("https://example.test/api/ai/extract", { method: "POST", body: JSON.stringify({ type: "text", text: "recipe" }) });

    expect((await handler(makeRequest())).status).toBe(200);
    expect(aiUsed).toBe(5);
    const limited = await handler(makeRequest());
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ error: { code: "DEMO_AI_LIMIT_REACHED" } });
    expect(demoService.extract).toHaveBeenCalledTimes(1);
  });

  it("does not consume demo quota for invalid request JSON or an invalid YouTube URL", async () => {
    const demoStore = { get: vi.fn(), create: vi.fn(), delete: vi.fn(), consumeAi: vi.fn() } satisfies DemoSessionStore;
    const handler = createExtractHandler({
      service,
      demoStore,
      authenticate: async () => ({ uid: "demo-user", email: null, authKind: "demo", demoSessionKey: "safe-key" }),
      rateLimit: () => undefined,
    });
    const invalidJson = await handler(new Request("https://example.test/api/ai/extract", { method: "POST", body: "{" }));
    const invalidYoutube = await handler(new Request("https://example.test/api/ai/extract", { method: "POST", body: JSON.stringify({ type: "youtube", url: "https://youtu.be/bad" }) }));
    expect(invalidJson.status).toBe(400);
    expect(invalidYoutube.status).toBe(400);
    expect(demoStore.consumeAi).not.toHaveBeenCalled();
  });

  it("does not apply demo quota to a Firebase-authenticated user", async () => {
    const demoStore = { get: vi.fn(), create: vi.fn(), delete: vi.fn(), consumeAi: vi.fn() } satisfies DemoSessionStore;
    const handler = createExtractHandler({
      service,
      demoStore,
      authenticate: async () => ({ uid: "user-1", email: "user@example.com", authKind: "firebase" }),
      rateLimit: () => undefined,
    });
    const response = await handler(new Request("https://example.test/api/ai/extract", { method: "POST", body: JSON.stringify({ type: "text", text: "recipe" }) }));
    expect(response.status).toBe(200);
    expect(demoStore.consumeAi).not.toHaveBeenCalled();
  });

  it("returns the shared successful draft shape and rejects invalid input", async () => {
    const handler = createExtractHandler({
      service,
      authenticate: async () => ({ uid: "user-1", email: "user@example.com" }),
      rateLimit: () => undefined,
    });
    const response = await handler(new Request("https://example.test/api/ai/extract", {
      method: "POST",
      body: JSON.stringify({ type: "text", text: "recipe" }),
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(success);

    const invalid = await handler(new Request("https://example.test/api/ai/extract", {
      method: "POST",
      body: JSON.stringify({ type: "text", text: "" }),
    }));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: { code: "REQUEST_INVALID" } });
  });

  it("rejects oversized AI JSON as 413 with actionable Japanese guidance", async () => {
    const handler = createExtractHandler({
      service,
      authenticate: async () => ({ uid: "user-1", email: null }),
      rateLimit: () => undefined,
    });
    const response = await handler(new Request("https://example.test/api/ai/extract", {
      method: "POST",
      headers: { "content-length": String(AI_REQUEST_MAX_BYTES + 1) },
      body: JSON.stringify({ type: "text", text: "recipe" }),
    }));
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "REQUEST_TOO_LARGE",
        message: expect.stringContaining("スクリーンショットの枚数を減らす"),
      },
    });
  });
});
