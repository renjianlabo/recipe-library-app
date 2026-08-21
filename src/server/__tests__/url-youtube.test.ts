import { afterEach, describe, expect, it, vi } from "vitest";

import { assertSafePublicUrl, isPrivateOrReservedIp } from "../url-safety";
import { createYouTubeSnippetFetcher, extractYouTubeVideoId } from "../youtube";

describe("safe URL validation", () => {
  it("rejects localhost, literal private IPs, private DNS answers and unsupported schemes", async () => {
    await expect(assertSafePublicUrl("http://localhost/recipe"))
      .rejects.toMatchObject({ code: "URL_UNSAFE" });
    await expect(assertSafePublicUrl("http://169.254.169.254/latest/meta-data"))
      .rejects.toMatchObject({ code: "URL_UNSAFE" });
    await expect(assertSafePublicUrl("file:///etc/passwd"))
      .rejects.toMatchObject({ code: "URL_UNSAFE" });
    await expect(assertSafePublicUrl("https://recipe.example/item", {
      lookup: async () => ["10.0.0.8"],
    })).rejects.toMatchObject({ code: "URL_UNSAFE" });
    expect(isPrivateOrReservedIp("::1")).toBe(true);
  });

  it("accepts a public http(s) URL after DNS validation and removes fragments", async () => {
    const result = await assertSafePublicUrl("https://recipe.example/path#ingredients", {
      lookup: async () => ["93.184.216.34"],
    });
    expect(result.href).toBe("https://recipe.example/path");
  });
});

describe("YouTube integration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ?t=10",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://m.youtube.com/live/dQw4w9WgXcQ",
  ])("extracts a safe video id from %s", (url) => {
    expect(extractYouTubeVideoId(url)).toEqual({
      videoId: "dQw4w9WgXcQ",
      url,
    });
  });

  it("does not accept look-alike hosts or guessed IDs", () => {
    for (const url of [
      "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ",
      "https://youtube.com/watch?v=too-short",
    ]) {
      let error: unknown;
      try {
        extractYouTubeVideoId(url);
      } catch (caught) {
        error = caught;
      }
      expect(error).toMatchObject({ code: "YOUTUBE_INVALID_URL" });
    }
  });

  it("requests and returns title, description and channel metadata", async () => {
    let requestedUrl: URL | undefined;
    const successFetch: typeof fetch = async (input) => {
      requestedUrl = new URL(input instanceof Request ? input.url : String(input));
      return new Response(JSON.stringify({
        items: [{
          id: "dQw4w9WgXcQ",
          snippet: {
            title: "親子丼の作り方",
            description: "材料: 卵2個",
            channelTitle: "料理チャンネル",
          },
        }],
      }), { status: 200 });
    };
    const fetchDescription = createYouTubeSnippetFetcher({ apiKey: "test", fetchImpl: successFetch });
    await expect(fetchDescription("dQw4w9WgXcQ")).resolves.toEqual({
      title: "親子丼の作り方",
      description: "材料: 卵2個",
      channelTitle: "料理チャンネル",
      warnings: [],
    });
    if (!requestedUrl) throw new Error("YouTube Data API was not called");
    expect(requestedUrl.origin + requestedUrl.pathname)
      .toBe("https://www.googleapis.com/youtube/v3/videos");
    expect(requestedUrl.searchParams.get("part")).toBe("snippet");
    expect(requestedUrl.searchParams.get("id")).toBe("dQw4w9WgXcQ");
    expect(requestedUrl.searchParams.get("fields"))
      .toBe("items(id,snippet(title,description,channelTitle))");
  });

  it("warns honestly when the description is empty", async () => {
    const emptyFetch: typeof fetch = async () => new Response(JSON.stringify({
      items: [{
        id: "dQw4w9WgXcQ",
        snippet: { title: "料理動画", description: "  ", channelTitle: "料理チャンネル" },
      }],
    }), { status: 200 });
    const empty = await createYouTubeSnippetFetcher({ apiKey: "test", fetchImpl: emptyFetch })("dQw4w9WgXcQ");
    expect(empty.description).toBe("");
    expect(empty.warnings[0]).toContain("概要欄は空");
  });

  it("fails before fetch when YOUTUBE_DATA_API_KEY is missing", async () => {
    vi.stubEnv("YOUTUBE_DATA_API_KEY", "");
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(createYouTubeSnippetFetcher({ fetchImpl })("dQw4w9WgXcQ"))
      .rejects.toMatchObject({
        code: "YOUTUBE_NOT_CONFIGURED",
        message: "YouTube情報取得機能が設定されていません。",
      });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails instead of fabricating a missing or failed video", async () => {
    const notFoundFetch: typeof fetch = async () => new Response(JSON.stringify({ items: [] }), { status: 200 });
    await expect(createYouTubeSnippetFetcher({ apiKey: "test", fetchImpl: notFoundFetch })("dQw4w9WgXcQ"))
      .rejects.toMatchObject({
        code: "YOUTUBE_VIDEO_NOT_FOUND",
        message: "YouTube動画の情報を取得できませんでした。",
      });

    const failedFetch: typeof fetch = async () => new Response("quota", { status: 403 });
    await expect(createYouTubeSnippetFetcher({ apiKey: "test", fetchImpl: failedFetch })("dQw4w9WgXcQ"))
      .rejects.toMatchObject({
        code: "YOUTUBE_FETCH_FAILED",
        message: "YouTube動画の情報を取得できませんでした。",
      });
  });
});
