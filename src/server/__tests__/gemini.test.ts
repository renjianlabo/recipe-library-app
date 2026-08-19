import { describe, expect, it, vi } from "vitest";

import {
  createGeminiRecipeGenerator,
  DEFAULT_AI_TIMEOUT_MS,
  MAX_AI_TIMEOUT_MS,
  resolveAiTimeoutMs,
  type GeminiTransport,
} from "../gemini";
import { modelOutput } from "./fixtures";

function transportWith(response: Parameters<GeminiTransport["create"]> extends never ? never : unknown): GeminiTransport {
  return {
    create: vi.fn(async () => response as Awaited<ReturnType<GeminiTransport["create"]>>),
  };
}

describe("Gemini Interactions recipe generator", () => {
  it("uses a 45 second default and caps configuration below the Vercel duration", () => {
    expect(resolveAiTimeoutMs(undefined)).toBe(DEFAULT_AI_TIMEOUT_MS);
    expect(resolveAiTimeoutMs("invalid")).toBe(DEFAULT_AI_TIMEOUT_MS);
    expect(resolveAiTimeoutMs("90000")).toBe(90_000);
    expect(resolveAiTimeoutMs("999999")).toBe(MAX_AI_TIMEOUT_MS);
    expect(MAX_AI_TIMEOUT_MS).toBeLessThan(300_000);
  });

  it("uses structured Interactions output and validates it with Zod", async () => {
    const transport = transportWith({
      status: "completed",
      output_text: JSON.stringify(modelOutput()),
      steps: [],
    });
    const generator = createGeminiRecipeGenerator({ transport, model: "test-flash", timeoutMs: 100 });
    const result = await generator.generate({
      systemInstruction: "system",
      input: [{ type: "text", text: "recipe" }],
    });

    expect(result.draft.title).toBe("親子丼");
    expect(transport.create).toHaveBeenCalledWith(expect.objectContaining({
      model: "test-flash",
      response_format: expect.objectContaining({ mime_type: "application/json" }),
      store: false,
    }), expect.any(AbortSignal));
  });

  it("rejects malformed structured output", async () => {
    const generator = createGeminiRecipeGenerator({
      transport: transportWith({ status: "completed", output_text: "{}", steps: [] }),
      timeoutMs: 100,
    });
    await expect(generator.generate({ systemInstruction: "system", input: [{ type: "text", text: "x" }] }))
      .rejects.toMatchObject({ code: "AI_INVALID_RESPONSE", status: 502 });
  });

  it("maps timeout, quota and communication failures to Japanese API errors", async () => {
    const never: GeminiTransport = { create: () => new Promise(() => undefined) };
    await expect(createGeminiRecipeGenerator({ transport: never, timeoutMs: 5 }).generate({
      systemInstruction: "system",
      input: [{ type: "text", text: "x" }],
    })).rejects.toMatchObject({ code: "AI_TIMEOUT", status: 504 });

    const quota: GeminiTransport = { create: async () => { throw { status: 429, message: "quota" }; } };
    await expect(createGeminiRecipeGenerator({ transport: quota }).generate({
      systemInstruction: "system",
      input: [{ type: "text", text: "x" }],
    })).rejects.toMatchObject({ code: "AI_LIMIT_REACHED", status: 429 });

    const network: GeminiTransport = { create: async () => { throw new Error("ECONNRESET"); } };
    await expect(createGeminiRecipeGenerator({ transport: network }).generate({
      systemInstruction: "system",
      input: [{ type: "text", text: "x" }],
    })).rejects.toMatchObject({ code: "AI_UNAVAILABLE", status: 503 });
  });

  it("requires a successful URL Context result for the exact page", async () => {
    const successful = createGeminiRecipeGenerator({ transport: transportWith({
      status: "completed",
      output_text: JSON.stringify(modelOutput()),
      steps: [{
        type: "url_context_result",
        result: [{ status: "success", url: "https://recipe.example/page" }],
      }],
    }) });
    await expect(successful.generate({
      systemInstruction: "system",
      input: [{ type: "text", text: "url" }],
      expectedUrlContext: "https://recipe.example/page",
    })).resolves.toBeTruthy();

    const failed = createGeminiRecipeGenerator({ transport: transportWith({
      status: "completed",
      output_text: JSON.stringify(modelOutput()),
      steps: [{ type: "url_context_result", result: [{ status: "error", url: "https://recipe.example/page" }] }],
    }) });
    await expect(failed.generate({
      systemInstruction: "system",
      input: [{ type: "text", text: "url" }],
      expectedUrlContext: "https://recipe.example/page",
    })).rejects.toMatchObject({ code: "URL_CONTEXT_FAILED" });

    const unsafe = createGeminiRecipeGenerator({ transport: transportWith({
      status: "completed",
      output_text: JSON.stringify(modelOutput()),
      steps: [{ type: "url_context_result", result: [{ status: "unsafe", url: "https://recipe.example/page" }] }],
    }) });
    await expect(unsafe.generate({
      systemInstruction: "system",
      input: [{ type: "text", text: "url" }],
      expectedUrlContext: "https://recipe.example/page",
    })).rejects.toMatchObject({ code: "URL_UNSAFE" });
  });
});
