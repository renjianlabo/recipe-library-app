import { describe, expect, it, vi } from "vitest";

import {
  AI_REQUEST_MAX_BYTES,
  createExtractHandler,
} from "../api-handlers";
import type { AiRecipeService } from "../ai-service";
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
