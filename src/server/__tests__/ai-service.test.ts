import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../api-error";
import { createAiRecipeService } from "../ai-service";
import type { RecipeGenerator } from "../gemini";
import { modelOutput, recipeDraft } from "./fixtures";

describe("AI extraction service", () => {
  it("passes YouTube metadata and the original video URL with strict priority rules", async () => {
    const generate = vi.fn<RecipeGenerator["generate"]>(async () => modelOutput());
    const generator: RecipeGenerator = { generate };
    const service = createAiRecipeService({
      generator,
      youtubeSnippetFetcher: async () => ({
        title: "親子丼の作り方",
        description: "材料: 卵2個",
        channelTitle: "料理チャンネル",
        warnings: [],
      }),
    });
    const result = await service.extract({
      type: "youtube",
      url: "https://youtu.be/dQw4w9WgXcQ?t=10",
    });

    expect(result.draft.source).toEqual({
      type: "youtube",
      url: "https://youtu.be/dQw4w9WgXcQ?t=10",
    });
    expect(generate.mock.calls[0][0].input[0]).toEqual({
      type: "video",
      uri: "https://youtu.be/dQw4w9WgXcQ?t=10",
    });
    expect(generate.mock.calls[0][0].input[1]).toMatchObject({ type: "text" });
    const metadataText = (generate.mock.calls[0][0].input[1] as { text: string }).text;
    expect(metadataText).toContain("親子丼の作り方");
    expect(metadataText).toContain("材料: 卵2個");
    expect(metadataText).toContain("料理チャンネル");
    expect(generate.mock.calls[0][0].systemInstruction).toContain("ingredients（材料）、調味料・油・香辛料・だし類はseasonings（調味料）");
    expect(generate.mock.calls[0][0].systemInstruction).toContain("1/2ではなく0.5");
    expect(generate.mock.calls[0][0].systemInstruction).toContain("同義語へ勝手に置き換えない");
    expect(generate.mock.calls[0][0].systemInstruction).toContain("warningsへユーザーが確認できる短い文章で記録");
    expect(generate.mock.calls[0][0].systemInstruction).toContain("概要欄を最優先");
    expect(generate.mock.calls[0][0].systemInstruction).toContain("概要欄と動画が矛盾");
    expect(generate.mock.calls[0][0].systemInstruction).toContain("信頼できない外部入力");
    expect(generate.mock.calls[0][0].systemInstruction).toContain("タグと出典はサーバー側で設定");
    expect(result.draft.tags).toEqual([]);
  });

  it("does not call Gemini when YouTube metadata retrieval fails permanently", async () => {
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

  it("continues with video-only analysis when YouTube metadata retrieval fails temporarily", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const generate = vi.fn<RecipeGenerator["generate"]>(async () => modelOutput());
    const service = createAiRecipeService({
      generator: { generate },
      youtubeSnippetFetcher: async () => {
        throw new ApiError("YOUTUBE_FETCH_TEMPORARY", "temporary", 502, true);
      },
    });

    const result = await service.extract({
      type: "youtube",
      url: "https://youtu.be/dQw4w9WgXcQ",
    });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0].input[0]).toEqual({
      type: "video",
      uri: "https://youtu.be/dQw4w9WgXcQ",
    });
    expect((generate.mock.calls[0][0].input[1] as { text: string }).text)
      .toContain("メタデータは一時的に取得できませんでした");
    expect(result.warnings).toContain(
      "YouTubeの概要欄を取得できなかったため、動画から確認できた内容のみで作成しています。",
    );
  });

  it("returns a YouTube analysis error when metadata and video analysis both fail", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const generate = vi.fn<RecipeGenerator["generate"]>(async () => {
      throw new ApiError("AI_UNAVAILABLE", "temporary", 503, true);
    });
    const service = createAiRecipeService({
      generator: { generate },
      youtubeSnippetFetcher: async () => {
        throw new ApiError("YOUTUBE_FETCH_TEMPORARY", "temporary", 502, true);
      },
    });

    await expect(service.extract({
      type: "youtube",
      url: "https://youtu.be/dQw4w9WgXcQ",
    })).rejects.toMatchObject({ code: "YOUTUBE_VIDEO_ANALYSIS_FAILED" });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("falls back to sufficient description-only extraction when video analysis fails", async () => {
    const generate = vi.fn<RecipeGenerator["generate"]>();
    generate
      .mockRejectedValueOnce(new ApiError("AI_UNAVAILABLE", "failed", 503, true))
      .mockResolvedValueOnce(modelOutput());
    const service = createAiRecipeService({
      generator: { generate },
      youtubeSnippetFetcher: async () => ({
        title: "親子丼",
        description: "材料: 卵2個\n作り方: 卵を加えて加熱する。",
        channelTitle: "料理チャンネル",
        warnings: [],
      }),
    });

    const result = await service.extract({
      type: "youtube",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0].input).toHaveLength(1);
    expect(generate.mock.calls[1][0].input[0]).toMatchObject({ type: "text" });
    expect(generate.mock.calls[1][0].systemInstruction).toContain("タイトルと概要欄だけ");
    expect(generate.mock.calls[1][0].retryTransient).toBe(false);
    expect(result.warnings).toContain(
      "動画内容を解析できなかったため、概要欄の情報のみから作成しています。",
    );
    expect(result.draft.source).toEqual({
      type: "youtube",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
  });

  it("accepts description-only fallback with named items and no steps", async () => {
    const generate = vi.fn<RecipeGenerator["generate"]>();
    generate
      .mockRejectedValueOnce(new ApiError("AI_UNAVAILABLE", "failed", 503, true))
      .mockResolvedValueOnce(modelOutput({
        draft: recipeDraft({
          ingredients: [],
          seasonings: [{
            id: "seasoning-1",
            name: "醤油",
            amountText: "大さじ1",
            numericAmount: 1,
            unit: "大さじ",
            note: "",
          }],
          steps: [],
        }),
      }));
    const service = createAiRecipeService({
      generator: { generate },
      youtubeSnippetFetcher: async () => ({
        title: "よだれ鶏風だれ",
        description: "醤油 大さじ1\n酢 大さじ1",
        channelTitle: "料理チャンネル",
        warnings: [],
      }),
    });

    const result = await service.extract({
      type: "youtube",
      url: "https://youtu.be/dQw4w9WgXcQ",
    });

    expect(result.draft.steps).toEqual([]);
    expect(result.draft.ingredients).toEqual([]);
    expect(result.draft.seasonings).toHaveLength(1);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("accepts description-only fallback with steps and no named items", async () => {
    const generate = vi.fn<RecipeGenerator["generate"]>();
    generate
      .mockRejectedValueOnce(new ApiError("AI_UNAVAILABLE", "failed", 503, true))
      .mockResolvedValueOnce(modelOutput({
        draft: recipeDraft({
          ingredients: [],
          seasonings: [],
          steps: [{
            id: "step-1",
            order: 1,
            text: "弱火で加熱する。",
            ingredientRefs: [],
            timers: [],
          }],
        }),
      }));
    const service = createAiRecipeService({
      generator: { generate },
      youtubeSnippetFetcher: async () => ({
        title: "加熱手順",
        description: "作り方: 弱火で加熱する。",
        channelTitle: "料理チャンネル",
        warnings: [],
      }),
    });

    const result = await service.extract({
      type: "youtube",
      url: "https://youtu.be/dQw4w9WgXcQ",
    });

    expect(result.draft.ingredients).toEqual([]);
    expect(result.draft.steps).toHaveLength(1);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("does not fabricate a fallback when video analysis fails and the description is empty", async () => {
    const generate = vi.fn<RecipeGenerator["generate"]>(async () => {
      throw new ApiError("AI_UNAVAILABLE", "failed", 503, true);
    });
    const service = createAiRecipeService({
      generator: { generate },
      youtubeSnippetFetcher: async () => ({
        title: "料理動画",
        description: "",
        channelTitle: "料理チャンネル",
        warnings: ["YouTubeの概要欄は空でした。"],
      }),
    });

    await expect(service.extract({
      type: "youtube",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    })).rejects.toMatchObject({ code: "YOUTUBE_VIDEO_ANALYSIS_FAILED" });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("rejects video analysis failure when the description-only draft is insufficient", async () => {
    const generate = vi.fn<RecipeGenerator["generate"]>();
    generate
      .mockRejectedValueOnce(new ApiError("AI_UNAVAILABLE", "failed", 503, true))
      .mockResolvedValueOnce(modelOutput({
        draft: recipeDraft({ title: "", ingredients: [], steps: [] }),
      }));
    const service = createAiRecipeService({
      generator: { generate },
      youtubeSnippetFetcher: async () => ({
        title: "料理動画",
        description: "詳しくは動画をご覧ください。",
        channelTitle: "料理チャンネル",
        warnings: [],
      }),
    });

    await expect(service.extract({
      type: "youtube",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    })).rejects.toMatchObject({
      code: "YOUTUBE_VIDEO_ANALYSIS_FAILED",
      message: "このYouTube動画をAIで解析できませんでした。",
    });
  });

  it("does not retry a video request after Gemini quota exhaustion", async () => {
    const generate = vi.fn<RecipeGenerator["generate"]>(async () => {
      throw new ApiError("AI_LIMIT_REACHED", "limited", 429, true);
    });
    const service = createAiRecipeService({
      generator: { generate },
      youtubeSnippetFetcher: async () => ({
        title: "親子丼",
        description: "材料: 卵2個",
        channelTitle: "料理チャンネル",
        warnings: [],
      }),
    });

    await expect(service.extract({
      type: "youtube",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    })).rejects.toMatchObject({ code: "AI_LIMIT_REACHED" });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid YouTube URL before calling Gemini", async () => {
    const generate = vi.fn<RecipeGenerator["generate"]>(async () => modelOutput());
    const service = createAiRecipeService({ generator: { generate } });

    await expect(service.extract({ type: "youtube", url: "https://youtube.com/watch?v=invalid" }))
      .rejects.toMatchObject({ code: "YOUTUBE_INVALID_URL" });
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
