import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createGeminiRecipeGenerator,
  DEFAULT_AI_TIMEOUT_MS,
  MAX_AI_TIMEOUT_MS,
  resolveAiTimeoutMs,
  type GeminiTransport,
} from "../gemini";
import { recipeDraftSchema } from "../ai-schema";
import { modelOutput } from "./fixtures";

const textSource = { type: "text" as const, url: null };

function transportWith(response: Parameters<GeminiTransport["create"]> extends never ? never : unknown): GeminiTransport {
  return {
    create: vi.fn(async () => response as Awaited<ReturnType<GeminiTransport["create"]>>),
  };
}

describe("Gemini Interactions recipe generator", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
      source: textSource,
    });

    expect(result.draft.title).toBe("親子丼");
    expect(transport.create).toHaveBeenCalledWith(expect.objectContaining({
      model: "test-flash",
      response_format: expect.objectContaining({ mime_type: "application/json" }),
      store: false,
    }), expect.any(AbortSignal));
    expect(transport.create).toHaveBeenCalledTimes(1);
  });

  it("retries one transient UNAVAILABLE failure and then succeeds", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const create = vi.fn<GeminiTransport["create"]>()
      .mockRejectedValueOnce({ status: 503, code: "UNAVAILABLE" })
      .mockResolvedValueOnce({
        status: "completed",
        output_text: JSON.stringify(modelOutput()),
        steps: [],
      });
    const generator = createGeminiRecipeGenerator({
      transport: { create },
      timeoutMs: 100,
      retryDelayMs: 0,
    });

    await expect(generator.generate({
      systemInstruction: "system",
      input: [{ type: "text", text: "fixture" }],
      source: textSource,
    })).resolves.toBeTruthy();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("stops after one retry when INTERNAL persists", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const create = vi.fn<GeminiTransport["create"]>(async () => {
      throw { status: 500, code: "INTERNAL" };
    });
    const generator = createGeminiRecipeGenerator({
      transport: { create },
      timeoutMs: 100,
      retryDelayMs: 0,
    });

    await expect(generator.generate({
      systemInstruction: "system",
      input: [{ type: "text", text: "fixture" }],
      source: textSource,
    })).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("does not retry a transient transport error when retry is disabled", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const create = vi.fn<GeminiTransport["create"]>(async () => {
      throw { status: 503, code: "UNAVAILABLE" };
    });
    const generator = createGeminiRecipeGenerator({
      transport: { create },
      timeoutMs: 100,
      retryDelayMs: 0,
    });

    await expect(generator.generate({
      systemInstruction: "system",
      input: [{ type: "text", text: "fixture" }],
      source: textSource,
      retryTransient: false,
    })).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("does not retry quota or permanent configuration errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const error of [
      { status: 429, code: "RESOURCE_EXHAUSTED" },
      { status: 403, code: "PERMISSION_DENIED" },
      { status: 400, code: "INVALID_ARGUMENT" },
    ]) {
      const create = vi.fn<GeminiTransport["create"]>(async () => { throw error; });
      const generator = createGeminiRecipeGenerator({
        transport: { create },
        timeoutMs: 100,
        retryDelayMs: 0,
      });
      await expect(generator.generate({
        systemInstruction: "system",
        input: [{ type: "text", text: "fixture" }],
        source: textSource,
      })).rejects.toBeTruthy();
      expect(create).toHaveBeenCalledTimes(1);
    }
  });

  it("normalizes string numericAmount values while preserving amountText", async () => {
    const rawOutput = modelOutput();
    const rawAmounts = [
      "150g", "150 g", "2個", "1/2個", "0.5個",
      "大さじ2", "大さじ 2", "小さじ1", "60ml", "60 ml",
      "少々", "適量", "適宜", "ひとつまみ", "1袋（200g）", "1本程度", "お好みで",
    ];
    const items = rawAmounts.map((amountText, index) => ({
      id: `item-${index + 1}`,
      name: `項目${index + 1}`,
      amountText,
      numericAmount: amountText,
      unit: "",
      note: "",
    }));
    const rawDraft = rawOutput.draft as unknown as {
      ingredients: typeof items;
      seasonings: typeof items;
      steps: Array<{ ingredientRefs: unknown[] }>;
    };
    rawDraft.ingredients = items.slice(0, 5);
    rawDraft.seasonings = items.slice(5);
    rawDraft.steps[0].ingredientRefs = [];
    const generator = createGeminiRecipeGenerator({
      transport: transportWith({
        status: "completed",
        output_text: JSON.stringify(rawOutput),
        steps: [],
      }),
      timeoutMs: 100,
    });

    const result = await generator.generate({
      systemInstruction: "system",
      input: [{ type: "text", text: "fixture only" }],
      source: textSource,
    });
    const normalized = [...result.draft.ingredients, ...(result.draft.seasonings ?? [])]
      .map(({ amountText, numericAmount, unit }) => ({ amountText, numericAmount, unit }));

    expect(normalized).toEqual([
      { amountText: "150g", numericAmount: 150, unit: "" },
      { amountText: "150 g", numericAmount: 150, unit: "" },
      { amountText: "2個", numericAmount: 2, unit: "" },
      { amountText: "1/2個", numericAmount: 0.5, unit: "" },
      { amountText: "0.5個", numericAmount: 0.5, unit: "" },
      { amountText: "大さじ2", numericAmount: 2, unit: "" },
      { amountText: "大さじ 2", numericAmount: 2, unit: "" },
      { amountText: "小さじ1", numericAmount: 1, unit: "" },
      { amountText: "60ml", numericAmount: 60, unit: "" },
      { amountText: "60 ml", numericAmount: 60, unit: "" },
      { amountText: "少々", numericAmount: null, unit: "" },
      { amountText: "適量", numericAmount: null, unit: "" },
      { amountText: "適宜", numericAmount: null, unit: "" },
      { amountText: "ひとつまみ", numericAmount: null, unit: "" },
      { amountText: "1袋（200g）", numericAmount: null, unit: "" },
      { amountText: "1本程度", numericAmount: null, unit: "" },
      { amountText: "お好みで", numericAmount: null, unit: "" },
    ]);
    expect(recipeDraftSchema.safeParse(result.draft).success).toBe(true);
  });

  it("derives internal IDs, order, timer IDs, tags, and source on the server", async () => {
    const rawOutput = modelOutput();
    rawOutput.draft.ingredients = [{
      id: "材料 1",
      name: "豚肉",
      amountText: "150g",
      numericAmount: "150g",
      unit: "g",
      note: "",
    }] as unknown as typeof rawOutput.draft.ingredients;
    rawOutput.draft.seasonings = [{
      id: "調味料 1",
      name: "しょうゆ",
      amountText: "大さじ2",
      numericAmount: "大さじ2",
      unit: "大さじ",
      note: "",
    }] as unknown as typeof rawOutput.draft.seasonings;
    rawOutput.draft.steps = [{
      id: "工程 99",
      order: 99,
      text: "炒める。",
      ingredientRefs: [
        { ingredientId: "材料 1", usage: "all" },
        { ingredientId: "調味料 1", usage: "all" },
      ],
      timers: [{ id: "任意のID", label: "加熱", seconds: 30 }],
    }];
    rawOutput.draft.tags = ["AIが生成したタグ"];
    rawOutput.draft.source = { type: "website", url: "https://wrong.example/" };
    const generator = createGeminiRecipeGenerator({
      transport: transportWith({
        status: "completed",
        output_text: JSON.stringify(rawOutput),
        steps: [],
      }),
      timeoutMs: 100,
    });

    const result = await generator.generate({
      systemInstruction: "system",
      input: [{ type: "text", text: "fixture only" }],
      source: textSource,
    });

    expect(result.draft.ingredients[0]).toMatchObject({
      id: "ingredient-1", amountText: "150g", numericAmount: 150, unit: "g",
    });
    expect(result.draft.seasonings?.[0]).toMatchObject({
      id: "seasoning-1", amountText: "大さじ2", numericAmount: 2, unit: "大さじ",
    });
    expect(result.draft.steps[0]).toMatchObject({ id: "step-1", order: 1 });
    expect(result.draft.steps[0].ingredientRefs.map((reference) => reference.ingredientId))
      .toEqual(["ingredient-1", "seasoning-1"]);
    expect(result.draft.steps[0].timers[0].id).toBe("timer-1-1");
    expect(result.draft.tags).toEqual([]);
    expect(result.draft.source).toEqual(textSource);
    expect(recipeDraftSchema.safeParse(result.draft).success).toBe(true);
  });

  it("passes a YouTube video URI through to the Interactions request", async () => {
    const transport = transportWith({
      status: "completed",
      output_text: JSON.stringify(modelOutput()),
      steps: [],
    });
    const generator = createGeminiRecipeGenerator({ transport, timeoutMs: 100 });
    const input = [
      { type: "video" as const, uri: "https://youtu.be/dQw4w9WgXcQ" },
      { type: "text" as const, text: "YouTube metadata" },
    ];

    await generator.generate({ systemInstruction: "system", input, source: textSource });

    expect(transport.create).toHaveBeenCalledWith(
      expect.objectContaining({ input }),
      expect.any(AbortSignal),
    );
  });

  it("classifies broken JSON without logging response or request content", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const transport = transportWith({ status: "completed", output_text: '{ "draft": "secret-recipe', steps: [] });
    const generator = createGeminiRecipeGenerator({
      transport,
      timeoutMs: 100,
    });
    await expect(generator.generate({
      systemInstruction: "system",
      input: [{ type: "text", text: "secret-user-input" }],
      source: textSource,
    }))
      .rejects.toMatchObject({ code: "AI_INVALID_RESPONSE", status: 502 });

    expect(consoleError).toHaveBeenCalledWith("[recipe-library-ai-invalid-response]", {
      phase: "json_parse",
      responseStatus: "completed",
      outputTextPresent: true,
      outputTextLength: 25,
    });
    const serializedLog = JSON.stringify(consoleError.mock.calls);
    expect(serializedLog).not.toContain("secret-recipe");
    expect(serializedLog).not.toContain("secret-user-input");
    expect(transport.create).toHaveBeenCalledTimes(1);
  });

  it("classifies valid JSON rejected by Zod and logs only issue structure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const invalidOutput = modelOutput();
    invalidOutput.draft.ingredients = [
      {
        ...invalidOutput.draft.ingredients[0],
        name: "secret-ingredient-name",
      },
      {
        ...invalidOutput.draft.ingredients[0],
        name: "another-secret-name",
      },
    ];
    invalidOutput.draft.steps[0].ingredientRefs = [{
      ingredientId: "missing-ingredient-id",
      usage: "all",
    }];
    const transport = transportWith({
        status: "completed",
        output_text: JSON.stringify(invalidOutput),
        steps: [],
      });
    const generator = createGeminiRecipeGenerator({
      transport,
      timeoutMs: 100,
    });

    await expect(generator.generate({
      systemInstruction: "system",
      input: [{ type: "text", text: "secret-user-input" }],
      source: textSource,
    })).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE", status: 502 });

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      "[recipe-library-ai-invalid-response]",
      expect.objectContaining({
        phase: "schema_validation",
        responseStatus: "completed",
        issueCount: 2,
        issuesTruncated: false,
        issues: expect.arrayContaining([
          {
            path: "draft.ingredients.1.id",
            message: "材料IDが重複しています",
            code: "custom",
          },
          {
            path: "draft.steps.0.ingredientRefs.0.ingredientId",
            message: "材料・調味料一覧にない項目を工程から参照しています",
            code: "custom",
          },
        ]),
      }),
    );
    const serializedLog = JSON.stringify(consoleError.mock.calls);
    expect(serializedLog).not.toContain("secret-ingredient-name");
    expect(serializedLog).not.toContain("another-secret-name");
    expect(serializedLog).not.toContain("missing-ingredient-id");
    expect(serializedLog).not.toContain("secret-user-input");
    expect(transport.create).toHaveBeenCalledTimes(1);
  });

  it("redacts model-generated unknown field names from schema diagnostics", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const invalidOutput = modelOutput();
    (invalidOutput.draft as unknown as Record<string, unknown>)["secret-user-field"] = "secret-user-value";
    const generator = createGeminiRecipeGenerator({
      transport: transportWith({
        status: "completed",
        output_text: JSON.stringify(invalidOutput),
        steps: [],
      }),
      timeoutMs: 100,
    });

    await expect(generator.generate({
      systemInstruction: "system",
      input: [{ type: "text", text: "x" }],
      source: textSource,
    })).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE", status: 502 });

    expect(consoleError).toHaveBeenCalledWith("[recipe-library-ai-invalid-response]", {
      phase: "schema_validation",
      responseStatus: "completed",
      issueCount: 1,
      issuesTruncated: false,
      issues: [{
        path: "draft",
        message: "認識されないフィールドが含まれています",
        code: "unrecognized_keys",
      }],
    });
    const serializedLog = JSON.stringify(consoleError.mock.calls);
    expect(serializedLog).not.toContain("secret-user-field");
    expect(serializedLog).not.toContain("secret-user-value");
  });

  it("maps timeout, quota and communication failures to Japanese API errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const never: GeminiTransport = { create: () => new Promise(() => undefined) };
    await expect(createGeminiRecipeGenerator({ transport: never, timeoutMs: 5, retryDelayMs: 0 }).generate({
      systemInstruction: "system",
      input: [{ type: "text", text: "x" }],
      source: textSource,
    })).rejects.toMatchObject({ code: "AI_TIMEOUT", status: 504 });

    const quota: GeminiTransport = { create: async () => { throw { status: 429, message: "quota" }; } };
    await expect(createGeminiRecipeGenerator({ transport: quota }).generate({
      systemInstruction: "system",
      input: [{ type: "text", text: "x" }],
      source: textSource,
    })).rejects.toMatchObject({ code: "AI_LIMIT_REACHED", status: 429 });

    const network: GeminiTransport = { create: async () => { throw new Error("ECONNRESET"); } };
    await expect(createGeminiRecipeGenerator({ transport: network, retryDelayMs: 0 }).generate({
      systemInstruction: "system",
      input: [{ type: "text", text: "x" }],
      source: textSource,
    })).rejects.toMatchObject({ code: "AI_UNAVAILABLE", status: 503 });
  });

  it("logs only safe Gemini status, code and a normalized message", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sensitiveError = {
      status: 429,
      code: "AIza-secret-code",
      message: [
        "RESOURCE_EXHAUSTED quota exceeded",
        "GEMINI_API_KEY=AIza-secret",
        "FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----secret",
        "recipe=豚肉の生姜焼き",
        "image=data:image/png;base64,secret-image",
        "url=https://private.example/recipe?id=secret",
      ].join(" "),
    };
    const transport: GeminiTransport = {
      create: async () => { throw sensitiveError; },
    };
    const generator = createGeminiRecipeGenerator({ transport });

    await expect(generator.generate({
      systemInstruction: "system",
      input: [{ type: "text", text: "user recipe input" }],
      source: textSource,
    })).rejects.toMatchObject({
      code: "AI_LIMIT_REACHED",
      message: "AIの利用上限に達しました。しばらく待つか、手動で編集を続けてください。",
      status: 429,
    });

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith("[recipe-library-gemini-error]", {
      status: 429,
      code: "RESOURCE_EXHAUSTED",
      message: "Gemini API quota or rate limit exceeded.",
    });
    expect(Object.keys(consoleError.mock.calls[0][1] as object))
      .toEqual(["status", "code", "message"]);
    const serializedLog = JSON.stringify(consoleError.mock.calls);
    expect(serializedLog).not.toContain("AIza-secret");
    expect(serializedLog).not.toContain("secret-code");
    expect(serializedLog).not.toContain("PRIVATE KEY");
    expect(serializedLog).not.toContain("豚肉の生姜焼き");
    expect(serializedLog).not.toContain("secret-image");
    expect(serializedLog).not.toContain("private.example");
    expect(serializedLog).not.toContain("user recipe input");
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
      source: { type: "website", url: "https://recipe.example/page" },
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
      source: { type: "website", url: "https://recipe.example/page" },
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
      source: { type: "website", url: "https://recipe.example/page" },
      expectedUrlContext: "https://recipe.example/page",
    })).rejects.toMatchObject({ code: "URL_UNSAFE" });
  });
});
