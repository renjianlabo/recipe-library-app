import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../api-error";
import { createAiRecipeService } from "../ai-service";
import type { RecipeGenerator } from "../gemini";
import { modelOutput, recipeDraft } from "./fixtures";

describe("AI extraction service", () => {
  it("uses YouTube description and video together and reports an empty description", async () => {
    const generate = vi.fn<RecipeGenerator["generate"]>(async () => modelOutput());
    const generator: RecipeGenerator = { generate };
    const service = createAiRecipeService({
      generator,
      youtubeSnippetFetcher: async () => ({
        description: "",
        warnings: ["YouTubeの概要欄は空でした。"],
      }),
    });
    const result = await service.extract({
      type: "youtube",
      url: "https://youtu.be/dQw4w9WgXcQ",
    });

    expect(result.draft.source).toEqual({
      type: "youtube",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
    expect(result.warnings).toContain("YouTubeの概要欄は空でした。");
    expect(generate.mock.calls[0][0].input).toContainEqual({
      type: "video",
      uri: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
  });

  it("does not call Gemini when YouTube metadata retrieval fails", async () => {
    const generate = vi.fn<RecipeGenerator["generate"]>(async () => modelOutput());
    const service = createAiRecipeService({
      generator: { generate },
      youtubeSnippetFetcher: async () => {
        throw new ApiError("YOUTUBE_FETCH_FAILED", "failed", 502, true);
      },
    });
    await expect(service.extract({ type: "youtube", url: "https://youtu.be/dQw4w9WgXcQ" }))
      .rejects.toMatchObject({ code: "YOUTUBE_FETCH_FAILED" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects unsafe websites before Gemini and passes a safe URL for status verification", async () => {
    const unsafeGenerate = vi.fn<RecipeGenerator["generate"]>(async () => modelOutput());
    const unsafe = createAiRecipeService({ generator: { generate: unsafeGenerate } });
    await expect(unsafe.extract({ type: "website", url: "http://127.0.0.1/recipe" }))
      .rejects.toMatchObject({ code: "URL_UNSAFE" });
    expect(unsafeGenerate).not.toHaveBeenCalled();

    const generate = vi.fn<RecipeGenerator["generate"]>(async () => modelOutput());
    const safe = createAiRecipeService({
      generator: { generate },
      lookup: async () => ["93.184.216.34"],
    });
    const result = await safe.extract({ type: "website", url: "https://recipe.example/page#steps" });
    expect(result.draft.source).toEqual({ type: "website", url: "https://recipe.example/page" });
    expect(generate.mock.calls[0][0].expectedUrlContext).toBe("https://recipe.example/page");
  });

  it("revises only the current draft and preserves its source", async () => {
    const generate = vi.fn<RecipeGenerator["generate"]>(async () => modelOutput({
      draft: recipeDraft({ title: "修正版", source: { type: "text", url: null } }),
    }));
    const service = createAiRecipeService({ generator: { generate } });
    const currentRecipe = recipeDraft({
      source: { type: "website", url: "https://recipe.example/original" },
    });
    const result = await service.revise({
      currentRecipe,
      instruction: "最後の工程だけ短くして",
      images: [],
    });
    expect(result.draft.source).toEqual(currentRecipe.source);
    expect(generate.mock.calls[0][0].systemInstruction).toContain("限定修正");
    expect((generate.mock.calls[0][0].input[0] as { text: string }).text).toContain("最後の工程だけ短くして");
  });

  it("does not round unsupported detected servings", async () => {
    const service = createAiRecipeService({ generator: {
      generate: async () => modelOutput({
        draft: recipeDraft({ servings: null }),
        detectedServings: 5,
      }),
    } });
    const result = await service.extract({ type: "text", text: "5人分のレシピ" });
    expect(result.needsServingsConfirmation).toBe(true);
    expect(result.detectedServings).toBe(5);
    expect(result.draft.servings).toBeNull();
  });
});
